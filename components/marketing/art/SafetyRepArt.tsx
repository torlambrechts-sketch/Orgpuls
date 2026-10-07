/**
 * The hero picture of the informational page for safety representatives (D-237): a shield with a tick
 * in front of three colleagues, and a speech bubble – the one who speaks for the others. Decorative and
 * hidden from screen readers; drawn in the design's tokens like LawArt.
 */
export function SafetyRepArt({ className = '' }: { className?: string }) {
  const person = (x: number, y: number, fill: string, s = 1) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cy="-46" r="22" fill="#FFFDF6" stroke="#191510" strokeWidth="2" />
      <path d="M-40 34 C-40 -4 -22 -18 0 -18 C22 -18 40 -4 40 34 Z" fill={fill} stroke="#191510" strokeWidth="2" strokeLinejoin="round" />
    </g>
  )
  return (
    <svg viewBox="0 0 440 360" aria-hidden="true" className={className} fill="none">
      {/* ground */}
      <circle cx="220" cy="190" r="156" fill="#CFE7E4" />
      <circle cx="64" cy="84" r="9" fill="#F5C64A" />
      <circle cx="396" cy="252" r="7" fill="#F0B9A0" />
      <circle cx="378" cy="58" r="5" fill="#191510" />

      {/* the colleagues */}
      {person(118, 262, '#FBEBBE', 0.92)}
      {person(322, 262, '#FBD5C4', 0.92)}
      {person(220, 280, '#FFFDF6', 1.08)}
      <rect x="60" y="292" width="320" height="2" rx="1" fill="#191510" />

      {/* the speech bubble */}
      <g transform="translate(268 74)">
        <path d="M0 0 H112 A16 16 0 0 1 128 16 V58 A16 16 0 0 1 112 74 H40 L22 92 L24 74 H16 A16 16 0 0 1 0 58 V16 A16 16 0 0 1 16 0 Z" fill="#FFFDF6" stroke="#191510" strokeWidth="2" strokeLinejoin="round" />
        <rect x="18" y="20" width="76" height="9" rx="4.5" fill="#191510" />
        <rect x="18" y="38" width="92" height="7" rx="3.5" fill="#C4BCA8" />
        <rect x="18" y="52" width="60" height="7" rx="3.5" fill="#E8DFC9" />
      </g>

      {/* the shield */}
      <g transform="translate(150 70)">
        <path d="M70 0 L136 22 V84 C136 128 106 158 70 172 C34 158 4 128 4 84 V22 Z" fill="#F5C64A" stroke="#191510" strokeWidth="2" strokeLinejoin="round" />
        <path d="M70 16 L122 33 V84 C122 118 99 142 70 155 C41 142 18 118 18 84 V33 Z" stroke="#191510" strokeWidth="1.4" strokeDasharray="3 4" />
        <path d="M44 86 L62 104 L98 66" stroke="#191510" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
