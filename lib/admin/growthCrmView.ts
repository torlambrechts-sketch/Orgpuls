/**
 * The small calculations the CRM's revision-3 pages make from what the database returns (phase G3,
 * D-184). Pure, so tests/unit/growth-crm.test.ts holds each to the design's own arithmetic.
 */

/** The design's `fmt`: thousands grouped with a space */
export const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** A share as a whole per cent, or null when there is nothing to divide by (never a 0 % over nothing) */
export const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((100 * part) / whole) : null)

/** Trials per 100 contacts with one decimal and a comma, as the design writes «4,8 / 100»; null over no contacts */
export const per100 = (trials: number, contacts: number): string | null =>
  contacts > 0 ? ((trials / contacts) * 100).toFixed(1).replace('.', ',') : null

/** The engine's target NACE divisions (app.brreg_rules) as the pages write them: «41–43, 46–47, 58–74, 85, 86–88» */
export const naceRanges = (ranges: readonly (readonly [number, number])[]) =>
  ranges.map(([lo, hi]) => (lo === hi ? String(lo) : `${lo}–${hi}`)).join(', ')

type Part = { key: string; on: boolean }
/**
 * The «Strongest signals» of a scored contact, as the design's scoreParts picks them: the first two
 * intent signals present, then the first fit signal present that is not «active», and how many more
 * are on besides. An empty list is «Fit only».
 */
export function strongestSignals(fit: Part[], intent: Part[]): { keys: string[]; more: number } {
  const onI = intent.filter((p) => p.on)
  const onF = fit.filter((p) => p.on && p.key !== 'active')
  const keys = [...onI.slice(0, 2).map((p) => p.key), ...onF.slice(0, 1).map((p) => p.key)]
  return { keys, more: onI.length + onF.length - keys.length }
}

/** An SLA's state from the working minutes left (negative: over) or, once done, whether it was met */
type SlaClock = { kind: 'left' | 'over'; h: number; m: number; urgent: boolean }
type SlaState = SlaClock | { kind: 'met' | 'missed' }
export function slaState(left: number | null, met: boolean | null): SlaState | null {
  if (met !== null) return { kind: met ? 'met' : 'missed' }
  if (left === null) return null
  const a = Math.abs(left)
  // minutes up to an hour and a half («60 min left», as the design counts), hours and minutes beyond;
  // the design paints the dot peach under 15 minutes (`sladot`), and when it is over
  const long = a > 90
  return { kind: left >= 0 ? 'left' : 'over', h: long ? Math.floor(a / 60) : 0, m: long ? a % 60 : a, urgent: left < 15 }
}

/** A suppression hash as the design shows it: its first four and last two characters */
export const shortHash = (head: string, tail: string) => `${head}…${tail}`

const OSLO = 'Europe/Oslo'
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: OSLO }).format(d)
// the design writes «12 Sep» and «3 Mar 2024»; en-GB's current CLDR writes «Sept», so the parts are
// taken from en-US (whose short month is «Sep») and set in the design's day-month order
const parts = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: OSLO })
const part = (d: Date, type: 'day' | 'month' | 'year') => parts.formatToParts(d).find((p) => p.type === type)?.value ?? ''
const dm = { format: (d: Date) => `${part(d, 'day')} ${part(d, 'month')}` }
const dmy = { format: (d: Date) => `${part(d, 'day')} ${part(d, 'month')} ${part(d, 'year')}` }
const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: OSLO })

/** «today 08:41», «12 Sep 09:02», «3 Mar 2024 10:00»: the day (with its year when not this year) and the time */
export function stamp(iso: string, now = new Date(), today = 'today'): string {
  const d = new Date(iso)
  const day = dayKey(d) === dayKey(now) ? today : d.getFullYear() === now.getFullYear() ? dm.format(d) : dmy.format(d)
  return `${day} ${hm.format(d)}`
}

/** The time alone when a second instant falls on the day of the first («Sent 12 Sep 09:02 · confirmed 09:05») */
export function stampAfter(first: string, second: string, now = new Date(), today = 'today'): string {
  return dayKey(new Date(first)) === dayKey(new Date(second)) ? hm.format(new Date(second)) : stamp(second, now, today)
}

/** «3 Sep 2026», or Today / Yesterday */
export function dayLabel(iso: string, labels: { today: string; yesterday: string }, now = new Date()): string {
  const d = new Date(iso)
  if (dayKey(d) === dayKey(now)) return labels.today
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86_400_000))) return labels.yesterday
  return dmy.format(d)
}

/** Whether an instant fell on yesterday or today in Oslo: the design's «Triggers · yesterday» */
export const isRecent = (iso: string, now = new Date()) =>
  [dayKey(now), dayKey(new Date(now.getTime() - 86_400_000))].includes(dayKey(new Date(iso)))

/** Initials in the design's round tile */
export const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('')
