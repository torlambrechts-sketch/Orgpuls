import { z } from 'zod'
import type { DotTone } from './dots'

/**
 * Sentral › Content › Tools & lead magnets (0144, D-185): the shapes public.admin_growth_magnets()
 * returns, and what the page computes from them. Pure, so tests/unit/growth-g4.test.ts runs it.
 *
 * Nothing here invents a figure. A tool that does not exist records nothing, so its completions,
 * consent and trials are null and print as the design's «—»; a rate over no denominator is null.
 */
export const MAGNET_KINDS = ['tool', 'template', 'report', 'newsletter'] as const
export const MAGNET_GATES = ['pdf', 'pdf_templates', 'templates', 'pdf_ics', 'none'] as const
export const MAGNET_STATUSES = ['planned', 'building', 'live'] as const
export const KRAV_RULES = ['verneombud', 'amu', 'bht', 'wording_4_3'] as const

const num = z.coerce.number()
const Doi = z.object({ sent: num, confirmed: num })
export type Doi = z.infer<typeof Doi>

export const GrowthMagnets = z.object({
  magnets: z.array(
    z.object({
      key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
      rank: num,
      name: z.string(),
      kind: z.enum(MAGNET_KINDS),
      gated: z.enum(MAGNET_GATES),
      status: z.enum(MAGNET_STATUSES),
      /** the status is derived from what is in use (the newsletter's CRM list), not typed */
      derived: z.boolean(),
      /** a newsletter's subscribers; null for a tool, which records nothing yet */
      completions: num.nullable(),
      /** double opt-in among the list's contacts; null where there is no list */
      doi: Doi.nullable(),
    }),
  ),
  /** double opt-in over every confirmation mail sent in 90 days */
  doi: Doi,
  rules: z.array(
    z.object({
      key: z.enum(KRAV_RULES),
      version: num,
      threshold: num.nullable(),
      on_demand_from: num.nullable(),
      reference: z.string(),
      say: z.string().nullable(),
      never_say: z.string().nullable(),
      checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      checked_against: z.string(),
      guidance: z.boolean(),
    }),
  ),
  ruleset_version: num,
  marketing_domain: z.string().nullable(),
})
export type GrowthMagnets = z.infer<typeof GrowthMagnets>
export type Magnet = GrowthMagnets['magnets'][number]

/** The design's `fmt`: thousands grouped with a space */
export const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/**
 * A share as the design prints it: a comma decimal and a space before the sign («15,4 %», «96 %»).
 * Null — the design's «—» — when there is nothing to divide by.
 */
export function rate(part: number, whole: number, decimals = 0): string | null {
  if (!whole || whole < 0 || part < 0 || !Number.isFinite(part) || !Number.isFinite(whole)) return null
  return `${((100 * part) / whole).toFixed(decimals).replace('.', ',')} %`
}

/** A row's completions as the design writes them: a count, or «—» for none (`m.done ? fmt : '—'`) */
export const doneText = (n: number | null) => (n ? fmt(n) : null)

/** The double opt-in rate: confirmed of sent, or null when no confirmation mail went out */
export const doiRate = (d: Doi | null) => (d ? rate(d.confirmed, d.sent) : null)

/**
 * A magnet's status dot, as the design's `sdot`: live teal, building yellow, planned the hairline
 * colour. (The design's «2 of 5 live» is building; no magnet here has such a count.)
 */
export function magnetTone(status: Magnet['status']): DotTone {
  return status === 'live' ? 'teal' : status === 'building' ? 'yellow' : 'line'
}

/**
 * How many tools, templates and reports are live: completions, consent and trials are counted from
 * their sessions, and while none is live there is nothing to count, so the KPIs print «—» with why.
 */
export const liveMagnets = (m: GrowthMagnets) => m.magnets.filter((x) => x.kind !== 'newsletter' && x.status === 'live').length

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' })
/**
 * A day as the design writes it, «22 Sep»: the day, then en-US's three-letter month (en-GB's is
 * «Sept»). A bare date (yyyy-mm-dd) is that calendar day, read at noon so no zone moves it.
 */
export function dayMonth(iso: string): string {
  const at = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso)
  const parts = MONTH_DAY.formatToParts(at)
  return `${parts.find((p) => p.type === 'day')?.value ?? ''} ${parts.find((p) => p.type === 'month')?.value ?? ''}`
}

/** The design's `short`: a description up to its first full stop or colon */
export const shortOf = (desc: string) => desc.split(/\.\s|:\s/)[0] ?? desc

/** Whether every current rule is marked guidance, not legal advice: the footer says so only then */
export const allGuidance = (m: GrowthMagnets) => m.rules.length > 0 && m.rules.every((r) => r.guidance)
