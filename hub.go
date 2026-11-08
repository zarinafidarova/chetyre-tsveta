package main

// Столы, подключения и протокол сообщений.
//
// Клиент → сервер (JSON):
//   {t:"hello", code, secret}      — вернуться за стол после перезагрузки
//   {t:"create", name}             — создать стол
//   {t:"join", code, name}         — сесть за стол
//   {t:"addbot"} {t:"kick", id}    — хозяин в лобби
//   {t:"start"}                    — хозяин раздаёт (и «ещё партия»)
//   {t:"play", card, color, last}  — сыграть карту (last = нажал «Последняя карта!»)
//   {t:"draw"} {t:"pass"}          — взять карту / спасовать
//   {t:"skip"}                     — хозяин пропускает ход зависшего игрока
//   {t:"leave"}                    — встать из-за стола
// Сервер → клиент:
//   {t:"joined", code, secret}  {t:"state", ...}  {t:"home"}  {t:"error", msg}

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	mrand "math/rand/v2"
	"strings"
	"sync"
	"time"
)

type Hub struct {
	mu    sync.Mutex
	rooms map[string]*Room
}

func newHub() *Hub {
	h := &Hub{rooms: map[string]*Room{}}
	go h.janitor()
	return h
}

func randHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (h *Hub) create() *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	const letters = "ABCDEFGHJKLMNPRSTUVWXYZ"
	for {
		b := make([]byte, 4)
		for i := range b {
			b[i] = letters[mrand.IntN(len(letters))]
		}
		code := string(b)
		if _, taken := h.rooms[code]; !taken {
			r := &Room{hub: h, Code: code, Status: "lobby", dir: 1, lastSeen: time.Now()}
			h.rooms[code] = r
			return r
		}
	}
}

func (h *Hub) get(code string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.rooms[strings.ToUpper(strings.TrimSpace(code))]
}

func (h *Hub) remove(r *Room) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[r.Code] == r {
		delete(h.rooms, r.Code)
	}
}

// janitor удаляет столы, где давно никого нет онлайн.
func (h *Hub) janitor() {
	for range time.Tick(time.Minute) {
		h.mu.Lock()
		rooms := make([]*Room, 0, len(h.rooms))
		for _, r := range h.rooms {
			rooms = append(rooms, r)
		}
		h.mu.Unlock()
		for _, r := range rooms {
			r.mu.Lock()
			online := false
			for _, p := range r.players {
				if p.client != nil {
					online = true
				}
			}
			if online {
				r.lastSeen = time.Now()
			} else if time.Since(r.lastSeen) > 30*time.Minute {
				r.closed = true
				h.remove(r)
			}
			r.mu.Unlock()
		}
	}
}

// ---------- клиент ----------

type Client struct {
	hub    *Hub
	ws     *WSConn
	send   chan []byte
	room   *Room
	player *Player
	done   chan struct{}
	once   sync.Once
}

type inMsg struct {
	T      string `json:"t"`
	Code   string `json:"code"`
	Secret string `json:"secret"`
	Name   string `json:"name"`
	ID     string `json:"id"`
	Card   int    `json:"card"`
	Color  string `json:"color"`
	Last   bool   `json:"last"`
	Text   string `json:"text"`
}

func (c *Client) push(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case c.send <- b:
	case <-c.done:
	default:
		c.close() // клиент не успевает читать — отключаем
	}
}

func (c *Client) close() {
	c.once.Do(func() { close(c.done); c.ws.Close() })
}

func (c *Client) writer() {
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case b := <-c.send:
			if err := c.ws.WriteText(b); err != nil {
				c.close()
				return
			}
		case <-ping.C:
			if err := c.ws.Ping(); err != nil {
				c.close()
				return
			}
		case <-c.done:
			return
		}
	}
}

func serveClient(h *Hub, ws *WSConn) {
	c := &Client{hub: h, ws: ws, send: make(chan []byte, 64), done: make(chan struct{})}
	go c.writer()
	defer c.disconnect()
	for {
		raw, err := ws.ReadMessage()
		if err != nil {
			return
		}
		var m inMsg
		if json.Unmarshal(raw, &m) != nil {
			continue
		}
		c.handle(m)
	}
}

func (c *Client) errorMsg(msg string) { c.push(map[string]string{"t": "error", "msg": msg}) }

func (c *Client) handle(m inMsg) {
	switch m.T {
	case "hello":
		r := c.hub.get(m.Code)
		if r == nil || m.Secret == "" {
			c.push(map[string]string{"t": "home"})
			return
		}
		r.mu.Lock()
		var p *Player
		for _, q := range r.players {
			if q.Secret == m.Secret {
				p = q
			}
		}
		if p == nil || r.closed {
			r.mu.Unlock()
			c.push(map[string]string{"t": "home"})
			return
		}
		c.attach(r, p)
		r.changed()
		r.mu.Unlock()
		return

	case "create":
		c.leaveCurrent()
		r := c.hub.create()
		r.mu.Lock()
		p := &Player{ID: randHex(4), Secret: randHex(16), Name: cleanName(m.Name)}
		r.players = append(r.players, p)
		r.Host = p.ID
		c.attach(r, p)
		c.push(map[string]string{"t": "joined", "code": r.Code, "secret": p.Secret})
		r.changed()
		r.mu.Unlock()
		return

	case "join":
		r := c.hub.get(m.Code)
		if r == nil {
			c.errorMsg("Стол с таким кодом не найден")
			return
		}
		if c.room == r {
			return
		}
		c.leaveCurrent()
		r.mu.Lock()
		if r.closed {
			r.mu.Unlock()
			c.errorMsg("Стол с таким кодом не найден")
			return
		}
		if len(r.players) >= maxPlayers {
			r.mu.Unlock()
			c.errorMsg("За этим столом уже 10 игроков")
			return
		}
		p := &Player{ID: randHex(4), Secret: randHex(16), Name: cleanName(m.Name)}
		r.players = append(r.players, p)
		if r.Host == "" {
			r.Host = p.ID
		}
		c.attach(r, p)
		c.push(map[string]string{"t": "joined", "code": r.Code, "secret": p.Secret})
		r.changed()
		r.mu.Unlock()
		return
	}

	// остальные команды — только за столом
	r, p := c.room, c.player
	if r == nil || p == nil {
		c.push(map[string]string{"t": "home"})
		return
	}
	if m.T == "leave" {
		c.leaveCurrent()
		c.push(map[string]string{"t": "home"})
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.findPlayer(p.ID) == nil { // убрали со стола, пока были офлайн
		c.room, c.player = nil, nil
		c.push(map[string]string{"t": "home"})
		return
	}
	if m.T == "chat" {
		if err := r.chatSay(p, m.Text); err != nil {
			c.errorMsg(err.Error())
		}
		return
	}
	isHost := r.Host == p.ID
	var err error
	switch m.T {
	case "start":
		if !isHost {
			err = errNotHost
		} else if r.Status == "playing" {
			err = errNotPlaying
		} else {
			err = r.startRound()
		}
	case "addbot":
		switch {
		case !isHost:
			err = errNotHost
		case len(r.players) >= maxPlayers:
			err = errTableFull
		default:
			r.players = append(r.players, &Player{ID: randHex(4), Name: r.botName(), Bot: true})
		}
	case "kick":
		if !isHost {
			err = errNotHost
		} else if q := r.findPlayer(m.ID); q != nil && q != p && r.Status != "playing" {
			if q.client != nil {
				q.client.room, q.client.player = nil, nil
				q.client.push(map[string]string{"t": "home"})
				q.client = nil
			}
			r.removePlayer(q)
		}
	case "play":
		err = r.play(p, m.Card, m.Color, m.Last)
	case "draw":
		err = r.drawCard(p)
	case "pass":
		err = r.pass(p, "pass")
	case "skip":
		if !isHost {
			err = errNotHost
		} else if cur := r.current(); cur == nil || cur == p {
			err = errNotPlaying
		} else if time.Since(r.turnAt) < skipAfter-2*time.Second {
			err = errors.New("Пропустить ход можно, если игрок молчит больше минуты")
		} else {
			err = r.pass(cur, "skip")
		}
	default:
		return
	}
	if err != nil {
		c.errorMsg(err.Error())
		c.push(r.view(p)) // вернуть клиенту правильное состояние
		return
	}
	r.changed()
}

var errTableFull = &simpleErr{"За столом уже 10 игроков"}

type simpleErr struct{ s string }

func (e *simpleErr) Error() string { return e.s }

var botNames = []string{"Утконос", "Ёж", "Сова", "Барсук", "Выдра", "Рысь", "Бобр", "Енот", "Филин"}

func (r *Room) botName() string {
	for _, n := range botNames {
		if r.findByName(n) == nil {
			return n
		}
	}
	return "Бот"
}

func (r *Room) findByName(n string) *Player {
	for _, p := range r.players {
		if p.Name == n {
			return p
		}
	}
	return nil
}

// attach привязывает соединение к игроку (под r.mu).
func (c *Client) attach(r *Room, p *Player) {
	if old := p.client; old != nil && old != c {
		old.room, old.player = nil, nil
		old.errorMsg("Игра открыта в другой вкладке")
		old.push(map[string]string{"t": "home"})
	}
	p.client = c
	c.room, c.player = r, p
	r.lastSeen = time.Now()
	c.push(map[string]any{"t": "chatHistory", "list": r.chat})
}

func (c *Client) leaveCurrent() {
	r, p := c.room, c.player
	if r == nil {
		return
	}
	c.room, c.player = nil, nil
	r.mu.Lock()
	defer r.mu.Unlock()
	if p.client == c {
		p.client = nil
	}
	r.removePlayer(p)
	if r.humans() == 0 {
		r.closed = true
		c.hub.remove(r)
		return
	}
	r.changed()
}

func (c *Client) disconnect() {
	c.close()
	r, p := c.room, c.player
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if p.client != c {
		return
	}
	p.client = nil
	r.changed()
	// Если игрок не вернулся за 2 минуты — встаёт из-за стола.
	time.AfterFunc(2*time.Minute, func() {
		r.mu.Lock()
		defer r.mu.Unlock()
		if r.closed || p.client != nil || r.findPlayer(p.ID) == nil {
			return
		}
		r.removePlayer(p)
		if r.humans() == 0 {
			r.closed = true
			r.hub.remove(r)
			return
		}
		r.changed()
	})
}

// ---------- рассылка состояния ----------

type PlayerView struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Count   int    `json:"count"`
	Online  bool   `json:"online"`
	Bot     bool   `json:"bot"`
	InRound bool   `json:"inRound"`
	Wins    int    `json:"wins"`
}

type View struct {
	T         string       `json:"t"`
	Code      string       `json:"code"`
	Status    string       `json:"status"`
	Host      string       `json:"host"`
	You       string       `json:"you"`
	Players   []PlayerView `json:"players"`
	Order     []string     `json:"order"`
	Turn      string       `json:"turn"`
	Top       *Card        `json:"top"`
	Recent    []Card       `json:"recent"` // несколько верхних карт сброса, снизу вверх
	Color     string       `json:"color"`
	Dir       int          `json:"dir"`
	Drew      bool         `json:"drew"`
	DrawCount int          `json:"drawCount"`
	TurnIdle  int64        `json:"turnIdle"`
	LastBy    string       `json:"lastBy"` // кто положил верхнюю карту // сколько мс текущий игрок ничего не делает
	Log       []LogEntry   `json:"log"`
	Winner    string       `json:"winner"`
	Round     int          `json:"round"`
	Hand      []Card       `json:"hand"`
	Playable  []int        `json:"playable"`
}

func (r *Room) view(me *Player) View {
	v := View{T: "state", Code: r.Code, Status: r.Status, Host: r.Host, You: me.ID, Color: r.color, Dir: r.dir,
		Drew: r.drew, DrawCount: len(r.draw), Log: r.log, Winner: r.winner, Round: r.round,
		Players: []PlayerView{}, Order: []string{}, Hand: []Card{}, Playable: []int{}}
	inRound := map[*Player]bool{}
	if r.Status != "lobby" {
		for _, p := range r.order {
			inRound[p] = true
			v.Order = append(v.Order, p.ID)
		}
		if len(r.discard) > 0 {
			t := r.top()
			v.Top = &t
			from := len(r.discard) - 4
			if from < 0 {
				from = 0
			}
			v.Recent = r.discard[from:]
			v.LastBy = r.lastBy
		}
		if cur := r.current(); cur != nil {
			v.Turn = cur.ID
			v.TurnIdle = time.Since(r.turnAt).Milliseconds()
		}
	}
	for _, p := range r.players {
		v.Players = append(v.Players, PlayerView{ID: p.ID, Name: p.Name, Count: len(p.Hand), Online: p.Bot || p.client != nil,
			Bot: p.Bot, InRound: inRound[p], Wins: p.Wins})
	}
	if inRound[me] {
		v.Hand = me.Hand
		if r.current() == me {
			for _, c := range me.Hand {
				if r.canPlay(c) {
					v.Playable = append(v.Playable, c.ID)
				}
			}
		}
	}
	return v
}

// changed рассылает состояние всем и, если ходит бот, планирует его ход (под r.mu).
func (r *Room) changed() {
	r.seq++
	for _, p := range r.players {
		if p.client != nil {
			p.client.push(r.view(p))
		}
	}
	if cur := r.current(); cur != nil && cur.Bot {
		seq := r.seq
		delay := time.Duration(700+mrand.IntN(600)) * time.Millisecond
		time.AfterFunc(delay, func() {
			r.mu.Lock()
			defer r.mu.Unlock()
			if r.closed || r.seq != seq || r.current() != cur {
				return
			}
			r.botMove(cur)
			r.changed()
		})
	}
}

func init() { log.SetFlags(log.LstdFlags | log.Lshortfile) }
