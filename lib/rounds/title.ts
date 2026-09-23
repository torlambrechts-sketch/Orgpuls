/**
 * What a round is called, everywhere it is named.
 *
 * A grunnlinje is "Grunnlinje 2026". A puls is "Puls 2 · 2026" when its number within the
 * year is known (bundle 2951-2953) — several pulses a year is the wheel's ordinary cadence,
 * and naming them all "Puls 2026" makes a chip row or a measure's source ambiguous. The
 * number comes from `numberPulses` in `lib/rounds/read.ts`; without one the plain form is
 * the honest fallback rather than an invented ordinal.
 */
type Translate = (key: string, values?: Record<string, string | number>) => string

export interface Titled {
  kind: string
  year: number
  pulseNo?: number | null
}

export function roundTitle(t: Translate, r: Titled): string {
  const kind = t(`malinger.kind.${r.kind}`)
  return r.kind === 'puls' && r.pulseNo
    ? t('malinger.pulseTitle', { kind, n: r.pulseNo, year: r.year })
    : t('malinger.roundTitle', { kind, year: r.year })
}
