package main

// Чат за столом: последние 60 сообщений хранятся в памяти стола,
// новые рассылаются всем сидящим отдельным сообщением {t:"chat"}.

import (
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type ChatMsg struct {
	ID   int    `json:"id"`
	From string `json:"from"` // id игрока
	Who  string `json:"who"`  // имя на момент отправки
	Text string `json:"text"`
	At   int64  `json:"at"` // unix ms
}

const (
	chatKeep   = 60
	chatMaxLen = 300
	chatGap    = 400 * time.Millisecond
)

func cleanChat(s string) string {
	s = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\t' {
			return ' '
		}
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, s)
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > chatMaxLen {
		s = string([]rune(s)[:chatMaxLen])
	}
	return s
}

// chatSay вызывается под r.mu.
func (r *Room) chatSay(p *Player, text string) error {
	text = cleanChat(text)
	if text == "" {
		return nil
	}
	now := time.Now()
	if now.Sub(p.lastChat) < chatGap {
		return errors.New("Не так быстро: подождите секунду")
	}
	p.lastChat = now
	r.chatSeq++
	msg := ChatMsg{ID: r.chatSeq, From: p.ID, Who: p.Name, Text: text, At: now.UnixMilli()}
	r.chat = append(r.chat, msg)
	if len(r.chat) > chatKeep {
		r.chat = append([]ChatMsg(nil), r.chat[len(r.chat)-chatKeep:]...)
	}
	for _, q := range r.players {
		if q.client != nil {
			q.client.push(map[string]any{"t": "chat", "msg": msg})
		}
	}
	return nil
}
