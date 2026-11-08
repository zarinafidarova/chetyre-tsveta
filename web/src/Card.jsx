import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'

export const COLOR_NAME = { r: 'красный', y: 'жёлтый', g: 'зелёный', b: 'синий' }

/*
  Всё цветное в игре рисуется на <canvas>.

  Тёмный режим Samsung Internet и автозатемнение Android перекрашивают страницу
  при отрисовке, и сайт не может от этого отказаться: color-scheme они
  игнорируют. Замеры со скриншота Samsung показали, что меняется всё цветное:
  CSS-фоны (белая рамка карты стала #4c4d52), заливки SVG (синий #3b78e3 стал
  #003ca7, золото — #664620) и цветной текст («Ваш ход» из #ffd36b стал #86641d).
  Нетронутыми остаются белый текст, тёмный фон и готовые пиксели canvas:
  их браузер не раскладывает на «фон» и «текст», а просто показывает.
*/

export const HEX = {
  r: { c: '#e8474f', d: '#a8232f' },
  y: { c: '#f6c33b', d: '#9a6200' },
  g: { c: '#2aa56e', d: '#157049' },
  b: { c: '#3b78e3', d: '#1f4aa3' },
  w: { c: '#1d2557', d: '#0e0c22' },
}
export const GOLD = '#ffd36b'
export const INK = '#1a1730'
const RAINBOW = ['#e8474f', '#f6c33b', '#2aa56e', '#3b78e3']
const DISPLAY = "Unbounded, 'Arial Black', system-ui, sans-serif"

/* ---------- шрифты: canvas рисует текст только уже загруженным шрифтом ---------- */

let fontsVersion = 0
const fontSubs = new Set()
const bumpFonts = () => { fontsVersion++; fontSubs.forEach((f) => f()) }
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.ready.then(bumpFonts)
  document.fonts.addEventListener?.('loadingdone', bumpFonts)
  document.fonts.load(`900 40px ${DISPLAY}`).then(bumpFonts, () => {})
}
function useFontsVersion() {
  return useSyncExternalStore((f) => { fontSubs.add(f); return () => fontSubs.delete(f) }, () => fontsVersion)
}

/* ---------- общий холст: размер по CSS-размеру, чёткость по плотности экрана ---------- */

function useCanvas(draw, deps) {
  const ref = useRef(null)
  const fv = useFontsVersion()
  useLayoutEffect(() => {
    const cv = ref.current
    if (!cv) return
    const paint = () => {
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (!w || !h) return
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const W = Math.round(w * dpr)
      const H = Math.round(h * dpr)
      if (cv.width !== W) cv.width = W
      if (cv.height !== H) cv.height = H
      const ctx = cv.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw(ctx, w, h, cv)
    }
    paint()
    const ro = new ResizeObserver(paint)
    ro.observe(cv)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, fv])
  return ref
}

/* ---------- значки особых карт, в координатах 24×24 ---------- */

const REVERSE = ['M4.5 10.5a7 7 0 0 1 12.2-4.2L19 8.5', 'M19 4v4.5h-4.5', 'M19.5 13.5a7 7 0 0 1-12.2 4.2L5 15.5', 'M5 20v-4.5h4.5']
const PETAL = 'M12 12C10 9 10.4 4.6 12 2.5 13.6 4.6 14 9 12 12Z'

function rotAbout(ctx, deg, x, y) {
  ctx.translate(x, y)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.translate(-x, -y)
}

function drawShape(ctx, v, color) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (v === 'S') {
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(12, 12, 8, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(6.6, 17.4); ctx.lineTo(17.4, 6.6); ctx.stroke()
  } else if (v === 'R') {
    ctx.strokeStyle = color
    ctx.lineWidth = 2.6
    for (const d of REVERSE) ctx.stroke(new Path2D(d))
  } else if (v === 'D') {
    ctx.fillStyle = color
    ctx.save(); rotAbout(ctx, -12, 8.5, 12); ctx.globalAlpha = 0.55
    ctx.beginPath(); ctx.roundRect(3.5, 5, 10, 14, 2.2); ctx.fill(); ctx.restore()
    ctx.save(); rotAbout(ctx, 10, 15, 11)
    ctx.beginPath(); ctx.roundRect(10, 4, 10, 14, 2.2); ctx.fill(); ctx.restore()
  } else if (v === 'F') {
    ;['#3b78e3', '#2aa56e', '#f6c33b', '#e8474f'].forEach((f, i) => {
      ctx.save(); rotAbout(ctx, -33 + i * 22, 12, 20)
      ctx.beginPath(); ctx.roundRect(8, 3.5, 8, 12, 1.8)
      ctx.fillStyle = f; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke()
      ctx.restore()
    })
  } else if (v === 'W') {
    RAINBOW.forEach((f, i) => {
      ctx.save(); rotAbout(ctx, i * 90 + 45, 12, 12)
      const p = new Path2D(PETAL)
      ctx.fillStyle = f; ctx.fill(p); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.stroke(p)
      ctx.restore()
    })
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(12, 12, 1.8, 0, Math.PI * 2); ctx.fill()
  }
}

// значок размером size с центром в (cx, cy)
function shapeAt(ctx, v, cx, cy, size, color) {
  ctx.save()
  ctx.translate(cx - size / 2, cy - size / 2)
  ctx.scale(size / 24, size / 24)
  drawShape(ctx, v, color)
  ctx.restore()
}

const SHAPES = new Set(['S', 'R', 'D', 'F', 'W'])
const SHORT = { S: '⊘', R: '⇄', D: '+2', F: '+4', W: '✦' }

export function glyph(card) {
  return SHORT[card.v] ?? card.v
}

export function cardLabel(card) {
  if (card.c === 'w') return card.v === 'F' ? 'Заказ цвета, плюс четыре' : 'Заказ цвета'
  const v = { S: 'пропуск хода', R: 'разворот', D: 'плюс два' }[card.v] ?? card.v
  return `${COLOR_NAME[card.c]} ${v}`
}

/* ---------- рисование карты в координатах 100×145 ---------- */

// холст чуть больше карты: по краям место под золотую обводку и тень
const PAD = 5
const ARCH = new Path2D('M16 125 V56 A34 34 0 0 1 84 56 V113 Q84 125 72 125 H28 Q16 125 16 113 Z')

function text(ctx, str, x, y, size, { fill = '#fff', stroke = null, lw = 0, under = false } = {}) {
  ctx.font = `900 ${size}px ${DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeText(str, x, y) }
  ctx.fillStyle = fill
  ctx.fillText(str, x, y)
  if (under) {
    const w = ctx.measureText(str).width
    const t = size * 0.07
    const uy = y + size * 0.1
    if (stroke) { ctx.fillStyle = stroke; ctx.fillRect(x - w / 2 - lw / 2, uy - lw / 2, w + lw, t + lw) }
    ctx.fillStyle = fill
    ctx.fillRect(x - w / 2, uy, w, t)
  }
}

function frame(ctx, gold) {
  if (gold) {
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 3.5
    ctx.beginPath(); ctx.roundRect(-3.5, -3.5, 107, 152, 16); ctx.stroke()
  }
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.35)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 4
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.roundRect(0, 0, 100, 145, 14); ctx.fill()
  ctx.restore()
}

function drawFace(ctx, card, gold) {
  const { c, d } = HEX[card.c] ?? HEX.w
  const wild = card.c === 'w'
  const isNum = !SHAPES.has(card.v)
  const plus = card.v === 'D' ? '+2' : card.v === 'F' ? '+4' : null
  const under = card.v === '6' || card.v === '9' // 6 и 9 подчёркнуты, чтобы не путать вверх ногами

  frame(ctx, gold)
  ctx.fillStyle = c
  ctx.beginPath(); ctx.roundRect(4.5, 4.5, 91, 136, 10); ctx.fill()

  if (wild) {
    const g = ctx.createLinearGradient(16, 22, 84, 125)
    RAINBOW.forEach((f, i) => g.addColorStop(i / 3, f))
    ctx.fillStyle = '#14112e'; ctx.fill(ARCH)
    ctx.strokeStyle = g; ctx.lineWidth = 4.5; ctx.stroke(ARCH)
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill(ARCH)
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.6; ctx.stroke(ARCH)
  }

  if (isNum) {
    text(ctx, card.v, 50, 103, 52, { fill: d, under })
    text(ctx, card.v, 50, 100, 52, { fill: '#fff', stroke: d, lw: 3.4, under })
  } else {
    const cy = plus ? 77 : 84
    const size = plus ? 40 : 46
    if (!wild) shapeAt(ctx, card.v, 50, cy + 3, size, d)
    shapeAt(ctx, card.v, 50, cy, size, '#fff')
  }
  if (plus) {
    ctx.fillStyle = wild ? GOLD : '#fff'
    ctx.beginPath(); ctx.roundRect(33, 104, 34, 15, 7.5); ctx.fill()
    text(ctx, plus, 50, 115.5, 11, { fill: wild ? INK : d })
  }

  const corner = () => {
    const t = plus ?? (isNum ? card.v : null)
    if (t) text(ctx, t, 13, 21, t.length > 1 ? 13 : 17, { fill: '#fff', stroke: d, lw: 3, under })
    else { shapeAt(ctx, card.v, 13, 15, 15, d); shapeAt(ctx, card.v, 13, 15, 13, '#fff') }
  }
  corner()
  ctx.save(); rotAbout(ctx, 180, 50, 72.5); corner(); ctx.restore()
}

function drawBack(ctx, gold) {
  frame(ctx, gold)
  ctx.fillStyle = '#2b2660'
  ctx.beginPath(); ctx.roundRect(4.5, 4.5, 91, 136, 10); ctx.fill()
  const panel = new Path2D()
  panel.roundRect(10, 10, 80, 125, 7)
  ctx.fillStyle = '#1f1a4d'; ctx.fill(panel)
  ctx.save(); ctx.clip(panel)
  ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 2
  for (let k = -150; k < 150; k += 7) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + 150, 150); ctx.stroke() }
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke(panel)
  RAINBOW.forEach((f, i) => {
    ctx.strokeStyle = f; ctx.lineWidth = 5.5; ctx.lineCap = 'butt'
    const a = -Math.PI / 2 + (i * Math.PI) / 2
    ctx.beginPath(); ctx.arc(50, 72.5, 22, a, a + Math.PI / 2); ctx.stroke()
  })
  ctx.fillStyle = '#1a1636'
  ctx.beginPath(); ctx.arc(50, 72.5, 18.5, 0, Math.PI * 2); ctx.fill()
  ctx.save(); rotAbout(ctx, 45, 50, 72.5)
  ;[['#e8474f', 43, 65.5], ['#f6c33b', 50.6, 65.5], ['#3b78e3', 43, 73.1], ['#2aa56e', 50.6, 73.1]].forEach(([f, x, y]) => {
    ctx.fillStyle = f; ctx.beginPath(); ctx.roundRect(x, y, 6.4, 6.4, 1.4); ctx.fill()
  })
  ctx.restore()
}

function useCardCanvas(paint, deps) {
  return useCanvas((ctx, w) => {
    const k = w / (100 + PAD * 2)
    ctx.scale(k, k)
    ctx.translate(PAD, PAD)
    paint(ctx)
  }, deps)
}

// gold — золотая обводка вокруг карты (подходящая для хода)
export function Card({ card, className = '', style, gold = false }) {
  const ref = useCardCanvas((ctx) => drawFace(ctx, card, gold), [card.c, card.v, gold])
  return (
    <div className={`card ${card.c === 'w' ? 'wild' : `c-${card.c}`} ${className}`} style={style}>
      <canvas ref={ref} className="card-cv" aria-hidden="true" />
    </div>
  )
}

// gold — золотая обводка (колода, из которой можно взять карту)
export function CardBack({ gold = false }) {
  const ref = useCardCanvas((ctx) => drawBack(ctx, gold), [gold])
  return (
    <div className="back">
      <canvas ref={ref} className="card-cv" aria-hidden="true" />
    </div>
  )
}

/* ---------- Paint: цветная заливка, рамка и текст элемента — на canvas ----------
   Ставится внутрь элемента с классом painted (position: relative).
   bg — цвет заливки (иначе берётся CSS-переменная --fill элемента),
   ring — цвет рамки, text/color — надпись и её цвет (иначе --ink, иначе белый).
   Сам текст элемента остаётся в разметке, но прозрачный: его читают экранные
   читалки и по нему считается размер, а виден текст с холста. */
export function Paint({ bg, ring, text: label, color }) {
  const ref = useCanvas((ctx, w, h, cv) => {
    const host = cv.parentElement
    if (!host) return
    const cs = getComputedStyle(host)
    const r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, h / 2, w / 2)
    const fill = bg ?? (cs.getPropertyValue('--fill').trim() || null)
    if (fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(0, 0, w, h, r); ctx.fill() }
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(1, 1, w - 2, h - 2, Math.max(0, r - 1)); ctx.stroke() }
    if (label) {
      const str = cs.textTransform === 'uppercase' ? label.toUpperCase() : label
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing
      ctx.fillStyle = color ?? (cs.getPropertyValue('--ink').trim() || '#fff')
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      const m = ctx.measureText(str)
      // холст покрывает внутреннюю часть элемента (без рамки), центрируем по ней
      const cx = w / 2 + (parseFloat(cs.letterSpacing) || 0) / 2
      const cy = h / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
      ctx.fillText(str, cx, cy)
    }
  }, [bg, ring, label, color])
  return <canvas ref={ref} className="paint" aria-hidden="true" />
}

// прежнее имя: заливка цветом из --fill
export const Fill = () => <Paint />

/* ---------- свечение под сбросом цвета текущей масти ---------- */
export function Glow({ color }) {
  const ref = useCanvas((ctx, w, h) => {
    const m = 20
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = 26
    ctx.globalAlpha = 0.55
    ctx.fillStyle = color
    ctx.beginPath(); ctx.roundRect(m, m, w - m * 2, h - m * 2, 16); ctx.fill()
    ctx.restore()
    ctx.globalAlpha = 0.25
    ctx.fillStyle = color
    ctx.beginPath(); ctx.roundRect(m - 4, m - 4, w - (m - 4) * 2, h - (m - 4) * 2, 18); ctx.fill()
  }, [color])
  return <canvas ref={ref} className="glow-cv" aria-hidden="true" />
}
