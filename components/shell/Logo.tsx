import { useTranslations } from 'next-intl'
/**
 * The Orgpuls mark: a pulse polyline with a trailing dot, in a rounded square.
 * Transcribed from Orgpuls_Offline_Source.html line 57 (header, 30px) and line 2484
 * (footer, 28px). The path data is the design's, not a redrawing.
 *
 * The bundle supports a customer logo in this slot (`brandIsLogo`), which is why the
 * mark is a separate component rather than inlined into the header.
 */
export function LogoMark({ size = 30, src = null }: { size?: number; src?: string | null }) {
  const t = useTranslations()
  // the organisation's own logo in the slot (0104, D-154): bundle v3 line 73, `brandIsLogo`
  if (src)
    return (
      <span
        role="img"
        aria-label={t('shell.orgLogo')}
        className="block flex-none rounded-bar"
        style={{ width: size, height: size, background: `#FFFDF6 url(${JSON.stringify(src)}) center/contain no-repeat` }}
      />
    )
  // the glyph is 20x12 at the 30px mark and 19x11 at the 28px footer mark
  const w = size >= 30 ? 20 : 19
  const h = size >= 30 ? 12 : 11
  return (
    <span
      className="flex flex-none items-center justify-center rounded-bar border-[1.5px] border-ink"
      style={{ width: size, height: size, background: size >= 30 ? '#FFFDF6' : '#FCF6E9' }}
    >
      <svg width={w} height={h} viewBox="0 0 20 12" fill="none" aria-hidden="true" className="block">
        <path
          d="M1 6.2h3.6l1.7-4.4 2.9 8.8 1.9-4.4h2.4"
          stroke="#191510"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="17" cy="6.2" r="1.9" fill="#191510" />
      </svg>
    </span>
  )
}

export function Logo({ size = 30, wordmark = 19, src = null }: { size?: number; wordmark?: number; src?: string | null }) {
  return (
    <span className="flex flex-none items-center gap-[9px]">
      <LogoMark size={size} src={src} />
      <span
        className="font-display font-semibold tracking-[-0.01em]"
        style={{ fontSize: wordmark }}
      >
        Orgpuls
      </span>
    </span>
  )
}
