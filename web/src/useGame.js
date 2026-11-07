import { useCallback, useEffect, useRef, useState } from 'react'

const SESSION_KEY = 'fc-session'

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}
function saveSession(s) {
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY) } catch { /* приватный режим */ }
}

// Одно WebSocket-соединение с сервером: автопереподключение и возврат за стол.
export function useGame() {
  const [view, setView] = useState(null)        // состояние стола от сервера или null (главный экран)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const [chat, setChat] = useState([])           // сообщения чата текущего стола
  const wsRef = useRef(null)

  useEffect(() => {
    let stopped = false
    let retry = 0
    let timer

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        retry = 0
        setConnected(true)
        const s = loadSession()
        ws.send(JSON.stringify(s ? { t: 'hello', code: s.code, secret: s.secret } : { t: 'hello' }))
      }
      ws.onmessage = (e) => {
        let m
        try { m = JSON.parse(e.data) } catch { return }
        if (m.t === 'state') setView(m)
        else if (m.t === 'joined') saveSession({ code: m.code, secret: m.secret })
        else if (m.t === 'home') { saveSession(null); setView(null); setChat([]) }
        else if (m.t === 'chatHistory') setChat(m.list || [])
        else if (m.t === 'chat') setChat((list) => [...list, m.msg].slice(-60))
        else if (m.t === 'error') setError({ msg: m.msg, at: Date.now() })
      }
      ws.onclose = () => {
        setConnected(false)
        if (stopped) return
        const delay = Math.min(8000, 500 * 2 ** retry++)
        timer = setTimeout(connect, delay)
      }
    }
    connect()
    return () => { stopped = true; clearTimeout(timer); wsRef.current?.close() }
  }, [])

  const send = useCallback((msg) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    else setError({ msg: 'Нет связи с сервером, переподключаемся…', at: Date.now() })
  }, [])

  return { view, connected, error, chat, send }
}
