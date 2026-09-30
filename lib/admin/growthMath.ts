import { canSee, HREF, type Section } from './access'
import type { AdminRole } from './api'
import { GROWTH_VIEWS } from './growth'

/**
 * Sentral › Growth G2's arithmetic (D-183), pure so the unit tests hold it: the funnel's percentages
 * and bars, the lead math's «now» against base, the plan's week, ICE, and the counts the KPI rows
 * show. Every function answers `null` where the design would print a figure the schema cannot back —
 * a percentage of zero visitors, a «now» for a source the attribution cannot name, a week before the
 * plan has a start date — and the page renders «—» or the words for it, never an invented number.
 */

/** the design's `fmt`: thousands grouped with a space */
export const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** a percentage as the design prints it: one decimal (with a comma) under 1 %, whole otherwise */
export const pctText = (p: number) => (p < 1 ? p.toFixed(1).replace('.', ',') : String(Math.round(p)))

export type FunnelStage = { key: string; stage: string; event: string; definition: string; n: number | null }
export type FunnelRow = FunnelStage & {
  /** % of the first stage (visitors), as printed; null where either count is missing or visitors are 0 */
  pct: string | null
  /** the bar's width in %: the design's floor of 1,5 for a stage that has any, 0 for none, never over 100 */
  bar: number
  /** % of the previous stage; null for the first stage, or where either count is missing or 0 */
  step: number | null
}

/** The design's funnel (`gwVals`): each stage against the first, and against the one before it */
export function funnelRows(stages: FunnelStage[]): FunnelRow[] {
  const top = stages[0]?.n ?? null
  return stages.map((s, i) => {
    const share = s.n !== null && top !== null && top > 0 ? (s.n / top) * 100 : null
    const prev = i > 0 ? stages[i - 1]!.n : null
    return {
      ...s,
      pct: share === null ? null : pctText(share),
      bar: share === null || s.n === 0 ? 0 : Math.min(100, Math.max(1.5, share)),
      step: i === 0 || prev === null || prev === 0 || s.n === null ? null : Math.round((s.n / prev) * 100),
    }
  })
}

export type LeadSource = { key: string; source: string; base: number; stretch: number; needs: string; now: number | null }
export type LeadRow = LeadSource & { nowPct: number | null }

/** The lead math: each source's «now» against its base (capped at 100, as the design), and the totals */
export function leadMath(sources: LeadSource[]) {
  const rows: LeadRow[] = sources.map((l) => ({ ...l, nowPct: l.now === null || l.base <= 0 ? null : Math.min(100, Math.round((l.now / l.base) * 100)) }))
  const known = rows.filter((l) => l.now !== null)
  return {
    rows,
    /** the month's trials from the sources that can be counted; null when none can */
    now: known.length ? known.reduce((a, l) => a + (l.now ?? 0), 0) : null,
    base: rows.reduce((a, l) => a + l.base, 0),
    stretch: rows.reduce((a, l) => a + l.stretch, 0),
  }
}

export type PlanWeek = { kind: 'not_started' } | { kind: 'week'; week: number; weeks: number } | { kind: 'finished'; weeks: number }

/** The plan's week as the KPI shows it: not started without a start date (or before it), finished after */
export function planWeek(week: number | null, weeks: number): PlanWeek {
  if (week === null || week < 1) return { kind: 'not_started' }
  if (week > weeks) return { kind: 'finished', weeks }
  return { kind: 'week', week, weeks }
}

/** ICE = impact × confidence × ease, max 125, and its share of the maximum for the bar */
export const ice = (e: { impact: number; confidence: number; ease: number }) => e.impact * e.confidence * e.ease
export const icePct = (e: { impact: number; confidence: number; ease: number }) => Math.round((ice(e) / 125) * 100)

/** How many rows hold each status, every status named (0 where none does) */
export function countBy<K extends string>(rows: { status: K }[], keys: readonly K[]): Record<K, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1
  return out
}

/** Initials from an admin's address, as the shell's avatar draws them: «tor.lambrechts@…» → «TL» */
export const initialsOf = (email: string) =>
  (email.split('@')[0] ?? '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('')

/**
 * The section an admin address belongs to: a Growth view's own (Tools & lead magnets and
 * Deliverability are `growth`, D-181), else the longest section address it starts with.
 */
export function sectionOfHref(href: string): Section | null {
  const view = Object.values(GROWTH_VIEWS).find((v) => v.href === href)
  if (view) return view.section
  let best: { s: Section; len: number } | null = null
  for (const [s, h] of Object.entries(HREF) as [Section, string][]) {
    if ((href === h || href.startsWith(`${h}/`)) && (!best || h.length > best.len)) best = { s, len: h.length }
  }
  return best?.s ?? null
}

/** Whether a link to an admin address may be offered to a role: only where the page would open */
export const mayFollow = (role: AdminRole | null | undefined, href: string | null): href is string => {
  if (!role || !href) return false
  const s = sectionOfHref(href)
  return !!s && canSee(role, s)
}
