/**
 * The hero picture of the page for small businesses (D-239): a small shop with its awning, a few
 * colleagues in front and a phone with the survey – people who answer away from a desk. Decorative
 * and hidden from screen readers; drawn in the design's tokens like LawArt.
 */
export function SmallBizArt({ className = '' }: { className?: string }) {
  const person = (x: number, y: number, fill: string, s = 1) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cy="-46" r="22" fill="#FFFDF6" stroke="#191510" strokeWidth="2" />
      <path d="M-40 34 C-40 -4 -22 -18 0 -18 C22 -18 40 -4 40 34 Z" fill={fill} stroke="#191510" strokeWidth="2" strokeLinejoin="round" />
    </g>
  )
  return (
    <svg viewBox="0 0 440 360" aria-hidden="true" className={className} fill="none">
      {/* ground */}
      <circle cx="214" cy="186" r="156" fill="#CFE7E4" />
      <circle cx="388" cy="74" r="9" fill="#F5C64A" />
      <circle cx="46" cy="118" r="6" fill="#191510" />
      <circle cx="404" cy="300" r="7" fill="#F0B9A0" />

      {/* the shop */}
      <g>
        <rect x="70" y="96" width="220" height="196" rx="6" fill="#FFFDF6" stroke="#191510" strokeWidth="2" />
        <path d="M60 96 L80 52 H280 L300 96 Z" fill="#FFFDF6" stroke="#191510" strokeWidth="2" strokeLinejoin="round" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path
            key={i}
            d={`M${60 + i * 40} 96 Q${80 + i * 40} 118 ${100 + i * 40} 96`}
            fill={i % 2 ? '#FFFDF6' : '#F0B9A0'}
            stroke="#191510"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
        <rect x="98" y="62" width="100" height="10" rx="5" fill="#191510" />
        <rect x="92" y="138" width="86" height="64" rx="6" fill="#CFE7E4" stroke="#191510" strokeWidth="2" />
        <path d="M135 138 V202 M92 170 H178" stroke="#191510" strokeWidth="1.6" />
        <rect x="200" y="138" width="66" height="154" rx="6" fill="#FBEBBE" stroke="#191510" strokeWidth="2" />
        <circle cx="252" cy="218" r="4" fill="#191510" />
      </g>

      {/* the colleagues */}
      {person(108, 292, '#FBD5C4', 0.78)}
      {person(170, 300, '#F5C64A', 0.86)}
      <rect x="40" y="326" width="256" height="2" rx="1" fill="#191510" />

      {/* the phone with the survey */}
      <g transform="rotate(8 340 210)">
        <rect x="290" y="112" width="106" height="196" rx="20" fill="#FFFDF6" stroke="#191510" strokeWidth="2" />
        <rect x="324" y="124" width="38" height="6" rx="3" fill="#191510" />
        <rect x="306" y="148" width="62" height="8" rx="4" fill="#191510" />
        <rect x="306" y="164" width="74" height="6" rx="3" fill="#C4BCA8" />
        {[188, 220, 252].map((y, i) => (
          <g key={y}>
            <rect x="306" y={y} width="20" height="20" rx="6" fill={i < 2 ? '#CFE7E4' : '#FFFDF6'} stroke="#191510" strokeWidth="1.8" />
            {i < 2 ? <path d={`M311 ${y + 10} l4 4 l7 -8`} stroke="#191510" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> : null}
            <rect x="334" y={y + 6} width={i === 1 ? 36 : 46} height="7" rx="3.5" fill="#E8DFC9" />
          </g>
        ))}
        <rect x="306" y="282" width="74" height="14" rx="7" fill="#F5C64A" stroke="#191510" strokeWidth="1.6" />
      </g>
    </svg>
  )
}
