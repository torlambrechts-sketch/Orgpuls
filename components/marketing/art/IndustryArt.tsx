import type { IndustryArtKind } from '@/content/industries/landing'
import { RetailArt } from './RetailArt'

/**
 * The hero pictures of the industry pages written as articles (D-240), one per industry, drawn in the
 * design's tokens like LawArt: ink lines, sf paper, warm accents, on a ground of the page's canvas,
 * since they sit on the mint band. Decorative and hidden from screen readers – the page's words carry
 * the meaning.
 */
const INK = '#191510'
const PAPER = '#FFFDF6'
const line = { stroke: INK, strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

function Ground({ dots }: { dots: [number, number, number, string][] }) {
  return (
    <>
      <circle cx="220" cy="184" r="156" fill="#FCF6E9" />
      {dots.map(([x, y, r, fill]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={fill} />
      ))}
    </>
  )
}

const person = (x: number, y: number, fill: string, s = 1, hat?: string) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle cy="-46" r="22" fill={PAPER} {...line} />
    {hat ? <path d="M-24 -52 C-24 -72 24 -72 24 -52 Z M-30 -52 H30" fill={hat} {...line} /> : null}
    <path d="M-40 34 C-40 -4 -22 -18 0 -18 C22 -18 40 -4 40 34 Z" fill={fill} {...line} />
  </g>
)

/** a building in its frame, the crane above it and a worker in a hard hat */
function BuildArt() {
  return (
    <>
      <Ground
        dots={[
          [62, 96, 7, '#F0B9A0'],
          [404, 270, 6, INK],
        ]}
      />
      {/* the crane */}
      <path d="M300 300 V70 M300 70 H118 M300 70 H350 M300 70 L270 100 M300 100 L330 70" fill="none" {...line} strokeWidth={3} />
      <rect x="336" y="70" width="22" height="20" fill={INK} />
      <path d="M150 70 V126" {...line} />
      <rect x="132" y="126" width="36" height="22" rx="3" fill="#F5C64A" {...line} />
      {/* the frame */}
      <rect x="96" y="166" width="180" height="134" fill={PAPER} {...line} />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect
            key={`${r}${c}`}
            x={108 + c * 42}
            y={178 + r * 40}
            width="30"
            height="26"
            rx="3"
            fill={r === 2 && c === 1 ? '#FBEBBE' : '#CFE7E4'}
            {...line}
            strokeWidth={1.6}
          />
        )),
      )}
      <rect x="60" y="300" width="320" height="2" rx="1" fill={INK} />
      {/* the worker */}
      {person(346, 272, '#F0B9A0', 0.62, '#F5C64A')}
    </>
  )
}

/** a home with a heart, the carer on her way with a bag, and the clock of the shift */
function CareArt() {
  return (
    <>
      <Ground
        dots={[
          [64, 100, 7, '#F5C64A'],
          [404, 268, 6, INK],
        ]}
      />
      <path d="M92 178 L188 104 L284 178 V296 H92 Z" fill={PAPER} {...line} />
      <rect x="168" y="226" width="40" height="70" rx="4" fill="#FBEBBE" {...line} />
      <rect x="112" y="200" width="40" height="34" rx="4" fill="#CFE7E4" {...line} />
      <path d="M188 192 C170 180 160 172 160 160 A12 12 0 0 1 188 156 A12 12 0 0 1 216 160 C216 172 206 180 188 192 Z" fill="#F0B9A0" {...line} />
      {person(330, 270, '#CFE7E4', 0.8)}
      <rect x="352" y="250" width="40" height="30" rx="6" fill="#F5C64A" {...line} />
      <path d="M364 250 V242 H380 V250" fill="none" {...line} />
      <path d="M372 258 V272 M365 265 H379" {...line} />
      <g transform="translate(350 104)">
        <circle r="38" fill="#F5C64A" {...line} />
        <circle r="29" fill="none" stroke={INK} strokeWidth="1.4" strokeDasharray="3 4" />
        <path d="M0 0 V-18 M0 0 L14 8" {...line} strokeWidth={3.2} />
      </g>
      <rect x="60" y="296" width="330" height="2" rx="1" fill={INK} />
    </>
  )
}

/** a laptop on a desk with a coffee and a plant, the phone lighting up, the home behind */
function OfficeArt() {
  return (
    <>
      <Ground
        dots={[
          [60, 110, 7, '#F0B9A0'],
          [402, 280, 6, INK],
        ]}
      />
      <path d="M250 120 L320 70 L390 120 V200 H250 Z" fill="#FBEBBE" {...line} />
      <rect x="300" y="150" width="30" height="50" rx="3" fill={PAPER} {...line} />
      <rect x="84" y="128" width="172" height="112" rx="10" fill={PAPER} {...line} />
      <rect x="98" y="142" width="144" height="84" rx="4" fill="#CFE7E4" {...line} strokeWidth={1.6} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={110} y={156 + i * 20} width={i === 1 ? 70 : 104} height="8" rx="4" fill={i === 0 ? INK : '#C4BCA8'} />
      ))}
      <path d="M64 240 H276 L262 256 H78 Z" fill={PAPER} {...line} />
      <rect x="50" y="256" width="320" height="10" rx="3" fill={INK} />
      <path d="M70 266 V310 M350 266 V310" {...line} strokeWidth={3} />
      <rect x="292" y="214" width="26" height="30" rx="4" fill="#F0B9A0" {...line} />
      <path d="M318 222 C328 222 328 236 318 236" fill="none" {...line} />
      <g transform="rotate(10 350 190)">
        <rect x="330" y="150" width="40" height="72" rx="8" fill={PAPER} {...line} />
        <circle cx="366" cy="152" r="9" fill="#F5C64A" {...line} />
      </g>
      <path
        d="M100 240 C96 222 106 208 112 204 C112 220 108 230 100 240 Z M100 240 C104 224 94 214 86 212 C88 226 92 234 100 240 Z"
        fill="#CFE7E4"
        {...line}
        strokeWidth={1.6}
      />
    </>
  )
}

/** a board with the alphabet, a small chair and a big one, and a stack of blocks */
function SchoolArt() {
  return (
    <>
      <Ground
        dots={[
          [62, 100, 7, '#F5C64A'],
          [404, 276, 6, INK],
        ]}
      />
      <rect x="96" y="70" width="230" height="130" rx="10" fill="#20431C" {...line} />
      <text x="118" y="122" fontFamily="'Playfair Display', serif" fontSize="36" fontWeight="600" fill={PAPER}>
        A b C
      </text>
      <path d="M118 150 H220 M118 170 H180" stroke={PAPER} strokeWidth="4" strokeLinecap="round" />
      <path d="M96 200 H326" {...line} strokeWidth={3} />
      {/* the big chair and the small one */}
      <path d="M118 222 V300 M118 262 H170 V300 M170 262 V300" fill="none" {...line} strokeWidth={3} />
      <rect x="114" y="254" width="62" height="10" rx="3" fill="#F0B9A0" {...line} />
      <path d="M210 262 V300 M210 280 H244 V300 M244 280 V300" fill="none" {...line} strokeWidth={3} />
      <rect x="206" y="274" width="42" height="8" rx="3" fill="#F5C64A" {...line} />
      {/* the blocks */}
      <rect x="292" y="262" width="38" height="38" rx="4" fill="#CFE7E4" {...line} />
      <rect x="334" y="262" width="38" height="38" rx="4" fill="#FBD5C4" {...line} />
      <rect x="312" y="224" width="38" height="38" rx="4" fill="#F5C64A" {...line} />
      <text x="331" y="251" textAnchor="middle" fontFamily="'Playfair Display', serif" fontSize="22" fontWeight="600" fill={INK}>
        1
      </text>
      <rect x="60" y="300" width="330" height="2" rx="1" fill={INK} />
    </>
  )
}

export function IndustryArt({ kind, className = '' }: { kind: IndustryArtKind; className?: string }) {
  if (kind === 'handel') return <RetailArt className={className} />
  const draw = { bygg: <BuildArt />, helse: <CareArt />, kontor: <OfficeArt />, barnehage: <SchoolArt /> }[kind]
  return (
    <svg viewBox="0 0 440 360" aria-hidden="true" className={className} fill="none">
      {draw}
    </svg>
  )
}
