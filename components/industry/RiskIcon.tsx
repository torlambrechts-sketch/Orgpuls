import type { RiskKind } from '@/content/industries/landing'

/**
 * A challenge's drawing on an industry page written as an article (D-240): a line icon in ink on a
 * coloured disc, in the site's art style. Decorative – the card's title says what it is. The kinds are
 * the registry's (`article.icons`, content/industries/landing.ts).
 */
const FILL: Record<RiskKind, string> = {
  threat: '#F0B9A0',
  alone: '#F5C64A',
  customer: '#FBD5C4',
  staffing: '#CFE7E4',
  rota: '#FBEBBE',
  newcomer: '#CFE7E4',
  lifting: '#F5DC96',
  harassment: '#FBD5C4',
  clock: '#F5C64A',
  sites: '#CFE7E4',
  language: '#FBEBBE',
  report: '#F0B9A0',
  team: '#FBD5C4',
  longday: '#F5DC96',
  helmet: '#F5C64A',
  heart: '#FBD5C4',
  role: '#FBEBBE',
  night: '#CFE7E4',
  parttime: '#F5DC96',
  focus: '#CFE7E4',
  phone: '#F5C64A',
  home: '#FBEBBE',
  hybrid: '#CFE7E4',
  deadline: '#F0B9A0',
  change: '#F5DC96',
  desk: '#FBEBBE',
  silence: '#FBD5C4',
  paper: '#FBEBBE',
  parents: '#FBD5C4',
  child: '#F5DC96',
  noise: '#CFE7E4',
}

const INK = '#191510'
const ink = { stroke: INK, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
const paper = { ...ink, fill: '#FFFDF6' }

/** a person, head and shoulders, centred on x with the head at y */
const person = (x: number, y: number, s = 1) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle r="5.5" {...paper} />
    <path d="M-10 19 C-10 10 -5 7 0 7 C5 7 10 10 10 19 Z" {...paper} />
  </g>
)

const DRAW: Record<RiskKind, React.ReactNode> = {
  // a warning triangle
  threat: (
    <>
      <path d="M28 12 L45 42 H11 Z" {...paper} />
      <path d="M28 23 V32" {...ink} strokeWidth={3} />
      <circle cx="28" cy="37" r="1.8" fill={INK} />
    </>
  ),
  // one person under the moon
  alone: (
    <>
      {person(26, 24)}
      <path d="M41 11 A7 7 0 1 0 46 22 A6 6 0 0 1 41 11 Z" fill={INK} />
    </>
  ),
  // a speech bubble with a jagged mark
  customer: (
    <>
      <path d="M12 14 H44 A4 4 0 0 1 48 18 V34 A4 4 0 0 1 44 38 H24 L16 45 V38 H12 A4 4 0 0 1 8 34 V18 A4 4 0 0 1 12 14 Z" {...paper} />
      <path d="M17 26 L22 21 L27 30 L32 21 L37 30 L40 26" {...ink} />
    </>
  ),
  // a queue of three before a clock
  staffing: (
    <>
      {[12, 22, 32].map((x) => (
        <g key={x}>{person(x, 26, 0.7)}</g>
      ))}
      <circle cx="42" cy="16" r="8" {...paper} />
      <path d="M42 11 V16 L45 18" {...ink} />
    </>
  ),
  // a calendar
  rota: (
    <>
      <rect x="11" y="14" width="34" height="30" rx="4" {...paper} />
      <path d="M11 22 H45 M19 10 V17 M37 10 V17" {...ink} />
      {[0, 1, 2].map((c) =>
        [0, 1].map((r) => (
          <rect key={`${c}${r}`} x={17 + c * 9} y={27 + r * 8} width="5" height="4" rx="1" fill={c === 2 && r === 1 ? INK : '#C4BCA8'} />
        )),
      )}
    </>
  ),
  // a person with a name badge
  newcomer: (
    <>
      <circle cx="28" cy="20" r="7" {...paper} />
      <path d="M14 45 C14 34 20 30 28 30 C36 30 42 34 42 45 Z" {...paper} />
      <rect x="30" y="35" width="10" height="6" rx="1.5" fill="#F5C64A" stroke={INK} strokeWidth="1.6" />
    </>
  ),
  // a heavy box with an arrow up
  lifting: (
    <>
      <rect x="12" y="24" width="28" height="20" rx="3" {...paper} />
      <path d="M12 31 H40 M26 24 V31" {...ink} />
      <path d="M44 34 V12 M39 17 L44 12 L49 17" {...ink} />
    </>
  ),
  // a raised hand: stop
  harassment: (
    <path
      d="M19 30 V17 A2.5 2.5 0 0 1 24 17 V27 V13 A2.5 2.5 0 0 1 29 13 V27 V15 A2.5 2.5 0 0 1 34 15 V28 V20 A2.5 2.5 0 0 1 39 20 V33 C39 40 34 45 28 45 C23 45 20 42 17 37 L13 31 A2.5 2.5 0 0 1 17 28 Z"
      {...paper}
    />
  ),
  // a clock with a short-cut arrow
  clock: (
    <>
      <circle cx="26" cy="29" r="14" {...paper} />
      <path d="M26 21 V29 L32 32" {...ink} />
      <path d="M38 12 L46 12 L46 20 M46 12 L37 21" {...ink} />
    </>
  ),
  // two firms' flags on one site
  sites: (
    <>
      <path d="M8 44 H48" {...ink} />
      <path d="M16 44 V14 M38 44 V20" {...ink} />
      <path d="M16 14 H28 L25 19 L28 24 H16 Z" fill="#F5C64A" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M38 20 H50 L47 25 L50 30 H38 Z" fill="#F0B9A0" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <rect x="22" y="32" width="10" height="12" {...paper} />
    </>
  ),
  // two speech bubbles in different scripts
  language: (
    <>
      <path d="M8 12 H30 A3 3 0 0 1 33 15 V27 A3 3 0 0 1 30 30 H16 L11 35 V30 H8 A3 3 0 0 1 5 27 V15 A3 3 0 0 1 8 12 Z" {...paper} />
      <path d="M26 24 H48 A3 3 0 0 1 51 27 V39 A3 3 0 0 1 48 42 H45 V47 L40 42 H26 A3 3 0 0 1 23 39 V27 A3 3 0 0 1 26 24 Z" {...paper} />
      <path d="M11 19 H27 M11 24 H21" {...ink} strokeWidth={2} />
      <path d="M33 33 L37 30 L41 34 L45 30" {...ink} strokeWidth={2} />
    </>
  ),
  // a report form with a question mark
  report: (
    <>
      <rect x="14" y="10" width="26" height="36" rx="3" {...paper} />
      <path d="M20 19 H34 M20 25 H30" {...ink} strokeWidth={2} />
      <circle cx="40" cy="38" r="9" fill="#F5C64A" stroke={INK} strokeWidth="2" />
      <path d="M37.5 35.5 A2.5 2.5 0 1 1 41 38 V39.5" {...ink} strokeWidth={2} />
      <circle cx="41" cy="42.5" r="1.2" fill={INK} />
    </>
  ),
  // two people with a gap between them
  team: (
    <>
      {person(17, 22, 0.9)}
      {person(39, 22, 0.9)}
      <path d="M26 30 L30 30 M24 35 L32 35" {...ink} strokeDasharray="2 3" />
    </>
  ),
  // the sun going down over a road
  longday: (
    <>
      <path d="M14 30 A14 14 0 0 1 42 30 Z" fill="#F5C64A" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M8 30 H48" {...ink} />
      <path d="M24 46 L27 34 M32 46 L29 34" {...ink} />
    </>
  ),
  // a hard hat
  helmet: (
    <>
      <path d="M12 36 C12 22 20 15 28 15 C36 15 44 22 44 36 Z" fill="#FFFDF6" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M8 36 H48 V40 H8 Z" {...paper} />
      <path d="M28 15 V24 M21 18 L23 26 M35 18 L33 26" {...ink} strokeWidth={2} />
    </>
  ),
  // a heart held in a hand
  heart: (
    <>
      <path
        d="M28 33 C18 26 14 22 14 17 A6 6 0 0 1 28 15 A6 6 0 0 1 42 17 C42 22 38 26 28 33 Z"
        fill="#F0B9A0"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M8 38 C14 38 18 40 22 42 H34 C36 42 36 39 34 39 H26 M34 40 L44 35 C46 34 48 36 46 38 L36 45 H8" {...ink} />
    </>
  ),
  // arrows pulling three ways
  role: (
    <>
      <circle cx="28" cy="30" r="6" {...paper} />
      <path d="M28 24 V10 M24 14 L28 10 L32 14" {...ink} />
      <path d="M23 33 L11 41 M11 36 L11 41 L16 42" {...ink} />
      <path d="M33 33 L45 41 M40 42 L45 41 L45 36" {...ink} />
    </>
  ),
  // the moon and stars over a bed
  night: (
    <>
      <path d="M30 10 A10 10 0 1 0 40 24 A8 8 0 0 1 30 10 Z" fill={INK} />
      <rect x="10" y="34" width="36" height="8" rx="2" {...paper} />
      <path d="M10 30 V46 M46 38 V46" {...ink} />
      <rect x="12" y="30" width="9" height="5" rx="2" {...paper} />
    </>
  ),
  // a clock face half filled
  parttime: (
    <>
      <circle cx="28" cy="28" r="15" {...paper} />
      <path d="M28 13 A15 15 0 0 1 28 43 Z" fill="#F5C64A" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M28 28 L36 24" {...ink} />
    </>
  ),
  // headphones
  focus: (
    <>
      <path d="M14 34 V28 A14 14 0 0 1 42 28 V34" {...ink} />
      <rect x="10" y="30" width="8" height="14" rx="3" {...paper} />
      <rect x="38" y="30" width="8" height="14" rx="3" {...paper} />
    </>
  ),
  // a phone with a notification
  phone: (
    <>
      <rect x="18" y="10" width="20" height="36" rx="4" {...paper} />
      <path d="M25 41 H31" {...ink} />
      <circle cx="38" cy="12" r="6" fill="#F0B9A0" stroke={INK} strokeWidth="2" />
      <path d="M22 20 H34 M22 26 H30" {...ink} strokeWidth={2} />
    </>
  ),
  // a house with a laptop
  home: (
    <>
      <path d="M10 26 L28 11 L46 26 V45 H10 Z" {...paper} />
      <rect x="19" y="29" width="18" height="11" rx="1.5" {...paper} />
      <path d="M16 42 H40" {...ink} />
    </>
  ),
  // a screen with faces
  hybrid: (
    <>
      <rect x="8" y="12" width="40" height="27" rx="3" {...paper} />
      <path d="M28 12 V39 M8 25.5 H48" {...ink} strokeWidth={1.6} />
      {[
        [18, 19],
        [38, 19],
        [18, 32],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="3" fill={INK} />
      ))}
      <path d="M22 45 H34 M28 39 V45" {...ink} />
    </>
  ),
  // an hourglass
  deadline: (
    <>
      <path d="M17 10 H39 M17 46 H39" {...ink} />
      <path d="M19 10 C19 20 28 24 28 28 C28 32 19 36 19 46 H37 C37 36 28 32 28 28 C28 24 37 20 37 10 Z" {...paper} />
      <path d="M22 44 C24 38 32 38 34 44 Z" fill="#F5C64A" />
    </>
  ),
  // a gear with turning arrows
  change: (
    <>
      <circle cx="28" cy="28" r="8" {...paper} />
      <circle cx="28" cy="28" r="3" fill={INK} />
      <path d="M12 24 A16 16 0 0 1 40 14 M44 32 A16 16 0 0 1 16 42" {...ink} />
      <path d="M36 11 L41 14 L38 19 M20 45 L15 42 L18 37" {...ink} />
    </>
  ),
  // a screen on a desk and a chair
  desk: (
    <>
      <rect x="14" y="10" width="26" height="18" rx="2" {...paper} />
      <path d="M27 28 V33 M20 33 H34 M8 36 H48 M12 36 V46 M44 36 V46" {...ink} />
    </>
  ),
  // a muted speech bubble
  silence: (
    <>
      <path d="M12 14 H44 A4 4 0 0 1 48 18 V34 A4 4 0 0 1 44 38 H24 L16 45 V38 H12 A4 4 0 0 1 8 34 V18 A4 4 0 0 1 12 14 Z" {...paper} />
      {[20, 28, 36].map((x) => (
        <circle key={x} cx={x} cy="26" r="2" fill={INK} />
      ))}
      <path d="M10 46 L46 10" {...ink} />
    </>
  ),
  // a stack of papers
  paper: (
    <>
      <rect x="18" y="14" width="24" height="30" rx="2" {...paper} transform="rotate(8 30 29)" />
      <rect x="14" y="12" width="24" height="30" rx="2" {...paper} />
      <path d="M19 20 H33 M19 26 H33 M19 32 H28" {...ink} strokeWidth={2} />
    </>
  ),
  // an adult with a phone at evening
  parents: (
    <>
      {person(22, 22)}
      <rect x="34" y="18" width="12" height="20" rx="3" {...paper} />
      <path d="M38 34 H42" {...ink} strokeWidth={1.8} />
      <path d="M44 8 A5 5 0 1 0 48 14 A4 4 0 0 1 44 8 Z" fill={INK} />
    </>
  ),
  // a grown-up and a child, hand in hand
  child: (
    <>
      {person(20, 18)}
      {person(38, 28, 0.7)}
      <path d="M28 34 L33 38" {...ink} />
    </>
  ),
  // sound waves
  noise: (
    <>
      <path d="M10 23 H17 L26 15 V41 L17 33 H10 Z" {...paper} />
      <path d="M32 22 A8 8 0 0 1 32 34 M37 17 A15 15 0 0 1 37 39 M42 12 A22 22 0 0 1 42 44" {...ink} />
    </>
  ),
}

export function RiskIcon({ kind }: { kind: RiskKind }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 56 56" className="h-[56px] w-[56px] flex-none">
      <circle cx="28" cy="28" r="27" fill={FILL[kind]} />
      {DRAW[kind]}
    </svg>
  )
}
