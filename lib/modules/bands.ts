/**
 * A module's own risk bands (0223, D-266), as `app.module_band` reads them: the lowest index for
 * «lav» and for «middels» in the file's `scoring.risk_bands`, 65 and 50 where it names none. Pure, so
 * the screens that say which bands a module uses read the same numbers the database bands by.
 */
export type RiskBandRow = { band: string; min?: number | null; max?: number | null }

export const CORE_BANDS = { low: 65, medium: 50 } as const

export function moduleBands(riskBands: readonly RiskBandRow[] | null | undefined): { low: number; medium: number } {
  const min = (band: string, otherwise: number) => {
    // the first row for the band that names a minimum, as the database's `limit 1`
    const v = riskBands?.find((b) => b.band === band && typeof b.min === 'number')?.min
    return typeof v === 'number' ? v : otherwise
  }
  return { low: min('lav', CORE_BANDS.low), medium: min('middels', CORE_BANDS.medium) }
}

/** the module's bands where they are not the core's, else null: only then does a screen name them */
export function ownBands(riskBands: readonly RiskBandRow[] | null | undefined): { low: number; medium: number } | null {
  const b = moduleBands(riskBands)
  return b.low === CORE_BANDS.low && b.medium === CORE_BANDS.medium ? null : b
}
