import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from './useGame.js'
import { Card, CardBack, Chip, COLOR_NAME, cardLabel } from './Card.jsx'
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
    <div id="app" className={view ? 'with-chat' : ''}>
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
            <button className="btn primary" onClick={create} disabled={!connected}>Создать стол</button>
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
        <div className="bigcode">{view.code}</div>
        <div className="share">
          <input type="text" readOnly value={link} aria-label="Ссылка на стол" onFocus={(e) => e.target.select()} />
          <button className="btn small" onClick={copy}>{copied ? 'Скопировано' : 'Копировать'}</button>
        </div>

        <div className="plist">
          {view.players.map((p, i) => (
            <span key={p.id} className={`pl ${p.online ? '' : 'away'}`}>
              <span className="dot" style={{ background: SEAT_COLORS[i % SEAT_COLORS.length] }} />
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
              <button className="btn primary" disabled={view.players.length < 2} onClick={() => send({ t: 'start' })}>Раздать карты</button>
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
      <button className="btn ghost small" onClick={() => send({ t: 'leave' })}>← Встать из-за стола</button>
      <span className="tcode">СТОЛ {view.code}{view.round > 0 && <small>партия {view.round}</small>}</span>
    </div>
  )
}

/* ---------------- Игровой стол ---------------- */

function logText(e) {
  const n = e.who ? <b>{e.who}</b> : null
  switch (e.k) {
    case 'start': return <>Раздано по 7 карт. Поехали!</>
    case 'play': return <>{n} кладёт <Chip card={e.card} />{e.col && <> и выбирает {COLOR_NAME[e.col]} цвет</>}</>
    case 'draw': return <>{n} берёт карту из колоды</>
    case 'pass': return <>{n} пасует</>
    case 'skip': return <>{n} пропускает ход по решению хозяина стола</>
    case 'blocked': return <>{n} пропускает ход</>
    case 'rev': return <>Направление игры сменилось</>
    case 'hit': return <>{n} берёт {e.n} {plural(e.n, 'карту', 'карты', 'карт')} и пропускает ход</>
    case 'pen': return <>{n} забывает сказать «УНОС» и берёт 2 штрафные</>
    case 'last': return <>{n}: «УНОС!»</>
    case 'win': return <>{n} выигрывает партию</>
    case 'left': return <>{n} встаёт из-за стола</>
    default: return null
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

// Новые карты в руке «прилетают» из колоды; при раздаче — по очереди.
function useDealDelays(hand) {
  const known = useRef(new Set())
  const delays = {}
  let k = 0
  for (const c of hand) if (!known.current.has(c.id)) delays[c.id] = k++ * 60
  useEffect(() => { known.current = new Set(hand.map((c) => c.id)) })
  return delays
}

// Лёгкий наклон карты за курсором.
function tilt(e) {
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

function Table({ view, chat, send }) {
  const bubbles = useBubbles(chat)
  const [calling, setCalling] = useState(false)
  const [picking, setPicking] = useState(null) // id «дикой» карты, для которой выбираем цвет

  const me = view.you
  const byId = useMemo(() => Object.fromEntries(view.players.map((p, i) => [p.id, { ...p, color: SEAT_COLORS[i % SEAT_COLORS.length] }])), [view.players])
  const seated = view.order.includes(me)
  const myTurn = view.status === 'playing' && view.turn === me
  const playable = new Set(view.playable)
  const anyPlayable = playable.size > 0
  const hand = useMemo(() => {
    const o = 'rygbw'
    return [...view.hand].sort((a, b) => o.indexOf(a.c) - o.indexOf(b.c) || a.v.localeCompare(b.v))
  }, [view.hand])

  // сбрасываем «УНОС» и выбор цвета, когда ход ушёл
  useEffect(() => { if (!myTurn) { setCalling(false); setPicking(null) } }, [myTurn])

  // анимация новой карты сброса (не при первом показе стола)
  const topKey = view.top ? view.top.id : null
  const firstTop = useRef(topKey)
  const animateTop = topKey !== firstTop.current
  const delays = useDealDelays(hand)

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
  const waitingOther = view.status === 'playing' && !myTurn
  useEffect(() => {
    if (!waitingOther) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [waitingOther])
  const idle = (view.turnIdle || 0) + Math.max(0, now - receivedAt)
  const stuck = waitingOther && idle >= SKIP_AFTER_MS
  const pickCard = hand.find((c) => c.id === picking)

  let hint = ' '
  if (myTurn) {
    if (view.drew) hint = anyPlayable ? 'Сыграйте подходящую карту или спасуйте.' : 'Подходящей карты нет, нажмите «Пас».'
    else hint = anyPlayable ? 'Кладите карту того же цвета или значения.' : 'Ходить нечем: возьмите карту из колоды.'
  }

  return (
    <>
      <TopBar view={view} send={send} />

      <div className="seats">
        {opponents.map((p) => p && (
          <div key={p.id} className={`seat ${p.id === view.turn ? 'active' : ''} ${p.online ? '' : 'away'}`}>
            {bubbles[p.id] && <span key={bubbles[p.id].id} className="say">{bubbles[p.id].text}</span>}
            <div className="who">
              <span className="dot" style={{ background: p.color }} />
              <span className="n">{p.name}</span>
              {p.bot && <small>бот</small>}
            </div>
            <div className="meta">
              <span className="minis">{Array.from({ length: Math.min(p.count, 12) }, (_, i) => <i key={i} />)}</span>
              <span>{p.count} {plural(p.count, 'карта', 'карты', 'карт')}</span>
            </div>
            {!p.online && <span className="tag">не в сети</span>}
            {p.count === 1 && <span className="flag">УНОС!</span>}
          </div>
        ))}
      </div>

      <div className="center">
        <button className={`pile ${myTurn && !view.drew ? 'can' : ''}`} disabled={!myTurn || view.drew}
          onClick={() => send({ t: 'draw' })} aria-label="Взять карту из колоды">
          <div className="stack"><CardBack /></div>
          <span>Колода · {view.drawCount}</span>
        </button>
        <div className="dir" aria-label={view.dir === 1 ? 'Ход по часовой' : 'Ход против часовой'}>
          {view.dir === 1 ? '↻' : '↺'}
          <small>{view.dir === 1 ? 'по часовой' : 'против'}</small>
        </div>
        {view.top && (
          <div className="discard" style={{ '--hc': COLOR_VAR[view.color] }}>
            <div className="halo">
              <div className="heap">
                {(view.recent || [view.top]).map((c, i, arr) => {
                  const s = scatter(c.id)
                  const isTop = i === arr.length - 1
                  return (
                    <div key={c.id} className={`heap-card ${isTop && animateTop ? 'land' : ''}`}
                      style={{ '--rot': `${isTop ? s.rot / 3 : s.rot}deg`, '--dx': `${s.dx}px`, '--dy': `${s.dy}px` }}>
                      <Card card={c} />
                    </div>
                  )
                })}
              </div>
            </div>
            <span className="lbl">Цвет: <b>{COLOR_NAME[view.color]}</b></span>
          </div>
        )}
      </div>

      {view.status === 'playing' && (
        myTurn
          ? <><div className="status mine">Ваш ход</div><p className="hint">{hint}</p></>
          : <><div className="status">Ходит {cur?.name ?? '…'}</div><p className="hint">{stuck ? `${cur?.online ? 'Не отвечает' : 'Не в сети'} больше минуты. ${isHost ? 'Можно пропустить этот ход.' : 'Хозяин стола может пропустить этот ход.'}` : cur && !cur.online ? 'Игрок не в сети' : ' '}</p></>
      )}

      <div className="log" aria-live="polite">
        {view.log.slice(0, 3).map((e, i) => <div key={i}>{logText(e)}</div>)}
      </div>

      <div className="actions">
        {myTurn && hand.length === 2 && anyPlayable && (
          <button className="btn call" aria-pressed={calling} onClick={() => setCalling((c) => !c)}>
            {calling ? '«УНОС» сказано' : 'УНОС'}
          </button>
        )}
        {myTurn && view.drew && <button className="btn" onClick={() => send({ t: 'pass' })}>Пас</button>}
        {isHost && stuck && cur && (
          <button className="btn ghost small" onClick={() => send({ t: 'skip' })}>Пропустить ход: {cur.name}</button>
        )}
      </div>

      {seated ? (
        <div className="handwrap">
          {bubbles[me] && <div className="say-row"><span key={bubbles[me].id} className="say mine-say">{bubbles[me].text}</span></div>}
          <div className="mine-label">Ваши карты · {hand.length}{byId[me]?.wins ? ` · побед: ${byId[me].wins}` : ''}</div>
          <div className="hand">
            {hand.map((c) => {
              const ok = myTurn && playable.has(c.id)
              return (
                <button key={c.id} className={`hcard ${myTurn ? (ok ? 'ok' : 'no') : ''} ${c.id in delays ? 'dealt' : ''}`}
                  style={c.id in delays ? { animationDelay: `${delays[c.id]}ms` } : undefined}
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

      {pickCard && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pickH">
          <div className="sheet">
            <h2 id="pickH">Какой цвет заказываете?</h2>
            <div className="swatches">
              {['r', 'y', 'g', 'b'].map((c) => (
                <button key={c} className={`sw c-${c}`} onClick={() => playCard(pickCard, c)}>
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
          <div className="sheet">
            {view.top && <div className="win-card"><Card card={view.top} className="pop" /></div>}
            <h2 id="winH">{view.winner === me ? 'Вы выиграли партию!' : `${byId[view.winner]?.name ?? 'Игрок'} выигрывает партию`}</h2>
            <div className="scores">
              {[...view.players].sort((a, b) => b.wins - a.wins).map((p) => (
                <div key={p.id}><span>{p.name}{p.id === me ? ' (вы)' : ''}</span><b>{p.wins} {plural(p.wins, 'победа', 'победы', 'побед')}</b></div>
              ))}
            </div>
            <div className="row center-row">
              {isHost
                ? <button className="btn primary" onClick={() => send({ t: 'start' })}>Ещё партия</button>
                : <p className="note">Хозяин стола может начать новую партию.</p>}
              <button className="btn ghost" onClick={() => send({ t: 'leave' })}>Встать из-за стола</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
