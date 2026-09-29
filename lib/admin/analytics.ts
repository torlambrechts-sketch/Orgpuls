/**
 * The Analytics pages' arithmetic (X-095, phase 6), kept apart from the pages so it can be tested:
 * the period asked for, the period as the design writes it («16–29 Sep 2026»), a change against the
 * period before, the chart's bars — a day each up to a month, a week each beyond — and the numbers
 * in the design's Norwegian grouping («10 710», «1,31», «2:14»).
 */
export const ANALYTICS_PERIODS = [7, 14, 30, 90, 365] as const
export type Period = (typeof ANALYTICS_PERIODS)[number]
export const DEFAULT_PERIOD: Period = 14
export const periodOf = (d: string | undefined): Period => ANALYTICS_PERIODS.find((p) => String(p) === d) ?? DEFAULT_PERIOD

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const MONTH_LONG = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
const at = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)

/** «16–29 Sep 2026», «31 Aug – 29 Sep 2026», «30 Sep 2025 – 29 Sep 2026» */
export function rangeLabel(from: string, to: string): string {
  const a = at(from)
  const b = at(to)
  const dm = (d: Date) => `${d.getUTCDate()} ${MONTH.format(d)}`
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${dm(a)} ${a.getUTCFullYear()} – ${dm(b)} ${b.getUTCFullYear()}`
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${dm(a)} – ${dm(b)} ${b.getUTCFullYear()}`
  return `${a.getUTCDate()}–${dm(b)} ${b.getUTCFullYear()}`
}

/** the months a period spans, as the chart's note names them: «September», «August–September» */
export function monthsLabel(from: string, to: string): string {
  const a = MONTH_LONG.format(at(from))
  const b = MONTH_LONG.format(at(to))
  return a === b ? a : `${a}–${b}`
}

/** a change against the period before, in whole percent; null where there is nothing to compare with */
export function change(n: number | null, prev: number | null): { dir: 'up' | 'down' | 'flat'; pct: number } | null {
  if (n === null || prev === null || prev === 0) return null
  const pct = Math.round((100 * (n - prev)) / prev)
  return { dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', pct: Math.abs(pct) }
}

/** whole percent of a whole, 0 where the whole is 0 */
export const share = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0)

/** «10 710» */
export const int = (n: number) => Math.round(n).toLocaleString('nb-NO')
/** «1,31» */
export const dec = (n: number, digits: number) => n.toFixed(digits).replace('.', ',')
/** «2:14»; an hour and more as «1:02:14» */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export type Bar = { key: string; label: string; n: number; weekend: boolean }

/** ISO week number of a date */
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7)
}

/**
 * The chart's bars from the period's first day to its last: every day, those without a visit at 0.
 * Beyond 31 days a bar is a week (Monday to Sunday, cut at the period's ends), labelled by its number.
 */
export function bars(from: string, to: string, daily: { day: string; visitors: number }[]): { per: 'day' | 'week'; bars: Bar[] } {
  const byDay = new Map(daily.map((d) => [d.day.slice(0, 10), d.visitors]))
  const days: { iso: string; d: Date }[] = []
  for (let d = at(from); d <= at(to); d = new Date(d.getTime() + 86400000)) days.push({ iso: d.toISOString().slice(0, 10), d })
  if (days.length <= 31) {
    return {
      per: 'day',
      bars: days.map(({ iso, d }) => ({ key: iso, label: String(d.getUTCDate()), n: byDay.get(iso) ?? 0, weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6 })),
    }
  }
  const weeks: Bar[] = []
  for (const { iso, d } of days) {
    const key = `${d.getUTCFullYear()}-${isoWeek(d)}`
    const last = weeks[weeks.length - 1]
    if (last && (d.getUTCDay() !== 1 || last.key === key)) last.n += byDay.get(iso) ?? 0
    else weeks.push({ key: iso, label: String(isoWeek(d)), n: byDay.get(iso) ?? 0, weekend: false })
  }
  return { per: 'week', bars: weeks }
}

/** A page's title without the site's name after it, as a row in a table of the site's pages reads */
export const bareTitle = (title: string) => title.replace(/\s*[|·–—-]\s*Orgpuls\s*$/i, '').trim() || title
