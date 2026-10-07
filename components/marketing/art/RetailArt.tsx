/**
 * The hero picture of the retail page (D-240): a shop at closing time – shelves, the till on the
 * counter, one person on shift behind it, a basket and the evening clock. Decorative and hidden from
 * screen readers; drawn in the design's tokens like LawArt.
 */
export function RetailArt({ className = '' }: { className?: string }) {
  const goods = ['#F0B9A0', '#F5C64A', '#CFE7E4', '#FBD5C4', '#FFFDF6', '#F5C64A', '#F0B9A0']
  return (
    <svg viewBox="0 0 440 360" aria-hidden="true" className={className} fill="none">
      {/* ground: the page's canvas, since this picture sits on the mint band */}
      <circle cx="220" cy="184" r="156" fill="#FCF6E9" />
      <circle cx="58" cy="96" r="7" fill="#F0B9A0" />
      <circle cx="408" cy="276" r="6" fill="#191510" />

      {/* the shelves */}
      <g>
        <rect x="96" y="56" width="190" height="112" rx="8" fill="#FFFDF6" stroke="#191510" strokeWidth="2" />
        {[106].map((y) => (
          <rect key={y} x="96" y={y} width="190" height="3" fill="#191510" />
        ))}
        {[68, 120].map((y, r) =>
          goods.map((fill, i) => (
            <rect
              key={`${y}-${i}`}
              x={108 + i * 25}
              y={y + (i % 3 === r ? 6 : 0)}
              width="18"
              height={i % 3 === r ? 24 : 30}
              rx="4"
              fill={fill}
              stroke="#191510"
              strokeWidth="1.6"
            />
          )),
        )}
      </g>

      {/* the person on shift, behind the counter */}
      <g transform="translate(236 244)">
        <circle cy="-50" r="22" fill="#FFFDF6" stroke="#191510" strokeWidth="2" />
        <path d="M-40 30 C-40 -8 -22 -22 0 -22 C22 -22 40 -8 40 30 Z" fill="#F5C64A" stroke="#191510" strokeWidth="2" strokeLinejoin="round" />
      </g>

      {/* the counter and the till */}
      <rect x="72" y="248" width="300" height="70" rx="10" fill="#FFFDF6" stroke="#191510" strokeWidth="2" />
      <rect x="72" y="248" width="300" height="14" rx="7" fill="#191510" />
      <g transform="translate(110 206)">
        <rect x="0" y="16" width="72" height="30" rx="6" fill="#FBEBBE" stroke="#191510" strokeWidth="2" />
        <rect x="10" y="0" width="52" height="22" rx="5" fill="#191510" />
        <rect x="18" y="7" width="26" height="7" rx="3.5" fill="#CFE7E4" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={18 + i * 18} cy="31" r="4" fill="#191510" />
        ))}
      </g>

      {/* the basket on the counter */}
      <g transform="translate(300 214)">
        <path d="M6 10 C6 -14 54 -14 54 10" stroke="#191510" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M0 10 H60 L54 36 H6 Z" fill="#F0B9A0" stroke="#191510" strokeWidth="2" strokeLinejoin="round" />
        <path d="M18 14 V32 M30 14 V32 M42 14 V32" stroke="#191510" strokeWidth="1.6" strokeLinecap="round" />
      </g>

      {/* the evening clock */}
      <g transform="translate(352 92)">
        <circle r="40" fill="#F5C64A" stroke="#191510" strokeWidth="2" />
        <circle r="31" stroke="#191510" strokeWidth="1.4" strokeDasharray="3 4" />
        <path d="M0 0 V-20 M0 0 L-14 8" stroke="#191510" strokeWidth="3.2" strokeLinecap="round" />
        <circle r="3.5" fill="#191510" />
      </g>
    </svg>
  )
}
