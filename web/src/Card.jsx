export const COLOR_NAME = { r: 'красный', y: 'жёлтый', g: 'зелёный', b: 'синий' }

/*
  Карты рисуются целиком в SVG, а не CSS-фонами.

  Тёмный режим Samsung Internet и «автозатемнение сайтов» в Android
  перекрашивают яркие фоны элементов в тёмные (красный #e8474f приезжал
  почти бордовым, белая рамка — серой) и не дают сайту от этого отказаться.
  Заливки SVG они не трогают: так же это решено в trainer (коммит cfac546,
  подсветка блоков в «Корси»). Цвета здесь заданы прямо в атрибутах,
  без CSS-переменных, чтобы ничего не зависело от стилей страницы.
*/

const HEX = {
  r: { c: '#e8474f', d: '#a8232f' },
  y: { c: '#f6c33b', d: '#9a6200' },
  g: { c: '#2aa56e', d: '#157049' },
  b: { c: '#3b78e3', d: '#1f4aa3' },
  w: { c: '#1d2557', d: '#0e0c22' },
}
const RAINBOW = ['#e8474f', '#f6c33b', '#2aa56e', '#3b78e3']
const GOLD = '#ffd36b'
const DISPLAY = { fontFamily: "'Unbounded', 'Arial Black', system-ui, sans-serif", fontWeight: 900 }

/* ---------- значки особых карт, в координатах 24×24 ---------- */

function SkipShape({ color }) {
  return (
    <g fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M6.6 17.4 17.4 6.6" />
    </g>
  )
}

function ReverseShape({ color }) {
  return (
    <g fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5a7 7 0 0 1 12.2-4.2L19 8.5" />
      <path d="M19 4v4.5h-4.5" />
      <path d="M19.5 13.5a7 7 0 0 1-12.2 4.2L5 15.5" />
      <path d="M5 20v-4.5h4.5" />
    </g>
  )
}

// «+2»: две маленькие карты внахлёст
function PlusTwoShape({ color }) {
  return (
    <g fill={color}>
      <rect x="3.5" y="5" width="10" height="14" rx="2.2" opacity=".55" transform="rotate(-12 8.5 12)" />
      <rect x="10" y="4" width="10" height="14" rx="2.2" transform="rotate(10 15 11)" />
    </g>
  )
}

// «+4»: веер из четырёх карт всех цветов
function PlusFourShape() {
  return (
    <g>
      {['#3b78e3', '#2aa56e', '#f6c33b', '#e8474f'].map((f, i) => (
        <rect key={i} x="8" y="3.5" width="8" height="12" rx="1.8" fill={f} stroke="#fff" strokeWidth="1"
          transform={`rotate(${-33 + i * 22} 12 20)`} />
      ))}
    </g>
  )
}

// заказ цвета: четырёхлепестковая звезда
function WildShape() {
  return (
    <g>
      {RAINBOW.map((f, i) => (
        <path key={f} d="M12 12C10 9 10.4 4.6 12 2.5 13.6 4.6 14 9 12 12Z" fill={f} stroke="#fff" strokeWidth=".8"
          transform={`rotate(${i * 90 + 45} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="1.8" fill="#fff" />
    </g>
  )
}

const SHAPES = { S: SkipShape, R: ReverseShape, D: PlusTwoShape, F: PlusFourShape, W: WildShape }
const SHORT = { S: '⊘', R: '⇄', D: '+2', F: '+4', W: '✦' }

// значок размером size с центром в (cx, cy)
function Shape({ v, cx, cy, size, color }) {
  const S = SHAPES[v]
  const k = size / 24
  return <g transform={`translate(${cx - size / 2} ${cy - size / 2}) scale(${k})`}><S color={color} /></g>
}

export function glyph(card) {
  return SHORT[card.v] ?? card.v
}

export function cardLabel(card) {
  if (card.c === 'w') return card.v === 'F' ? 'Заказ цвета, плюс четыре' : 'Заказ цвета'
  const v = { S: 'пропуск хода', R: 'разворот', D: 'плюс два' }[card.v] ?? card.v
  return `${COLOR_NAME[card.c]} ${v}`
}

/* ---------- лицо карты ---------- */

// окно-арка в центре карты (координаты карты 100×145)
const ARCH = 'M16 125 V56 A34 34 0 0 1 84 56 V113 Q84 125 72 125 H28 Q16 125 16 113 Z'

// gold — золотая обводка вокруг карты (подходящая для хода)
export function Card({ card, className = '', style, gold = false }) {
  const { c, d } = HEX[card.c] ?? HEX.w
  const wild = card.c === 'w'
  const isNum = !SHAPES[card.v]
  const plus = card.v === 'D' ? '+2' : card.v === 'F' ? '+4' : null
  const under = card.v === '6' || card.v === '9' ? 'underline' : undefined // 6 и 9 подчёркнуты, чтобы не путать вверх ногами
  const cornerText = plus ?? (isNum ? card.v : null)
  const gid = `rb-${card.id ?? 'x'}-${card.v}`

  const corner = cornerText
    ? <text x="13" y="21" textAnchor="middle" fontSize={cornerText.length > 1 ? 13 : 17} fill="#fff" stroke={d} strokeWidth="3"
        strokeLinejoin="round" paintOrder="stroke" textDecoration={under} style={DISPLAY}>{cornerText}</text>
    : <g><Shape v={card.v} cx={13} cy={15} size={15} color={d} /><Shape v={card.v} cx={13} cy={15} size={13} color="#fff" /></g>

  return (
    <div className={`card ${wild ? 'wild' : `c-${card.c}`} ${className}`} style={style}>
      <svg className="card-svg" viewBox="0 0 100 145" aria-hidden="true" focusable="false">
        {wild && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              {RAINBOW.map((f, i) => <stop key={f} offset={i / 3} stopColor={f} />)}
            </linearGradient>
          </defs>
        )}
        {gold && <rect x="-3.5" y="-3.5" width="107" height="152" rx="16" fill="none" stroke={GOLD} strokeWidth="3.5" />}
        <rect width="100" height="145" rx="14" fill="#fff" />
        <rect x="4.5" y="4.5" width="91" height="136" rx="10" fill={c} />
        {wild
          ? <path d={ARCH} fill="#14112e" stroke={`url(#${gid})`} strokeWidth="4.5" />
          : <path d={ARCH} fill="#fff" fillOpacity=".16" stroke="#fff" strokeOpacity=".6" strokeWidth="1.6" />}

        {isNum ? (
          <g style={DISPLAY} textAnchor="middle">
            <text x="50" y="103" fontSize="52" fill={d} textDecoration={under}>{card.v}</text>
            <text x="50" y="100" fontSize="52" fill="#fff" stroke={d} strokeWidth="3.4" strokeLinejoin="round" paintOrder="stroke"
              textDecoration={under}>{card.v}</text>
          </g>
        ) : (
          <g>
            {!wild && <Shape v={card.v} cx={50} cy={plus ? 80 : 87} size={plus ? 40 : 46} color={d} />}
            <Shape v={card.v} cx={50} cy={plus ? 77 : 84} size={plus ? 40 : 46} color="#fff" />
          </g>
        )}
        {plus && (
          <g>
            <rect x="33" y="104" width="34" height="15" rx="7.5" fill={wild ? GOLD : '#fff'} />
            <text x="50" y="115.5" textAnchor="middle" fontSize="11" fill={wild ? '#1a1730' : d} style={DISPLAY}>{plus}</text>
          </g>
        )}

        {corner}
        <g transform="rotate(180 50 72.5)">{corner}</g>
      </svg>
      <span className="shine" />
    </div>
  )
}

/* ---------- рубашка ---------- */

// gold — золотая обводка (колода, из которой можно взять карту)
export function CardBack({ gold = false }) {
  const r = 22
  const quarter = (2 * Math.PI * r) / 4
  return (
    <div className="back">
      <svg className="card-svg" viewBox="0 0 100 145" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="back-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2" height="7" fill="#fff" fillOpacity=".05" />
          </pattern>
        </defs>
        {gold && <rect x="-3.5" y="-3.5" width="107" height="152" rx="16" fill="none" stroke={GOLD} strokeWidth="3.5" />}
        <rect width="100" height="145" rx="14" fill="#fff" />
        <rect x="4.5" y="4.5" width="91" height="136" rx="10" fill="#2b2660" />
        <rect x="10" y="10" width="80" height="125" rx="7" fill="#1f1a4d" stroke="#fff" strokeOpacity=".35" strokeWidth="1" />
        <rect x="10" y="10" width="80" height="125" rx="7" fill="url(#back-hatch)" />
        {RAINBOW.map((f, i) => (
          <circle key={f} cx="50" cy="72.5" r={r} fill="none" stroke={f} strokeWidth="5.5"
            strokeDasharray={`${quarter} ${quarter * 3}`} strokeDashoffset={-quarter * i} transform="rotate(-90 50 72.5)" />
        ))}
        <circle cx="50" cy="72.5" r="18.5" fill="#1a1636" />
        <g transform="rotate(45 50 72.5)">
          <rect x="43" y="65.5" width="6.4" height="6.4" rx="1.4" fill="#e8474f" />
          <rect x="50.6" y="65.5" width="6.4" height="6.4" rx="1.4" fill="#f6c33b" />
          <rect x="43" y="73.1" width="6.4" height="6.4" rx="1.4" fill="#3b78e3" />
          <rect x="50.6" y="73.1" width="6.4" height="6.4" rx="1.4" fill="#2aa56e" />
        </g>
      </svg>
    </div>
  )
}

/* ---------- цветная заливка для кнопок и меток ----------
   Вместо CSS-фона: такую заливку тёмный режим браузера не перекрашивает.
   Цвет — CSS-переменная --fill у родителя. */
export function Fill() {
  return (
    <svg className="fill" aria-hidden="true" focusable="false" preserveAspectRatio="none" viewBox="0 0 10 10">
      <rect width="10" height="10" fill="currentColor" />
    </svg>
  )
}
