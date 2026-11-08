package main

import "testing"

func TestCardPoints(t *testing.T) {
	cases := map[string]int{"0": 0, "7": 7, "9": 9, "D": 20, "S": 20, "R": 20, "W": 50, "F": 50}
	for v, want := range cases {
		if got := cardPoints(Card{C: "r", V: v}); got != want {
			t.Errorf("%s: %d, ждали %d", v, got, want)
		}
	}
}

func TestFinishAddsOpponentsCards(t *testing.T) {
	w := &Player{ID: "w", Name: "Аня", Points: 10}
	a := &Player{ID: "a", Hand: []Card{{C: "r", V: "7"}, {C: "w", V: "F"}}}  // 7 + 50
	b := &Player{ID: "b", Hand: []Card{{C: "g", V: "D"}, {C: "b", V: "0"}}} // 20 + 0
	r := &Room{players: []*Player{w, a, b}, order: []*Player{w, a, b}, Status: "playing"}
	r.finish(w)
	if r.gain != 77 || w.Points != 87 {
		t.Fatalf("gain=%d points=%d, ждали 77 и 87", r.gain, w.Points)
	}
	if a.Points != 0 || b.Points != 0 {
		t.Fatalf("проигравшим очки не начисляются")
	}
}
