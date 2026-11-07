package main

// Правила игры и состояние одного стола. Все методы Room вызываются
// под r.mu (кроме тех, что сами его берут — они помечены).

import (
	"errors"
	"math/rand/v2"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type Card struct {
	ID int    `json:"id"`
	C  string `json:"c"` // r y g b w
	V  string `json:"v"` // 0-9, S (пропуск), R (разворот), D (+2), W (заказ цвета), F (+4)
}

func newDeck() []Card {
	d := make([]Card, 0, 108)
	id := 0
	add := func(c, v string) { id++; d = append(d, Card{ID: id, C: c, V: v}) }
	for _, c := range []string{"r", "y", "g", "b"} {
		add(c, "0")
		for _, v := range []string{"1", "2", "3", "4", "5", "6", "7", "8", "9", "S", "R", "D"} {
			add(c, v)
			add(c, v)
		}
	}
	for i := 0; i < 4; i++ {
		add("w", "W")
		add("w", "F")
	}
	rand.Shuffle(len(d), func(i, j int) { d[i], d[j] = d[j], d[i] })
	return d
}

func isNumber(v string) bool { return len(v) == 1 && v[0] >= '0' && v[0] <= '9' }

type Player struct {
	ID       string
	Secret   string
	Name     string
	Bot      bool
	Hand     []Card
	Wins     int
	client   *Client
	lastChat time.Time
}

type LogEntry struct {
	K    string `json:"k"`
	Who  string `json:"who,omitempty"`
	Card *Card  `json:"card,omitempty"`
	Col  string `json:"col,omitempty"`
	N    int    `json:"n,omitempty"`
}

type Room struct {
	mu       sync.Mutex
	hub      *Hub
	Code     string
	Host     string
	Status   string    // lobby | playing | finished
	players  []*Player // все за столом в порядке прихода
	order    []*Player // участники текущей партии
	draw     []Card
	discard  []Card
	color    string
	dir      int
	turn     int
	drew     bool
	log      []LogEntry
	winner   string
	round    int
	seq      int // растёт при каждом изменении, чтобы таймеры ботов не срабатывали на устаревшем состоянии
	lastSeen time.Time
	closed   bool
	chat     []ChatMsg
	turnAt   time.Time // когда текущий игрок получил ход или последний раз что-то сделал
	chatSeq  int
}

var (
	errNotYourTurn = errors.New("Сейчас не ваш ход")
	errNotPlaying  = errors.New("Партия сейчас не идёт")
	errNotHost     = errors.New("Это может сделать только хозяин стола")
)

const maxPlayers = 10

// Через столько молчания текущего игрока хозяин стола может пропустить его ход.
const skipAfter = 60 * time.Second

// touch отмечает, что текущий игрок только что получил ход или сделал действие.
func (r *Room) touch() { r.turnAt = time.Now() }

func cleanName(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Map(func(r rune) rune {
		if r < 32 {
			return -1
		}
		return r
	}, s)
	if utf8.RuneCountInString(s) > 20 {
		s = string([]rune(s)[:20])
	}
	if s == "" {
		s = "Игрок"
	}
	return s
}

func (r *Room) top() Card { return r.discard[len(r.discard)-1] }

func (r *Room) canPlay(c Card) bool {
	return c.C == "w" || c.C == r.color || c.V == r.top().V
}

func (r *Room) current() *Player {
	if r.Status != "playing" || len(r.order) == 0 {
		return nil
	}
	return r.order[r.turn]
}

func (r *Room) idxAt(steps int) int {
	n := len(r.order)
	return (((r.turn + r.dir*steps) % n) + n) % n
}

func (r *Room) addLog(e LogEntry) {
	r.log = append([]LogEntry{e}, r.log...)
	if len(r.log) > 8 {
		r.log = r.log[:8]
	}
}

func (r *Room) drawFrom(n int) []Card {
	got := make([]Card, 0, n)
	for i := 0; i < n; i++ {
		if len(r.draw) == 0 {
			if len(r.discard) <= 1 {
				break
			}
			t := r.top()
			r.draw = append([]Card(nil), r.discard[:len(r.discard)-1]...)
			rand.Shuffle(len(r.draw), func(a, b int) { r.draw[a], r.draw[b] = r.draw[b], r.draw[a] })
			r.discard = []Card{t}
		}
		c := r.draw[len(r.draw)-1]
		r.draw = r.draw[:len(r.draw)-1]
		got = append(got, c)
	}
	return got
}

func (r *Room) findPlayer(id string) *Player {
	for _, p := range r.players {
		if p.ID == id {
			return p
		}
	}
	return nil
}

func (r *Room) humans() int {
	n := 0
	for _, p := range r.players {
		if !p.Bot {
			n++
		}
	}
	return n
}

func (r *Room) startRound() error {
	order := r.players
	if len(order) > maxPlayers {
		order = order[:maxPlayers]
	}
	if len(order) < 2 {
		return errors.New("Нужно хотя бы два игрока")
	}
	r.order = append([]*Player(nil), order...)
	r.draw = newDeck()
	r.discard = nil
	for _, p := range r.order {
		p.Hand = append([]Card(nil), r.draw[len(r.draw)-7:]...)
		r.draw = r.draw[:len(r.draw)-7]
	}
	// первая карта сброса — обязательно цифра
	for {
		c := r.draw[len(r.draw)-1]
		r.draw = r.draw[:len(r.draw)-1]
		if isNumber(c.V) {
			r.discard = []Card{c}
			break
		}
		r.draw = append([]Card{c}, r.draw...)
	}
	r.color = r.discard[0].C
	r.dir = 1
	r.round++
	r.turn = (r.round - 1) % len(r.order)
	r.drew = false
	r.winner = ""
	r.log = nil
	r.Status = "playing"
	r.touch()
	r.addLog(LogEntry{K: "start"})
	return nil
}

func (r *Room) play(p *Player, cardID int, color string, last bool) error {
	if r.Status != "playing" {
		return errNotPlaying
	}
	if r.current() != p {
		return errNotYourTurn
	}
	idx := -1
	for i, c := range p.Hand {
		if c.ID == cardID {
			idx = i
		}
	}
	if idx < 0 {
		return errors.New("Такой карты у вас нет")
	}
	card := p.Hand[idx]
	if !r.canPlay(card) {
		return errors.New("Эту карту сейчас положить нельзя")
	}
	if card.C == "w" && (len(color) != 1 || !strings.Contains("rygb", color)) {
		return errors.New("Выберите цвет")
	}
	p.Hand = append(p.Hand[:idx], p.Hand[idx+1:]...)
	r.discard = append(r.discard, card)
	cc := card
	if card.C == "w" {
		r.color = color
		r.addLog(LogEntry{K: "play", Who: p.Name, Card: &cc, Col: color})
	} else {
		r.color = card.C
		r.addLog(LogEntry{K: "play", Who: p.Name, Card: &cc})
	}

	adv := 1
	switch card.V {
	case "S":
		adv = 2
		r.addLog(LogEntry{K: "blocked", Who: r.order[r.idxAt(1)].Name})
	case "R":
		if len(r.order) == 2 {
			adv = 2
		} else {
			r.dir = -r.dir
		}
		r.addLog(LogEntry{K: "rev"})
	case "D", "F":
		victim := r.order[r.idxAt(1)]
		k := 2
		if card.V == "F" {
			k = 4
		}
		victim.Hand = append(victim.Hand, r.drawFrom(k)...)
		adv = 2
		r.addLog(LogEntry{K: "hit", Who: victim.Name, N: k})
	}

	if len(p.Hand) == 0 {
		r.finish(p)
		return nil
	}
	if len(p.Hand) == 1 {
		if last {
			r.addLog(LogEntry{K: "last", Who: p.Name})
		} else {
			p.Hand = append(p.Hand, r.drawFrom(2)...)
			r.addLog(LogEntry{K: "pen", Who: p.Name})
		}
	}
	r.turn = r.idxAt(adv)
	r.drew = false
	r.touch()
	return nil
}

func (r *Room) finish(w *Player) {
	r.Status = "finished"
	r.winner = w.ID
	w.Wins++
	r.addLog(LogEntry{K: "win", Who: w.Name})
}

func (r *Room) drawCard(p *Player) error {
	if r.Status != "playing" {
		return errNotPlaying
	}
	if r.current() != p {
		return errNotYourTurn
	}
	if r.drew {
		return errors.New("Вы уже взяли карту: сыграйте или спасуйте")
	}
	p.Hand = append(p.Hand, r.drawFrom(1)...)
	r.drew = true
	r.touch()
	r.addLog(LogEntry{K: "draw", Who: p.Name})
	return nil
}

func (r *Room) pass(p *Player, kind string) error {
	if r.Status != "playing" {
		return errNotPlaying
	}
	if kind == "pass" && (r.current() != p || !r.drew) {
		return errors.New("Спасовать можно только после того, как взяли карту")
	}
	r.addLog(LogEntry{K: kind, Who: r.current().Name})
	r.turn = r.idxAt(1)
	r.drew = false
	r.touch()
	return nil
}

// removePlayer убирает игрока со стола; во время партии его карты уходят под колоду.
func (r *Room) removePlayer(p *Player) {
	for i, q := range r.order {
		if q != p {
			continue
		}
		r.draw = append(append([]Card(nil), p.Hand...), r.draw...)
		p.Hand = nil
		r.order = append(r.order[:i], r.order[i+1:]...)
		if r.Status == "playing" {
			r.addLog(LogEntry{K: "left", Who: p.Name})
			n := len(r.order)
			if n < 2 {
				if n == 1 {
					r.finish(r.order[0])
				} else {
					r.Status = "lobby"
				}
			} else if i < r.turn {
				r.turn--
			} else if i == r.turn {
				if r.dir == 1 {
					r.turn = i % n
				} else {
					r.turn = (i - 1 + n) % n
				}
				r.drew = false
				r.touch()
			}
		}
		break
	}
	for i, q := range r.players {
		if q == p {
			r.players = append(r.players[:i], r.players[i+1:]...)
			break
		}
	}
	if r.Host == p.ID {
		r.Host = ""
		for _, q := range r.players {
			if !q.Bot {
				r.Host = q.ID
				break
			}
		}
	}
}

// botMove делает один ход за бота.
func (r *Room) botMove(p *Player) {
	var ok []int
	for i, c := range p.Hand {
		if r.canPlay(c) {
			ok = append(ok, i)
		}
	}
	if len(ok) == 0 {
		if r.drew {
			r.pass(p, "pass")
		} else {
			r.drawCard(p)
		}
		return
	}
	pick := ok[0]
	for _, i := range ok { // сначала обычные карты, «дикие» приберегаем
		if p.Hand[i].C != "w" {
			pick = i
			break
		}
	}
	card := p.Hand[pick]
	color := ""
	if card.C == "w" {
		cnt := map[string]int{}
		for _, c := range p.Hand {
			if c.C != "w" {
				cnt[c.C]++
			}
		}
		color = []string{"r", "y", "g", "b"}[rand.IntN(4)]
		best := 0
		for _, c := range []string{"r", "y", "g", "b"} {
			if cnt[c] > best {
				best, color = cnt[c], c
			}
		}
	}
	r.play(p, card.ID, color, rand.Float64() < 0.85)
}
