import { useEffect, useRef, useState } from 'react'

const QUICK = ['👍', '😂', '😱', '🔥', 'Ходи уже!', 'Хорошая игра']

function useWide() {
  const query = '(min-width: 1000px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

function time(ms) {
  const d = new Date(ms)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function ChatPanel({ chat, me, colorOf, send }) {
  const wide = useWide()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [seen, setSeen] = useState(0) // id последнего прочитанного сообщения
  const listRef = useRef(null)
  const stick = useRef(true) // прокручивать вниз, пока пользователь не отмотал вверх

  const visible = wide || open
  const lastId = chat.length ? chat[chat.length - 1].id : 0
  const unread = visible ? 0 : chat.filter((m) => m.id > seen && m.from !== me).length

  useEffect(() => { if (visible) setSeen(lastId) }, [visible, lastId])

  useEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [chat, visible])

  const onScroll = () => {
    const el = listRef.current
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const say = (t) => {
    const s = t.trim()
    if (!s) return
    send({ t: 'chat', text: s })
    stick.current = true
  }
  const submit = (e) => {
    e.preventDefault()
    say(text)
    setText('')
  }

  const panel = (
    <section className={`chat ${wide ? 'side' : 'drawer'}`} aria-label="Чат стола">
      <header className="chat-head">
        <h2>Чат стола</h2>
        {!wide && <button className="btn ghost small" onClick={() => setOpen(false)} aria-label="Закрыть чат">Закрыть</button>}
      </header>
      <div className="chat-list" ref={listRef} onScroll={onScroll} aria-live="polite">
        {chat.length === 0 && <p className="chat-empty">Здесь пока тихо. Поздоровайтесь или подбодрите соперников.</p>}
        {chat.map((m, i) => {
          const mine = m.from === me
          const grouped = i > 0 && chat[i - 1].from === m.from && m.at - chat[i - 1].at < 60000
          const onlyEmoji = /^\p{Extended_Pictographic}{1,3}$/u.test(m.text)
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
              {!grouped && (
                <div className="msg-meta">
                  <b style={{ color: mine ? 'var(--gold)' : colorOf(m.from) }}>{mine ? 'Вы' : m.who}</b>
                  <span>{time(m.at)}</span>
                </div>
              )}
              <div className={`bubble-text ${onlyEmoji ? 'emoji' : ''}`}>{m.text}</div>
            </div>
          )
        })}
      </div>
      <div className="quick">
        {QUICK.map((q) => <button key={q} className="qbtn" onClick={() => say(q)}>{q}</button>)}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input id="chat-input" type="text" maxLength={300} value={text} placeholder="Сообщение…" autoComplete="off"
          onChange={(e) => setText(e.target.value)} aria-label="Сообщение в чат" />
        <button className="btn primary small" type="submit" disabled={!text.trim()}>Отправить</button>
      </form>
    </section>
  )

  if (wide) return panel
  return (
    <>
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label={`Открыть чат${unread ? `, непрочитанных: ${unread}` : ''}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        Чат
        {unread > 0 && <span className="unread">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="chat-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          {panel}
        </div>
      )}
    </>
  )
}
