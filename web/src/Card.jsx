export const COLOR_NAME = { r: 'красный', y: 'жёлтый', g: 'зелёный', b: 'синий' }

/* ---------- иконки особых карт (SVG, рисуются цветом текста) ---------- */

function SkipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M6.6 17.4 17.4 6.6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function ReverseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5a7 7 0 0 1 12.2-4.2L19 8.5" />
      <path d="M19 4v4.5h-4.5" />
      <path d="M19.5 13.5a7 7 0 0 1-12.2 4.2L5 15.5" />
      <path d="M5 20v-4.5h4.5" />
    </svg>
  )
}

// «+2»: две маленькие карты внахлёст
function PlusTwoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      <rect x="3.5" y="5" width="10" height="14" rx="2.2" fill="currentColor" opacity=".55" transform="rotate(-12 8.5 12)" />
      <rect x="10" y="4" width="10" height="14" rx="2.2" fill="currentColor" transform="rotate(10 15 11)" />
    </svg>
  )
}

// «+4»: веер из четырёх карт всех цветов
function PlusFourIcon() {
  const fills = ['var(--blue)', 'var(--green)', 'var(--yellow)', 'var(--red)']
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      {fills.map((f, i) => (
        <rect key={i} x="8" y="3.5" width="8" height="12" rx="1.8" fill={f} stroke="#fff" strokeWidth="1"
          transform={`rotate(${-33 + i * 22} 12 20)`} />
      ))}
    </svg>
  )
}

// заказ цвета: четырёхлепестковая звезда
function WildIcon() {
  const petals = [['var(--red)', 0], ['var(--yellow)', 90], ['var(--green)', 180], ['var(--blue)', 270]]
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      {petals.map(([f, a]) => (
        <path key={a} d="M12 12C10 9 10.4 4.6 12 2.5 13.6 4.6 14 9 12 12Z" fill={f} stroke="#fff" strokeWidth=".8" transform={`rotate(${a + 45} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="1.8" fill="#fff" />
    </svg>
  )
}

const ICONS = { S: SkipIcon, R: ReverseIcon, D: PlusTwoIcon, F: PlusFourIcon, W: WildIcon }
const SHORT = { S: '⊘', R: '⇄', D: '+2', F: '+4', W: '✦' }

export function glyph(card) {
  return SHORT[card.v] ?? card.v
}

export function cardLabel(card) {
  if (card.c === 'w') return card.v === 'F' ? 'Заказ цвета, плюс четыре' : 'Заказ цвета'
  const v = { S: 'пропуск хода', R: 'разворот', D: 'плюс два' }[card.v] ?? card.v
  return `${COLOR_NAME[card.c]} ${v}`
}

/* ---------- карта ---------- */

export function Card({ card, className = '', style }) {
  const Icon = ICONS[card.v]
  const isNum = !Icon
  const u = card.v === '6' || card.v === '9' ? ' u' : '' // 6 и 9 подчёркнуты, чтобы не путать вверх ногами
  const corner = card.v === 'D' || card.v === 'F' ? SHORT[card.v] : isNum ? card.v : null
  const kind = card.c === 'w' ? 'wild' : `c-${card.c}`

  return (
    <div className={`card ${kind} ${isNum ? 'num' : 'act'} ${className}`} style={style}>
      <span className="pattern" />
      <span className="window">
        {isNum ? <span className="face">{card.v}</span> : <Icon />}
        {card.v === 'D' && <span className="badge">+2</span>}
        {card.v === 'F' && <span className="badge">+4</span>}
      </span>
      {['tl', 'br'].map((pos) => (
        <span key={pos} className={`corner ${pos}${u}`}>{corner ?? <Icon />}</span>
      ))}
      <span className="shine" />
    </div>
  )
}

export function CardBack() {
  return (
    <div className="back">
      <span className="back-ring">
        <span className="pips">
          <i style={{ background: 'var(--red)' }} />
          <i style={{ background: 'var(--yellow)' }} />
          <i style={{ background: 'var(--blue)' }} />
          <i style={{ background: 'var(--green)' }} />
        </span>
      </span>
    </div>
  )
}

export function Chip({ card }) {
  return <span className={`chip c-${card.c}`}>{glyph(card)}</span>
}
