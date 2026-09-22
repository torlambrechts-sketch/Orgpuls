import type { ReactNode } from 'react'

/**
 * Risk bands.
 *
 * These three strings are exactly what `app.risk_band()` returns from the database
 * (migration 0004). The component keys off the same values the server computes, so a
 * band can never be re-derived in the client and drift from what the statutory report
 * says. Do not add a fourth band here without adding it there first.
 *
 * Thresholds, for reference — derived from the design's own printed counts, not chosen:
 *   Lav >= 65 · Middels 50-64 · Høy < 50
 * Applied to the bundle's eleven factor indices this yields 5 / 4 / 2, which is the
 * "5 forsvarlig · 4 følges opp · 2 høy risiko" the Innsikt screen prints.
 */
export type Band = 'lav' | 'middels' | 'hoy'

const BAND_STYLE: Record<Band, string> = {
  lav: 'bg-mint text-greendeep',
  middels: 'bg-band text-cautiondeep',
  hoy: 'bg-peach2 text-dangerdeep',
}

/** Bar fill per band, used by distribution and per-factor bars. */
export const BAND_BAR: Record<Band, string> = {
  lav: '#5C9A55',
  middels: '#E0A21F',
  hoy: '#D4633A',
}

export function RiskBadge({
  band,
  label,
  className = '',
}: {
  band: Band
  /** The visible text. Always passed in from next-intl — never hard-coded here. */
  label: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex flex-none items-center rounded-pill px-[10px] py-[3px] text-[11px] font-bold leading-none ${BAND_STYLE[band]} ${className}`}
    >
      {label}
    </span>
  )
}

/**
 * The k-anonymity treatment.
 *
 * A cell whose group is below threshold does not render a number, a zero, a dash that
 * could be mistaken for a score, or an empty space that reads as "no data yet". It
 * renders the threshold itself, which is the true and useful statement: there were
 * fewer than k answers, so nothing is shown.
 *
 * This is the UI half of the invariant the database enforces in `results_by_group`.
 * The server withholds the scores; this makes the withholding legible rather than
 * looking like a bug or, worse, like a genuinely low score.
 */
export function MaskedCell({
  threshold,
  className = '',
}: {
  threshold: number
  className?: string
}) {
  return (
    <span
      className={`inline-flex flex-none items-center rounded-pill border border-orange bg-transparent px-[10px] py-[3px] text-[11px] font-semibold leading-none text-danger ${className}`}
      title={`n < ${threshold}`}
    >
      {`n<${threshold}`}
    </span>
  )
}

/**
 * The stacked distribution bar: flex, 3px gaps, 30px tall, radius 9, clipped.
 * Bundle lines 144-148. Segments are flex-weighted, so they carry proportion
 * without needing a width calculation in the caller.
 */
export function StackedBar({
  segments,
  className = '',
  children,
}: {
  segments: { flex: number; background: string; key: string }[]
  className?: string
  children?: ReactNode
}) {
  return (
    <>
      <div className={`flex h-[30px] gap-[3px] overflow-hidden rounded-bar ${className}`}>
        {segments.map((s) => (
          <span key={s.key} style={{ flex: s.flex, background: s.background }} />
        ))}
      </div>
      {children}
    </>
  )
}
