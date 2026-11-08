import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useGame } from './useGame.js'
import { Card, CardBack, COLOR_NAME, GOLD, Glow, HEX, INK, Paint, cardLabel } from './Card.jsx'
import { ChatPanel } from './Chat.jsx'

const COLOR_VAR = { r: 'var(--red)', y: 'var(--yellow)', g: 'var(--green)', b: 'var(--blue)' }
// Через сколько молчания игрока хозяину стола показывается «Пропустить ход» (как на сервере).
const SKIP_AFTER_MS = 60_000
const SEAT_COLORS = ['#ff8f6b', '#7bd389', '#7aa7ff', '#f7a8ff', '#ffd36b', '#6be0e0', '#c3a6ff', '#ffb3c1', '#b5e48c', '#90caf9']

function plural(n, one, few, many) {
  const m = n % 10, h = n % 100
  if (m === 1 && h !== 11) return one
  if (m >= 2 && m <= 4 && (h < 10 || h >= 20)) return few
  return many
}

export default function App() {
  const { view, connected, error, chat, send } = useGame()
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!error) return
    setToast(error.msg)
    const t = setTimeout(() => setToast(null), 3600)
    return () => clearTimeout(t)
  }, [error])

  const colorOf = (id) => {
    const i = view ? view.players.findIndex((p) => p.id === id) : -1
    return i < 0 ? 'var(--muted)' : SEAT_COLORS[i % SEAT_COLORS.length]
  }

  let screen
  if (!view) screen = <Home connected={connected} send={send} />
  else if (view.status === 'lobby') screen = <Lobby view={view} send={send} />
  else screen = <Table view={view} chat={chat} send={send} />

  return (
    <div id="app" className={view ? `with-chat${view.status !== 'lobby' ? ' on-table' : ''}` : ''}>
      {view ? (
        <div className="layout">
          <main className="game">{screen}</main>
          <ChatPanel chat={chat} me={view.you} colorOf={colorOf} send={send} />
        </div>
      ) : screen}
      {!connected && view && <div className="offline">Нет связи с сервером, переподключаемся…</div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

/* ---------------- Главный экран ---------------- */

function Home({ connected, send }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem('fc-name') || '' } catch { return '' } })
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('code')?.toUpperCase().slice(0, 4) || '')

  const remember = () => { try { localStorage.setItem('fc-name', name.trim()) } catch { /* ничего */ } }
  const create = () => { remember(); send({ t: 'create', name }) }
  const join = (e) => {
    e.preventDefault()
    if (code.trim().length !== 4) return
    remember()
    send({ t: 'join', code: code.trim().toUpperCase(), name })
  }

  return (
    <>
      <header className="brand">
        <div>
          <h1>УНОС</h1>
          <p>Карточная игра на 2–10 человек. Кладите карту того же цвета или значения и первым избавьтесь от всех карт.</p>
        </div>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>Сесть за стол</h2>
          <div className="field">
            <label htmlFor="name">Ваше имя</label>
            <input id="name" type="text" maxLength={20} value={name} placeholder="Например, Аня" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn primary painted ptext" onClick={create} disabled={!connected}><Paint bg={GOLD} text="Создать стол" color={INK} />Создать стол</button>
          </div>
          <form className="row" onSubmit={join}>
            <input id="code" type="text" maxLength={4} value={code} placeholder="КОД" aria-label="Код стола" autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
            <button className="btn" type="submit" disabled={!connected || code.length !== 4}>Войти по коду</button>
          </form>
          <p className="note">{connected ? 'Создайте стол и отправьте друзьям ссылку или код из четырёх букв.' : 'Подключаемся к серверу…'}</p>
        </section>

        <section className="panel">
          <h2>Правила коротко</h2>
          <ul className="rules">
            <li>Кладите карту <b>того же цвета</b> или <b>того же значения</b>.</li>
            <li><b>⊘</b> следующий пропускает ход, <b>⇄</b> меняет направление.</li>
            <li><b>+2</b> и <b>+4</b>: следующий берёт карты и пропускает ход.</li>
            <li><b>✦</b> и <b>+4</b> кладутся на что угодно, вы выбираете цвет.</li>
            <li>Нечем ходить? Возьмите карту из колоды, затем сыграйте или спасуйте.</li>
            <li>Оставляя одну карту, нажмите <b>«УНОС»</b>, иначе штраф +2.</li>
          </ul>
        </section>
      </div>
    </>
  )
}

/* ---------------- Лобби ---------------- */

function Lobby({ view, send }) {
  const isHost = view.host === view.you
  const link = `${location.origin}/?code=${view.code}`
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* выделите вручную */ }
  }

  return (
    <>
      <TopBar view={view} send={send} />
      <div className="wait">
        <p className="note">Код стола</p>
        <div className="bigcode painted ptext"><Paint text={view.code} color={GOLD} />{view.code}</div>
        <div className="share">
          <input type="text" readOnly value={link} aria-label="Ссылка на стол" onFocus={(e) => e.target.select()} />
          <button className="btn small" onClick={copy}>{copied ? 'Скопировано' : 'Копировать'}</button>
        </div>

        <div className="plist">
          {view.players.map((p, i) => (
            <span key={p.id} className={`pl ${p.online ? '' : 'away'}`}>
              <span className="dot painted"><Paint bg={SEAT_COLORS[i % SEAT_COLORS.length]} /></span>
              {p.name}
              {p.id === view.host && <small>хозяин</small>}
              {p.id === view.you && <small>вы</small>}
              {p.bot && <small>бот</small>}
              {isHost && p.id !== view.you && (
                <button className="x" aria-label={`Убрать ${p.name}`} onClick={() => send({ t: 'kick', id: p.id })}>×</button>
              )}
            </span>
          ))}
        </div>
        <p className="note">За столом {view.players.length} из 10</p>

        {isHost ? (
          <>
            <div className="row center-row">
              <button className="btn primary painted ptext" disabled={view.players.length < 2} onClick={() => send({ t: 'start' })}><Paint bg={GOLD} text="Раздать карты" color={INK} />Раздать карты</button>
              <button className="btn" disabled={view.players.length >= 10} onClick={() => send({ t: 'addbot' })}>Добавить бота</button>
            </div>
            {view.players.length < 2 && <p className="note">Ждём друзей. Можно добавить бота, чтобы сыграть прямо сейчас.</p>}
          </>
        ) : (
          <p className="status">Ждём, когда хозяин стола раздаст карты</p>
        )}
      </div>
    </>
  )
}

function TopBar({ view, send }) {
  return (
    <div className="topbar">
      <button className="btn ghost small" onClick={() => send({ t: 'leave' })}>← <span className="long">Встать из-за стола</span><span className="short">Выйти</span></button>
      <span className="tcode">СТОЛ {view.code}{view.round > 0 && <small>партия {view.round}</small>}</span>
    </div>
  )
}

/* ---------------- Игровой стол ---------------- */

// Последнее событие словами — только для экранных читалок; на экране события показывает анимация.
function eventText(e) {
  const n = e.who || ''
  switch (e.k) {
    case 'start': return 'Раздано по 7 карт'
    case 'play': return `${n} кладёт ${cardLabel(e.card)}${e.col ? `, цвет ${COLOR_NAME[e.col]}` : ''}`
    case 'draw': return `${n} берёт карту`
    case 'pass': return `${n} пасует`
    case 'skip': case 'blocked': return `${n} пропускает ход`
    case 'rev': return 'Направление сменилось'
    case 'hit': return `${n} берёт ${e.n} и пропускает ход`
    case 'pen': return `${n} берёт 2 штрафные`
    case 'last': return `${n}: УНОС!`
    case 'win': return `${n} выигрывает`
    case 'left': return `${n} встаёт из-за стола`
    default: return ''
  }
}

// Пузырь с последней фразой игрока над его местом (4 секунды).
function useBubbles(chat) {
  const [bubbles, setBubbles] = useState({})
  const last = chat[chat.length - 1]
  useEffect(() => {
    if (!last || Date.now() - last.at > 5000) return
    setBubbles((b) => ({ ...b, [last.from]: last }))
    const t = setTimeout(() => setBubbles((b) => (b[last.from]?.id === last.id ? { ...b, [last.from]: undefined } : b)), 4000)
    return () => clearTimeout(t)
  }, [last])
  return bubbles
}

// Всплывающие метки над игроками: «+2», «Пропуск», «УНОС!», «Штраф +2».
// Берутся из изменения числа карт и из новых записей журнала сервера.
function useFloats(view, me) {
  const [floats, setFloats] = useState([])
  const timers = useRef([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const [revKey, setRevKey] = useState(0)
  const prev = useRef(null)
  useEffect(() => {
    const counts = Object.fromEntries(view.players.map((p) => [p.id, p.id === me ? view.hand.length : p.count]))
    const names = Object.fromEntries(view.players.map((p) => [p.name, p.id]))
    const old = prev.current
    prev.current = { counts, log: view.log, round: view.round }
    if (!old || old.round !== view.round || view.status !== 'playing') return

    const head = old.log[0] && JSON.stringify(old.log[0])
    const idx = head ? view.log.findIndex((e) => JSON.stringify(e) === head) : -1
    const fresh = idx > 0 ? view.log.slice(0, idx) : []
    const add = []
    const penalized = new Set()
    for (const e of fresh) {
      const id = names[e.who]
      if (e.k === 'blocked' && id) add.push({ id, text: 'Пропуск', kind: 'skip' })
      if (e.k === 'skip' && id) add.push({ id, text: 'Пропуск', kind: 'skip' })
      if (e.k === 'last' && id) add.push({ id, text: 'УНОС!', kind: 'unos' })
      if (e.k === 'pen' && id) { add.push({ id, text: 'Штраф +2', kind: 'plus' }); penalized.add(id) }
      if (e.k === 'rev') setRevKey((k) => k + 1)
    }
    for (const [id, n] of Object.entries(counts)) {
      const d = n - (old.counts[id] ?? n)
      if (d > 0 && !penalized.has(id)) add.push({ id, text: `+${d}`, kind: 'plus' })
    }
    if (!add.length) return
    const stamped = add.map((f, i) => ({ ...f, key: `${Date.now()}-${i}` }))
    setFloats((fs) => [...fs, ...stamped])
    // таймер живёт до конца анимации, даже если за это время придёт новое состояние стола
    timers.current.push(setTimeout(() => setFloats((fs) => fs.filter((f) => !stamped.includes(f))), 1700))
  }, [view, me])
  return { floats, revKey }
}

function Floats({ list }) {
  return list.map((f, i) => (
    <span key={f.key} className={`float ${f.kind}${f.kind === 'skip' ? '' : ' painted'}${f.kind === 'unos' ? ' ptext' : ''}`} style={{ '--i': i }}>
      {f.kind === 'plus' && <Paint bg={HEX.r.c} />}
      {f.kind === 'unos' && <Paint bg={GOLD} text={f.text} color={INK} />}
      {f.text}
    </span>
  ))
}

// Карты из колоды летят к тому, кто их взял: мне — рубашкой вверх с переворотом в полёте,
// соперникам — рубашкой к их месту. Рисуются в отдельном слое поверх стола.
const DECK_FLY_MS = 550
const DECK_STAGGER_MS = 90

function useDeckFlights(view, me, deckRef, handRef, seatRefs) {
  const [flyers, setFlyers] = useState([])
  const [arriving, setArriving] = useState({}) // id карты в руке → через сколько мс она «приземлится»
  const prev = useRef(null)
  const seq = useRef(0)
  const timers = useRef([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useLayoutEffect(() => {
    const old = prev.current
    prev.current = {
      hand: new Set(view.hand.map((c) => c.id)),
      counts: Object.fromEntries(view.players.map((p) => [p.id, p.count])),
      round: view.round,
    }
    const deckEl = deckRef.current
    // стол только что появился на экране: если партия только началась, показываем раздачу
    const justDealt = !old && view.log.length === 1 && view.log[0].k === 'start'
    if ((!old && !justDealt) || !deckEl || view.status !== 'playing') return
    const base = old || { hand: new Set(), counts: {}, round: -1 }
    const deck = deckEl.getBoundingClientRect()
    const batch = []
    const land = {}

    // мои новые карты, в порядке руки
    let k = 0
    for (const el of handRef.current ? handRef.current.querySelectorAll('[data-id]') : []) {
      const id = Number(el.dataset.id)
      if (base.hand.has(id)) continue
      const card = view.hand.find((c) => c.id === id)
      if (!card) continue
      const r = el.getBoundingClientRect()
      const delay = k++ * DECK_STAGGER_MS
      batch.push({ key: `f${++seq.current}`, card, w: r.width, x0: deck.left, y0: deck.top, s0: deck.width / r.width, x1: r.left, y1: r.top, delay })
      land[id] = delay + DECK_FLY_MS
    }

    // соперники: рубашки к месту (в начале новой партии не показываем)
    if (base.round === view.round) {
      for (const p of view.players) {
        if (p.id === me) continue
        const d = p.count - (base.counts[p.id] ?? p.count)
        const seat = seatRefs.current[p.id]
        if (d <= 0 || !seat) continue
        const r = seat.getBoundingClientRect()
        const w = 34
        for (let i = 0; i < Math.min(d, 6); i++) {
          batch.push({ key: `f${++seq.current}`, back: true, w, x0: deck.left, y0: deck.top, s0: deck.width / w,
            x1: r.left + r.width / 2 - w / 2, y1: r.top + r.height / 2 - (w * 1.45) / 2, delay: i * DECK_STAGGER_MS })
        }
      }
    }
    if (!batch.length) return

    setFlyers((fs) => [...fs, ...batch])
    setArriving((a) => ({ ...a, ...land }))
    const total = Math.max(...batch.map((f) => f.delay)) + DECK_FLY_MS + 120
    timers.current.push(setTimeout(() => {
      setFlyers((fs) => fs.filter((f) => !batch.includes(f)))
      setArriving((a) => { const n = { ...a }; for (const id of Object.keys(land)) delete n[id]; return n })
    }, total))
  }, [view, me, deckRef, handRef, seatRefs])

  return { flyers, arriving }
}

function FlyLayer({ flyers }) {
  if (!flyers.length) return null
  return (
    <div className="flylayer" aria-hidden="true">
      {flyers.map((f) => (
        <div key={f.key} className={`flyer ${f.back ? 'opp' : 'mine'}`}
          style={{ '--cw': `${f.w}px`, '--x0': `${f.x0}px`, '--y0': `${f.y0}px`, '--s0': f.s0,
            '--x1': `${f.x1}px`, '--y1': `${f.y1}px`, '--delay': `${f.delay}ms`, '--dur': `${DECK_FLY_MS}ms` }}>
          {f.back ? <CardBack /> : (
            <div className="flip">
              <div className="side"><Card card={f.card} /></div>
              <div className="side back-side"><CardBack /></div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// Лёгкий наклон карты за курсором.
function tilt(e) {
  if (e.pointerType !== 'mouse') return
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width - 0.5
  const y = (e.clientY - r.top) / r.height - 0.5
  el.style.setProperty('--ry', `${x * 18}deg`)
  el.style.setProperty('--rx', `${-y * 14}deg`)
  el.style.setProperty('--sx', `${(x + 0.5) * 100}%`)
}
function untilt(e) {
  const el = e.currentTarget
  el.style.removeProperty('--ry')
  el.style.removeProperty('--rx')
  el.style.removeProperty('--sx')
}

// Детерминированный «случайный» поворот карты в стопке сброса.
const scatter = (id) => ({ rot: ((id * 47) % 31) - 15, dx: ((id * 13) % 9) - 4, dy: ((id * 29) % 7) - 3 })

// Конфетти для победителя: чистый CSS, 36 полосок.
const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 37) % 100, delay: ((i * 53) % 90) / 100, dur: 1.6 + ((i * 29) % 10) / 10,
  color: ['var(--red)', 'var(--yellow)', 'var(--green)', 'var(--blue)', 'var(--gold)'][i % 5], rot: (i * 71) % 360,
}))
function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {CONFETTI.map((c, i) => (
        <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, '--r': `${c.rot}deg` }} />
      ))}
    </div>
  )
}

const WARN_AFTER_MS = 10_000

function Table({ view, chat, send }) {
  const bubbles = useBubbles(chat)
  const { floats, revKey } = useFloats(view, view.you)
  const [calling, setCalling] = useState(false)
  const [picking, setPicking] = useState(null) // id «дикой» карты, для которой выбираем цвет

  const me = view.you
  const byId = useMemo(() => Object.fromEntries(view.players.map((p, i) => [p.id, { ...p, color: SEAT_COLORS[i % SEAT_COLORS.length] }])), [view.players])
  const seated = view.order.includes(me)
  const playing = view.status === 'playing'
  const myTurn = playing && view.turn === me
  const playable = new Set(view.playable)
  const anyPlayable = playable.size > 0
  const hand = useMemo(() => {
    const o = 'rygbw'
    return [...view.hand].sort((a, b) => o.indexOf(a.c) - o.indexOf(b.c) || a.v.localeCompare(b.v))
  }, [view.hand])

  // сбрасываем «УНОС» и выбор цвета, когда ход ушёл
  useEffect(() => { if (!myTurn) { setCalling(false); setPicking(null) } }, [myTurn])


  // Сыгранная карта прилетает в сброс от того, кто её положил.
  const topKey = view.top ? view.top.id : null
  const heapRef = useRef(null)
  const handRef = useRef(null)
  const seatRefs = useRef({})
  const deckRef = useRef(null)
  const { flyers, arriving } = useDeckFlights(view, me, deckRef, handRef, seatRefs)
  const prevTop = useRef(topKey)
  const [fly, setFly] = useState(null)
  useLayoutEffect(() => {
    if (prevTop.current === topKey) return
    prevTop.current = topKey
    const heap = heapRef.current
    const src = view.lastBy === me ? handRef.current : seatRefs.current[view.lastBy]
    if (!heap || !src) { setFly({ id: topKey, kind: 'land' }); return }
    const a = src.getBoundingClientRect()
    const b = heap.getBoundingClientRect()
    setFly({ id: topKey, kind: 'fly', fx: a.left + a.width / 2 - (b.left + b.width / 2), fy: a.top + a.height / 2 - (b.top + b.height / 2) })
  }, [topKey, view.lastBy, me])

  const playCard = (card, color) => {
    send({ t: 'play', card: card.id, color: color || '', last: calling })
    setCalling(false)
    setPicking(null)
  }

  // соперники по кругу, начиная со следующего после меня
  const start = seated ? view.order.indexOf(me) + 1 : 0
  const opponents = []
  for (let k = 0; k < view.order.length; k++) {
    const id = view.order[(start + k) % view.order.length]
    if (id !== me) opponents.push(byId[id])
  }
  const waiting = view.players.filter((p) => !p.inRound)
  const cur = byId[view.turn]
  const isHost = view.host === me

  // Сколько текущий игрок молчит. Сервер присылает это в мс на момент отправки,
  // дальше досчитываем сами: так не важно, что часы телефона и сервера расходятся.
  const receivedAt = useMemo(() => Date.now(), [view])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [playing])
  const idle = (view.turnIdle || 0) + Math.max(0, now - receivedAt)
  const stuck = playing && !myTurn && idle >= SKIP_AFTER_MS
  const warn = myTurn && idle >= WARN_AFTER_MS
  const pickCard = hand.find((c) => c.id === picking)

  // подсказка появляется, только если игрок задумался на своём ходу
  let warning = null
  if (warn && !anyPlayable && !view.drew) warning = 'Подходящих карт нет: возьмите карту из колоды'
  else if (warn && !anyPlayable && view.drew) warning = 'Подходящей карты нет: нажмите «Пас»'
  else if (warn) warning = 'Ваш ход: подходящие карты подняты'

  const meFloats = floats.filter((f) => f.id === me)

  return (
    <>
      <TopBar view={view} send={send} />

      <div className="seats">
        {opponents.map((p) => p && (
          <div key={p.id} ref={(el) => { seatRefs.current[p.id] = el }}
            className={`seat ${p.id === view.turn && playing ? 'active' : ''} ${p.online ? '' : 'away'}`}>
            {p.id === view.turn && playing && <Paint ring={GOLD} />}
            {bubbles[p.id] && <span key={bubbles[p.id].id} className="say">{bubbles[p.id].text}</span>}
            <Floats list={floats.filter((f) => f.id === p.id)} />
            <span className="dot painted"><Paint bg={p.color} /></span>
            <span className="n">{p.name}</span>
            <span className="count" aria-label={`${p.count} ${plural(p.count, 'карта', 'карты', 'карт')}`}>
              <span className="mini-back"><CardBack /></span>{p.count}
            </span>
            {!p.online && <span className="tag">не в сети</span>}
            {p.count === 1 && <span className="flag painted ptext"><Paint bg={GOLD} text="УНОС!" color={INK} />УНОС!</span>}
          </div>
        ))}
      </div>

      <div className="center">
        <button className={`pile ${myTurn && !view.drew ? 'can' : ''} ${myTurn && !view.drew && !anyPlayable ? 'need' : ''}`}
          disabled={!myTurn || view.drew} onClick={() => send({ t: 'draw' })} aria-label="Взять карту из колоды">
          <div className="stack" ref={deckRef}>
            <span className="under u2"><CardBack /></span>
            <span className="under u1"><CardBack /></span>
            <CardBack gold={myTurn && !view.drew} />
          </div>
          <span>Колода · {view.drawCount}</span>
        </button>
        <div className="dir" aria-label={view.dir === 1 ? 'Ход по часовой' : 'Ход против часовой'}>
          <span key={revKey} className={revKey ? 'flip' : ''}>{view.dir === 1 ? '↻' : '↺'}</span>
          <small>{view.dir === 1 ? 'по часовой' : 'против'}</small>
        </div>
        {view.top && (
          <div className="discard" style={{ '--hc': COLOR_VAR[view.color] }}>
            <div className="halo">
              {/* свечение цвета — на canvas: тёмный режим браузера его не перекрасит */}
              <Glow color={HEX[view.color]?.c ?? GOLD} />
              <div className="heap" ref={heapRef}>
                {(view.recent || [view.top]).map((c, i, arr) => {
                  const s = scatter(c.id)
                  const isTop = i === arr.length - 1
                  const f = fly && fly.id === c.id ? fly : null
                  return (
                    <div key={c.id} className={`heap-card ${f ? f.kind : ''}`}
                      style={{ '--rot': `${isTop ? s.rot / 3 : s.rot}deg`, '--dx': `${s.dx}px`, '--dy': `${s.dy}px`,
                        ...(f?.kind === 'fly' ? { '--fx': `${f.fx}px`, '--fy': `${f.fy}px` } : {}) }}>
                      <Card card={c} />
                    </div>
                  )
                })}
              </div>
            </div>
            <span className="lbl">Цвет: <b key={view.color} className="pulse painted ptext"><Paint text={COLOR_NAME[view.color]} color={HEX[view.color]?.c} />{COLOR_NAME[view.color]}</b></span>
          </div>
        )}
      </div>

      {playing && (
        <div className="turnline">
          {myTurn
            ? <div key="mine" className="status mine pop-in painted ptext"><Paint text="Ваш ход" color={GOLD} />Ваш ход</div>
            : <div key={view.turn} className="status pop-in">Ходит {cur?.name ?? '…'}</div>}
          {warning && <div key={warning} className="warn">{warning}</div>}
          {stuck && (
            <div className="warn soft">
              {cur?.online ? 'Не отвечает' : 'Не в сети'} больше минуты.{' '}
              {isHost ? 'Можно пропустить этот ход.' : 'Хозяин стола может пропустить этот ход.'}
            </div>
          )}
        </div>
      )}

      <p className="sr-only" aria-live="polite">{view.log[0] ? eventText(view.log[0]) : ''}</p>

      {seated ? (
        <div className="handwrap">
          <div className="say-row">
            {bubbles[me] && <span key={bubbles[me].id} className="say mine-say">{bubbles[me].text}</span>}
            <Floats list={meFloats} />
          </div>
          <div className="actions">
            {myTurn && hand.length === 2 && anyPlayable && (
              <button className="btn call painted ptext" aria-pressed={calling} onClick={() => setCalling((c) => !c)}>
                <Paint bg={calling ? GOLD : HEX.r.c} text={calling ? '«УНОС» сказано' : 'УНОС'} color={calling ? INK : '#fff'} />
                {calling ? '«УНОС» сказано' : 'УНОС'}
              </button>
            )}
            {myTurn && view.drew && (
              <button className={`btn ${warn && !anyPlayable ? 'primary pulse-btn painted ptext' : ''}`} onClick={() => send({ t: 'pass' })}>
                {warn && !anyPlayable && <Paint bg={GOLD} text="Пас" color={INK} />}Пас
              </button>
            )}
            {isHost && stuck && cur && (
              <button className="btn ghost small" onClick={() => send({ t: 'skip' })}>Пропустить ход: {cur.name}</button>
            )}
          </div>
          <div className="mine-label">Ваши карты · {hand.length}{byId[me]?.wins ? ` · побед: ${byId[me].wins}` : ''}</div>
          <div className={`hand ${myTurn ? 'turn' : 'waiting'}`} ref={handRef}>
            {hand.map((c) => {
              const ok = myTurn && playable.has(c.id)
              return (
                <button key={c.id} data-id={c.id} className={`hcard ${myTurn ? (ok ? 'ok' : 'no') : ''} ${c.id in arriving ? 'arriving' : ''}`}
                  style={c.id in arriving ? { '--land': `${arriving[c.id]}ms` } : undefined}
                  disabled={!ok} aria-label={cardLabel(c)} onPointerMove={tilt} onPointerLeave={untilt}
                  onClick={() => (c.c === 'w' ? setPicking(c.id) : playCard(c))}>
                  <Card card={c} />
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="spect">Партия уже идёт. Вы сядете за стол со следующей раздачи.</div>
      )}

      {waiting.length > 0 && seated && (
        <p className="note center-text">Ждут следующей раздачи: {waiting.map((p) => p.name).join(', ')}</p>
      )}

      <FlyLayer flyers={flyers} />

      {pickCard && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pickH">
          <div className="sheet pop-in">
            <h2 id="pickH">Какой цвет заказываете?</h2>
            <div className="swatches">
              {['r', 'y', 'g', 'b'].map((c) => (
                <button key={c} className={`sw c-${c} painted ptext`} onClick={() => playCard(pickCard, c)}>
                  <Paint bg={HEX[c].c} text={COLOR_NAME[c][0].toUpperCase() + COLOR_NAME[c].slice(1)} color={c === 'y' ? INK : '#fff'} />
                  {COLOR_NAME[c][0].toUpperCase() + COLOR_NAME[c].slice(1)}
                </button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setPicking(null)}>Отмена</button>
          </div>
        </div>
      )}

      {view.status === 'finished' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="winH">
          {view.winner === me && <Confetti />}
          <div className="sheet pop-in">
            {view.top && <div className="win-card"><Card card={view.top} className="pop" /></div>}
            <h2 id="winH">{view.winner === me ? 'Вы выиграли партию!' : `${byId[view.winner]?.name ?? 'Игрок'} выигрывает партию`}</h2>
            <div className="scores">
              {[...view.players].sort((a, b) => b.wins - a.wins).map((p) => (
                <div key={p.id}><span>{p.name}{p.id === me ? ' (вы)' : ''}</span><b>{p.wins} {plural(p.wins, 'победа', 'победы', 'побед')}</b></div>
              ))}
            </div>
            <div className="row center-row">
              {isHost
                ? <button className="btn primary painted ptext" onClick={() => send({ t: 'start' })}><Paint bg={GOLD} text="Ещё партия" color={INK} />Ещё партия</button>
                : <p className="note">Хозяин стола может начать новую партию.</p>}
              <button className="btn ghost" onClick={() => send({ t: 'leave' })}>Встать из-за стола</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
