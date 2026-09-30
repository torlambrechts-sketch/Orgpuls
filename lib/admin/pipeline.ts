/**
 * The pipeline's figures (0137): sums of the values the team entered, never a value assumed for a
 * deal without one, and a win rate only over deals that actually closed. Pure, so the rules are
 * unit-tested (tests/unit/pipeline.test.ts); the pages format with them.
 */

/** Deals, how many carry a value, and the sum of those values */
export type Totals = { count: number; valued: number; value: number }

/** The totals of some deals: a deal without a value is counted, and adds nothing to the sum */
export function totals(rows: readonly { value_nok: number | null }[]): Totals {
  let valued = 0
  let value = 0
  for (const r of rows) {
    if (r.value_nok === null) continue
    valued += 1
    value += r.value_nok
  }
  return { count: rows.length, valued, value }
}

/**
 * The sum as it may be shown: over no deals it is nothing in kroner (0 kr is true); over deals of
 * which none has a value it is unknown, so null — the page draws its dash, not «0 kr».
 */
export function shownSum(t: Totals): number | null {
  if (t.count === 0) return 0
  return t.valued === 0 ? null : t.value
}

/** Deals the sum leaves out because they carry no value */
export const unvalued = (t: Totals) => t.count - t.valued

/**
 * Won over won and lost, as a whole percentage. Over nothing closed there is no rate: null, and the
 * page shows nothing — not 0 %, which would claim every closed deal was lost.
 */
export function winRate(won: number, lost: number): number | null {
  const closed = won + lost
  if (!Number.isFinite(closed) || closed <= 0 || won < 0 || lost < 0) return null
  return Math.round((100 * won) / closed)
}

/**
 * The win-rate phrase for a page, or null when nothing closed: the caller renders it only when it
 * is not null. `phrase` receives the rate and the counts behind it, so the text always says how
 * many deals it rests on.
 */
export function winRateText(
  closed: { won: number; lost: number },
  phrase: (v: { rate: number; won: number; closed: number }) => string,
): string | null {
  const rate = winRate(closed.won, closed.lost)
  return rate === null ? null : phrase({ rate, won: closed.won, closed: closed.won + closed.lost })
}
