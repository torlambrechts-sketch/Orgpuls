import { LawArt } from './LawArt'
import { SafetyRepArt } from './SafetyRepArt'

/**
 * The drawn picture beside an article's title (D-237). Which one an article gets is data – its `art` in
 * lib/marketing/site.ts – and the drawings are the site's tokens on the same mint ground as LawArt.
 * Decorative: the article says everything the picture shows, so it is hidden from screen readers.
 */
export type ArtKind = 'law' | 'rep' | 'risk' | 'board' | 'meeting' | 'survey' | 'wheel' | 'anon'

const INK = '#191510'
const PAPER = '#FFFDF6'
const Ground = () => (
  <>
    <circle cx="220" cy="184" r="156" fill="#CFE7E4" />
    <circle cx="62" cy="86" r="9" fill="#F5C64A" />
    <circle cx="392" cy="270" r="7" fill="#F0B9A0" />
    <circle cx="380" cy="60" r="5" fill={INK} />
  </>
)
const svg = (children: React.ReactNode, className: string) => (
  <svg viewBox="0 0 440 360" aria-hidden="true" className={className} fill="none">
    <Ground />
    {children}
  </svg>
)

/** a 3×3 risk matrix, warm towards the corner of high likelihood and high consequence, under a magnifier */
function RiskArt({ className }: { className: string }) {
  const fills = [
    ['#FBEBBE', '#FBD5C4', '#F0B9A0'],
    ['#CFE7E4', '#FBEBBE', '#FBD5C4'],
    ['#B5DAD4', '#CFE7E4', '#FBEBBE'],
  ]
  return svg(
    <>
      <rect x="104" y="58" width="232" height="232" rx="20" fill={PAPER} stroke={INK} strokeWidth="2" />
      {fills.map((row, r) =>
        row.map((f, c) => (
          <rect key={`${r}${c}`} x={124 + c * 66} y={78 + r * 66} width="58" height="58" rx="10" fill={f} stroke={INK} strokeWidth="1.6" />
        )),
      )}
      <path d="M96 300 V58" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M90 66 L96 56 L102 66" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M96 300 H338" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M330 294 L340 300 L330 306" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(318 238)">
        <circle r="40" fill="#FFFDF6" fillOpacity="0.6" stroke={INK} strokeWidth="6" />
        <path d="M28 28 L58 58" stroke={INK} strokeWidth="12" strokeLinecap="round" />
      </g>
    </>,
    className,
  )
}

/** a board of three columns, a card on its way to done */
function BoardArt({ className }: { className: string }) {
  const col = (x: number, fill: string, cards: number, done = false) => (
    <g>
      <rect x={x} y="74" width="96" height="214" rx="16" fill={fill} stroke={INK} strokeWidth="2" />
      <rect x={x + 16} y="90" width="44" height="8" rx="4" fill={INK} />
      {Array.from({ length: cards }).map((_, i) => (
        <g key={i}>
          <rect x={x + 12} y={112 + i * 56} width="72" height="44" rx="10" fill={PAPER} stroke={INK} strokeWidth="1.6" />
          <rect x={x + 22} y={124 + i * 56} width="40" height="6" rx="3" fill="#C4BCA8" />
          {done ? (
            <path d={`M${x + 22} ${143 + i * 56} l5 5 l10 -10`} stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <rect x={x + 22} y={138 + i * 56} width="28" height="6" rx="3" fill="#E8DFC9" />
          )}
        </g>
      ))}
    </g>
  )
  return svg(
    <>
      {col(62, '#FBEBBE', 3)}
      {col(172, '#F7EDD2', 2)}
      {col(282, '#CFE7E4', 2, true)}
      <g transform="rotate(-8 258 236)">
        <rect x="214" y="214" width="84" height="48" rx="10" fill="#F5C64A" stroke={INK} strokeWidth="2" />
        <rect x="226" y="228" width="44" height="7" rx="3.5" fill={INK} />
        <rect x="226" y="242" width="30" height="6" rx="3" fill={INK} fillOpacity="0.45" />
      </g>
      <path d="M300 236 C 316 228, 324 214, 324 204" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeDasharray="4 5" />
      <path d="M318 210 L324 200 L330 210" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    className,
  )
}

/** colleagues round a table, notes on the wall behind them */
function MeetingArt({ className }: { className: string }) {
  const person = (x: number, y: number, fill: string, s = 1) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cy="-40" r="18" fill={PAPER} stroke={INK} strokeWidth="2" />
      <path d="M-32 26 C-32 -4 -18 -16 0 -16 C18 -16 32 -4 32 26 Z" fill={fill} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </g>
  )
  return svg(
    <>
      {[
        [96, 70, '#FBEBBE', -6],
        [170, 58, '#FBD5C4', 4],
        [244, 66, '#F5C64A', -3],
        [318, 60, '#CFE7E4', 5],
      ].map(([x, y, f, r], i) => (
        <g key={i} transform={`rotate(${r} ${Number(x) + 30} ${Number(y) + 30})`}>
          <rect x={x} y={y} width="60" height="56" rx="8" fill={f as string} stroke={INK} strokeWidth="1.6" />
          <rect x={Number(x) + 10} y={Number(y) + 14} width="38" height="5" rx="2.5" fill={INK} fillOpacity="0.7" />
          <rect x={Number(x) + 10} y={Number(y) + 26} width="28" height="5" rx="2.5" fill={INK} fillOpacity="0.35" />
        </g>
      ))}
      {person(110, 214, '#FBEBBE', 0.95)}
      {person(330, 214, '#FBD5C4', 0.95)}
      {person(176, 196, PAPER, 0.85)}
      {person(264, 196, '#B5DAD4', 0.85)}
      <ellipse cx="220" cy="262" rx="150" ry="40" fill={PAPER} stroke={INK} strokeWidth="2" />
      <rect x="186" y="246" width="70" height="26" rx="6" fill="#F5C64A" stroke={INK} strokeWidth="1.6" />
      <path d="M198 262 h18 M198 256 h34" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    </>,
    className,
  )
}

/** a phone with a questionnaire on it: statements and five-point scales */
function SurveyArt({ className }: { className: string }) {
  const row = (y: number, chosen: number) => (
    <g>
      <rect x="168" y={y} width="104" height="7" rx="3.5" fill="#C4BCA8" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={176 + i * 22} cy={y + 24} r="8" fill={i === chosen ? '#F5C64A' : PAPER} stroke={INK} strokeWidth="1.6" />
      ))}
    </g>
  )
  return svg(
    <>
      <rect x="146" y="42" width="148" height="276" rx="28" fill={INK} />
      <rect x="156" y="62" width="128" height="240" rx="18" fill={PAPER} />
      <rect x="196" y="50" width="48" height="6" rx="3" fill="#3A342A" />
      <rect x="168" y="80" width="64" height="10" rx="5" fill={INK} />
      {row(108, 3)}
      {row(160, 1)}
      {row(212, 4)}
      <rect x="168" y="262" width="104" height="26" rx="13" fill="#F5C64A" stroke={INK} strokeWidth="1.6" />
      <g transform="translate(330 120)">
        <rect x="-36" y="-26" width="72" height="52" rx="14" fill={PAPER} stroke={INK} strokeWidth="2" />
        <path d="M-16 0 l10 10 l22 -22" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>,
    className,
  )
}

/** the year as a wheel of twelve months, the main survey in yellow and the follow-ups in mint */
function WheelArt({ className }: { className: string }) {
  const marked: Record<number, string> = { 1: '#F5C64A', 2: '#FBEBBE', 4: '#B5DAD4', 8: '#B5DAD4', 10: '#B5DAD4' }
  const seg = (i: number) => {
    const a0 = ((i * 30 - 90 - 14) * Math.PI) / 180
    const a1 = ((i * 30 - 90 + 14) * Math.PI) / 180
    const [r0, r1] = [64, 118]
    const p = (r: number, a: number) => `${(220 + r * Math.cos(a)).toFixed(1)} ${(184 + r * Math.sin(a)).toFixed(1)}`
    return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`
  }
  return svg(
    <>
      <circle cx="220" cy="184" r="132" fill={PAPER} stroke={INK} strokeWidth="2" />
      {Array.from({ length: 12 }).map((_, i) => (
        <path key={i} d={seg(i)} fill={marked[i] ?? '#F2EAD6'} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      ))}
      <circle cx="220" cy="184" r="46" fill={INK} />
      <path d="M220 160 V184 L238 196" stroke={PAPER} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M342 92 A150 150 0 0 1 368 150" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M360 146 L368 156 L374 144" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    className,
  )
}

/** three answers that cannot be told apart, behind a lock */
function AnonArt({ className }: { className: string }) {
  const card = (x: number, y: number, r: number) => (
    <g transform={`rotate(${r} ${x + 60} ${y + 40})`}>
      <rect x={x} y={y} width="120" height="80" rx="14" fill={PAPER} stroke={INK} strokeWidth="2" />
      <circle cx={x + 26} cy={y + 28} r="12" fill="#E8DFC9" stroke={INK} strokeWidth="1.6" />
      <rect x={x + 46} y={y + 22} width="56" height="8" rx="4" fill="#C4BCA8" />
      <rect x={x + 18} y={y + 52} width="84" height="7" rx="3.5" fill="#E8DFC9" />
    </g>
  )
  return svg(
    <>
      {card(70, 96, -8)}
      {card(250, 92, 7)}
      {card(150, 214, -3)}
      <g transform="translate(220 150)">
        <path d="M-30 -10 V-34 A30 30 0 0 1 30 -34 V-10" stroke={INK} strokeWidth="9" strokeLinecap="round" />
        <rect x="-50" y="-14" width="100" height="84" rx="16" fill="#F5C64A" stroke={INK} strokeWidth="2" />
        <circle cy="20" r="11" fill={INK} />
        <path d="M0 26 V46" stroke={INK} strokeWidth="7" strokeLinecap="round" />
      </g>
    </>,
    className,
  )
}

export function ArticleArt({ kind, className = '' }: { kind: ArtKind; className?: string }) {
  switch (kind) {
    case 'law':
      return <LawArt className={className} />
    case 'rep':
      return <SafetyRepArt className={className} />
    case 'risk':
      return <RiskArt className={className} />
    case 'board':
      return <BoardArt className={className} />
    case 'meeting':
      return <MeetingArt className={className} />
    case 'survey':
      return <SurveyArt className={className} />
    case 'wheel':
      return <WheelArt className={className} />
    case 'anon':
      return <AnonArt className={className} />
  }
}

/**
 * A factor article's picture: its own three statements as a filled-in questionnaire card on the mint
 * ground. The marks are illustrative, not data – they vary from row to row so the card reads as a form
 * in use – and the whole card is decorative, the statements being in the article's text.
 */
export function FactorArt({ label, statements, className = '' }: { label: string; statements: string[]; className?: string }) {
  const chosen = [3, 1, 4]
  return (
    <div aria-hidden="true" className={`relative ${className}`}>
      <div className="absolute inset-[6%] rounded-pill bg-mint" />
      <span className="absolute left-[4%] top-[14%] h-[18px] w-[18px] rounded-pill bg-ac" />
      <span className="absolute bottom-[12%] right-[4%] h-[14px] w-[14px] rounded-pill bg-peach2" />
      <div className="relative mx-auto mt-[12%] w-[86%] rotate-[-2deg] rounded-[20px] border-2 border-ink bg-sf p-[22px] shadow-[0_18px_40px_-24px_rgba(25,21,16,.45)]">
        <span className="inline-block rounded-pill border border-ink bg-sbg px-[12px] py-[5px] text-[12px] font-bold">{label}</span>
        <ul className="m-0 mt-[14px] flex list-none flex-col gap-[14px] p-0">
          {statements.map((s, i) => (
            <li key={i}>
              <span className="block text-[13.5px] font-semibold leading-[1.4] [text-wrap:pretty]">{s}</span>
              <span className="mt-[7px] flex gap-[8px]">
                {[0, 1, 2, 3, 4].map((d) => (
                  <span key={d} className={`h-[16px] w-[16px] rounded-pill border-[1.6px] border-ink ${d === chosen[i % 3] ? 'bg-ac' : 'bg-sf'}`} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
