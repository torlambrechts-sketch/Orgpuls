/**
 * The first send-out's choices (D-76): three Tuesdays, the first at least a week out, as
 * YYYY-MM-DD. "Tirsdag klokka ni gir høyest svarprosent" is the design's rule; the week is
 * room for the verneombud's notice and a look at the setup before anyone is asked.
 * `today` is the organisation's own date, so the answer does not depend on the server's zone.
 */
export function offeredDays(today: string, count = 3): string[] {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 7)
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1)
  return Array.from({ length: count }, (_, i) => {
    const x = new Date(d)
    x.setUTCDate(d.getUTCDate() + i * 7)
    return x.toISOString().slice(0, 10)
  })
}
