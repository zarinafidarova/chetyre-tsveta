package main

// Минимальная реализация WebSocket (RFC 6455) на стандартной библиотеке:
// рукопожатие, чтение кадров от браузера (с маской, с фрагментацией),
// отправка текстовых кадров, ping/pong и close. Этого достаточно для игры,
// и проект собирается без внешних зависимостей.

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	wsGUID      = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	wsMaxMsg    = 64 << 10
	opCont      = 0x0
	opText      = 0x1
	opBinary    = 0x2
	opClose     = 0x8
	opPing      = 0x9
	opPong      = 0xA
	readTimeout = 75 * time.Second
)

type WSConn struct {
	c   net.Conn
	br  *bufio.Reader
	wmu sync.Mutex
}

func headerHas(h http.Header, key, val string) bool {
	for _, s := range h.Values(key) {
		for _, part := range strings.Split(s, ",") {
			if strings.EqualFold(strings.TrimSpace(part), val) {
				return true
			}
		}
	}
	return false
}

func upgrade(w http.ResponseWriter, r *http.Request) (*WSConn, error) {
	if !headerHas(r.Header, "Connection", "upgrade") || !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		http.Error(w, "expected websocket", http.StatusBadRequest)
		return nil, errors.New("not a websocket request")
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		http.Error(w, "missing key", http.StatusBadRequest)
		return nil, errors.New("missing Sec-WebSocket-Key")
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "hijack unsupported", http.StatusInternalServerError)
		return nil, errors.New("hijack unsupported")
	}
	conn, brw, err := hj.Hijack()
	if err != nil {
		return nil, err
	}
	sum := sha1.Sum([]byte(key + wsGUID))
	accept := base64.StdEncoding.EncodeToString(sum[:])
	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
	if _, err := brw.WriteString(resp); err != nil {
		conn.Close()
		return nil, err
	}
	if err := brw.Flush(); err != nil {
		conn.Close()
		return nil, err
	}
	return &WSConn{c: conn, br: brw.Reader}, nil
}

// ReadMessage возвращает следующее текстовое или бинарное сообщение.
// Ping отвечает сам, на close возвращает io.EOF.
func (ws *WSConn) ReadMessage() ([]byte, error) {
	var msg []byte
	for {
		ws.c.SetReadDeadline(time.Now().Add(readTimeout))
		var hdr [2]byte
		if _, err := io.ReadFull(ws.br, hdr[:]); err != nil {
			return nil, err
		}
		fin := hdr[0]&0x80 != 0
		op := hdr[0] & 0x0f
		masked := hdr[1]&0x80 != 0
		n := uint64(hdr[1] & 0x7f)
		switch n {
		case 126:
			var b [2]byte
			if _, err := io.ReadFull(ws.br, b[:]); err != nil {
				return nil, err
			}
			n = uint64(binary.BigEndian.Uint16(b[:]))
		case 127:
			var b [8]byte
			if _, err := io.ReadFull(ws.br, b[:]); err != nil {
				return nil, err
			}
			n = binary.BigEndian.Uint64(b[:])
		}
		if n > wsMaxMsg || uint64(len(msg))+n > wsMaxMsg {
			return nil, errors.New("message too large")
		}
		var mask [4]byte
		if masked {
			if _, err := io.ReadFull(ws.br, mask[:]); err != nil {
				return nil, err
			}
		}
		payload := make([]byte, n)
		if _, err := io.ReadFull(ws.br, payload); err != nil {
			return nil, err
		}
		if masked {
			for i := range payload {
				payload[i] ^= mask[i%4]
			}
		}
		switch op {
		case opClose:
			code := payload
			if len(code) > 2 {
				code = code[:2]
			}
			ws.writeFrame(opClose, code)
			return nil, io.EOF
		case opPing:
			if err := ws.writeFrame(opPong, payload); err != nil {
				return nil, err
			}
		case opPong:
			// ничего не делаем: дедлайн чтения уже продлён
		case opCont, opText, opBinary:
			msg = append(msg, payload...)
			if fin {
				return msg, nil
			}
		default:
			return nil, errors.New("unknown opcode")
		}
	}
}

func (ws *WSConn) writeFrame(op byte, p []byte) error {
	ws.wmu.Lock()
	defer ws.wmu.Unlock()
	hdr := make([]byte, 0, 10)
	hdr = append(hdr, 0x80|op)
	switch l := len(p); {
	case l < 126:
		hdr = append(hdr, byte(l))
	case l <= 0xFFFF:
		hdr = append(hdr, 126, byte(l>>8), byte(l))
	default:
		var b [8]byte
		binary.BigEndian.PutUint64(b[:], uint64(l))
		hdr = append(hdr, 127)
		hdr = append(hdr, b[:]...)
	}
	ws.c.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if _, err := ws.c.Write(append(hdr, p...)); err != nil {
		return err
	}
	return nil
}

func (ws *WSConn) WriteText(p []byte) error { return ws.writeFrame(opText, p) }
func (ws *WSConn) Ping() error              { return ws.writeFrame(opPing, nil) }
func (ws *WSConn) Close() error             { return ws.c.Close() }
