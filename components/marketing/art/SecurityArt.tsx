/**
 * The hero picture of the security page (D-239): an answer card with no name on it, a padlock in front
 * and the group of five it waits for. Decorative and hidden from screen readers; drawn in the design's
 * tokens like LawArt.
 */
export function SecurityArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 440 360" aria-hidden="true" className={className} fill="none">
      {/* ground */}
      <circle cx="226" cy="186" r="156" fill="#CFE7E4" />
      <circle cx="70" cy="92" r="8" fill="#F0B9A0" />
      <circle cx="398" cy="96" r="6" fill="#191510" />
      <circle cx="54" cy="262" r="6" fill="#F5C64A" />

      {/* the answer card: scales and a blank where a name would be */}
      <g transform="rotate(5 210 170)">
        <rect x="118" y="52" width="196" height="232" rx="18" fill="#FFFDF6" stroke="#191510" strokeWidth="2" />
        <rect x="142" y="76" width="88" height="22" rx="11" fill="#FFFDF6" stroke="#191510" strokeWidth="1.6" strokeDasharray="4 4" />
        {[120, 166, 212].map((y, r) => (
          <g key={y}>
            <rect x="142" y={y} width={r === 1 ? 110 : 136} height="8" rx="4" fill="#C4BCA8" />
            {[0, 1, 2, 3, 4].map((i) => (
              <circle
                key={i}
                cx={150 + i * 30}
                cy={y + 26}
                r="8"
                fill={i === [3, 1, 4][r] ? '#191510' : '#FFFDF6'}
                stroke="#191510"
                strokeWidth="1.6"
              />
            ))}
          </g>
        ))}
      </g>

      {/* the group of five */}
      <g transform="translate(58 300)">
        {['#FBEBBE', '#FBD5C4', '#FFFDF6', '#CFE7E4', '#F5C64A'].map((fill, i) => (
          <g key={i} transform={`translate(${i * 30} 0)`}>
            <circle cy="-26" r="11" fill="#FFFDF6" stroke="#191510" strokeWidth="1.8" />
            <path d="M-18 8 C-18 -8 -10 -14 0 -14 C10 -14 18 -8 18 8 Z" fill={fill} stroke="#191510" strokeWidth="1.8" strokeLinejoin="round" />
          </g>
        ))}
      </g>

      {/* the padlock */}
      <g transform="translate(300 196)">
        <path d="M-34 0 V-30 A34 34 0 0 1 34 -30 V0" stroke="#191510" strokeWidth="12" strokeLinecap="round" />
        <path d="M-34 0 V-30 A34 34 0 0 1 34 -30 V0" stroke="#FFFDF6" strokeWidth="7" strokeLinecap="round" />
        <rect x="-58" y="-8" width="116" height="100" rx="18" fill="#F5C64A" stroke="#191510" strokeWidth="2" />
        <rect x="-47" y="3" width="94" height="78" rx="12" stroke="#191510" strokeWidth="1.4" strokeDasharray="3 4" />
        <circle cy="34" r="11" fill="#191510" />
        <rect x="-4" y="38" width="8" height="24" rx="4" fill="#191510" />
      </g>
    </svg>
  )
}
