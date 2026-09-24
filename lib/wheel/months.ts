/*
 * Pure, so the client can draw the same year the scheduler plans: the Veiviser's month
 * strip (D-76) and Årshjulet's both read it. No server import belongs here.
 */

/**
 * Which months the wheel measures in, computed the same way the scheduler computes it.
 *
 * Kept in TypeScript as well as in SQL because the strip must render without a round
 * trip, and duplicated deliberately rather than read from the database: the rule is four
 * lines, and a screen that asked the server what month December is would be worse.
 * `app.wheel_months` is the authority; this mirrors it, and the invariant suite is what
 * would catch them drifting apart.
 */
export function wheelMonths(
  cadence: 'minimum' | 'kvartalspuls' | 'halvarspuls' | 'manedspuls',
  baselineMonth: number,
  skipFellesferie: boolean,
): { month: number; kind: 'grunnlinje' | 'puls' }[] {
  const out: { month: number; kind: 'grunnlinje' | 'puls' }[] = [{ month: baselineMonth, kind: 'grunnlinje' }]
  const step = cadence === 'kvartalspuls' ? 3 : cadence === 'halvarspuls' ? 6 : cadence === 'manedspuls' ? 1 : 0
  if (step === 0) return out

  for (let i = step; i < 12; i += step) {
    const month = ((baselineMonth - 1 + i) % 12) + 1
    if (skipFellesferie && month === 7) continue
    out.push({ month, kind: 'puls' })
  }
  return out
}
