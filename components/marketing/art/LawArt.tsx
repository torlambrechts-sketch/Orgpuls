/**
 * The hero picture of an informational page about the law (D-237): a document with a checklist, the
 * § seal and the ring of the four steps. Decorative – the page's own words carry the meaning – so it
 * is hidden from screen readers. Drawn in the design's tokens: ink lines, sf paper, mint ground,
 * yellow seal.
 */
export function LawArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 440 360" aria-hidden="true" className={className} fill="none">
      {/* ground */}
      <circle cx="236" cy="184" r="156" fill="#CFE7E4" />
      <circle cx="372" cy="70" r="10" fill="#F0B9A0" />
      <circle cx="58" cy="268" r="7" fill="#F5C64A" />
      <circle cx="404" cy="292" r="5" fill="#191510" />

      {/* the ring of the four steps */}
      <g transform="translate(92 96)">
        <circle r="48" fill="#FBEBBE" stroke="#191510" strokeWidth="2" />
        <path d="M-28 -14 A31 31 0 0 1 14 -28" stroke="#191510" strokeWidth="3" strokeLinecap="round" />
        <path d="M28 -14 A31 31 0 0 1 14 28" stroke="#191510" strokeWidth="3" strokeLinecap="round" />
        <path d="M28 14 A31 31 0 0 1 -14 28" stroke="#191510" strokeWidth="3" strokeLinecap="round" />
        <path d="M-28 14 A31 31 0 0 1 -14 -28" stroke="#191510" strokeWidth="3" strokeLinecap="round" />
        <path d="M10 -33 L16 -27 L8 -24" stroke="#191510" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M33 10 L27 16 L24 8" stroke="#191510" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M-10 33 L-16 27 L-8 24" stroke="#191510" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M-33 -10 L-27 -16 L-24 -8" stroke="#191510" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* the document */}
      <g transform="rotate(-4 236 184)">
        <rect x="150" y="52" width="196" height="258" rx="18" fill="#FFFDF6" stroke="#191510" strokeWidth="2" />
        <rect x="174" y="78" width="92" height="12" rx="6" fill="#191510" />
        <rect x="174" y="100" width="140" height="8" rx="4" fill="#E8DFC9" />
        <rect x="174" y="116" width="118" height="8" rx="4" fill="#E8DFC9" />
        {[150, 192, 234].map((y, i) => (
          <g key={y}>
            <rect x="174" y={y} width="24" height="24" rx="7" fill={i < 2 ? '#CFE7E4' : '#FFFDF6'} stroke="#191510" strokeWidth="2" />
            {i < 2 ? <path d={`M180 ${y + 12} l5 5 l9 -10`} stroke="#191510" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /> : null}
            <rect x="210" y={y + 4} width={i === 1 ? 84 : 106} height="7" rx="3.5" fill="#C4BCA8" />
            <rect x="210" y={y + 15} width={i === 0 ? 62 : 74} height="6" rx="3" fill="#E8DFC9" />
          </g>
        ))}
      </g>

      {/* the § seal */}
      <g transform="translate(332 258)">
        <circle r="52" fill="#F5C64A" stroke="#191510" strokeWidth="2" />
        <circle r="41" stroke="#191510" strokeWidth="1.4" strokeDasharray="3 4" />
        <text y="20" textAnchor="middle" fontFamily="'Playfair Display', serif" fontWeight="600" fontSize="56" fill="#191510">
          §
        </text>
      </g>
    </svg>
  )
}
