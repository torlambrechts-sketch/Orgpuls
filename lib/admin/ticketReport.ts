/**
 * Tickets › Reports (0135): the figures as the page prints them. Pure, so the unit test holds the
 * rules: a share over nothing is no share, and a median of no tickets is no median — the page
 * prints «—» and says why, never a nought (CLAUDE.md, «never fabricate data»).
 */

/** The share met of those that were due, as a whole per cent; null when none was due */
export function metShare(d: { met: number; missed: number }): number | null {
  const due = d.met + d.missed
  return due > 0 ? Math.round((100 * d.met) / due) : null
}

/** «40 min», «3.5 h», «2.1 d» for a median in hours; null stays null */
export function hoursLabel(h: number | null): string | null {
  if (h === null || !Number.isFinite(h)) return null
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${(Math.round(h * 10) / 10).toLocaleString('en-GB')} h`
  return `${(Math.round((h / 24) * 10) / 10).toLocaleString('en-GB')} d`
}

/** The average rating to two decimals, «4.25»; null when nobody rated */
export function ratingLabel(avg: number | null): string | null {
  return avg === null || !Number.isFinite(avg) ? null : avg.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

const weekFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** A week's bar label from its Monday, «29 Sep» */
export const weekLabel = (monday: string) => weekFmt.format(new Date(`${monday.slice(0, 10)}T00:00:00Z`))
