import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Band } from '@/components/ui/Risk'
import { callFailed } from '@/lib/supabase/read'

/**
 * Reading results.
 *
 * Every field here comes back from a SECURITY DEFINER RPC that applies k-anonymity in
 * the database. Nothing is recomputed on this side: the band, the index and the
 * threshold are the server's, because a value re-derived in the client can disagree
 * with the statutory report, and the report is the thing a labour inspector reads.
 *
 * The shapes are parsed rather than cast. An RPC returns jsonb, so TypeScript would
 * otherwise be asserting a contract it cannot see — and a silently-wrong shape here
 * becomes a wrong number on a compliance document.
 */
const BAND = z.enum(['lav', 'middels', 'hoy'])

const FactorRow = z.object({
  key: z.string(),
  law_ref: z.string(),
  sort_order: z.number(),
  index: z.coerce.number(),
  band: BAND,
})

/**
 * `scope` says what the number is an average *of*, and a screen must not assume.
 *
 * Since 0022 the same RPC answers differently by role: a daglig leder or verneombud gets
 * the whole undertaking, an avdelingsleder gets their own department. "61" labelled "hele
 * virksomheten" is a different claim from "61" over one group, and nothing in the number
 * distinguishes them — so the payload names its own scope and the screen labels it from
 * that. `scope_label` carries the department's name when there is one.
 */
const SCOPE = z.enum(['org', 'group'])

export const Summary = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    n: z.coerce.number(),
    threshold: z.coerce.number(),
    index: z.coerce.number(),
    band: BAND,
    scope: SCOPE.default('org'),
    scope_label: z.string().nullable().default(null),
    factors: z.array(FactorRow),
  }),
  z.object({
    status: z.literal('insufficient_data'),
    n: z.coerce.number(),
    threshold: z.coerce.number(),
    scope: SCOPE.default('org'),
    scope_label: z.string().nullable().default(null),
  }),
  /**
   * The caller's department has enough answers but is withheld to protect a smaller one
   * (0034): its figures together with the organisation's would give that group away.
   */
  z.object({
    status: z.literal('protected'),
    n: z.coerce.number(),
    threshold: z.coerce.number(),
    scope: SCOPE.default('group'),
    scope_label: z.string().nullable().default(null),
  }),
])

export const NotAvailable = z.object({ error: z.literal('not_available') })

export type ResultsSummary = z.infer<typeof Summary>
export type FactorResult = z.infer<typeof FactorRow>
export type { Band }

/**
 * The band distribution printed beneath an index — three counts, "5 forsvarlig ·
 * 4 følges opp · 2 høy risiko". It takes anything carrying a band, because the band
 * comes from the server whether the rows are the organisation's (results_summary) or
 * one group's (results_by_group), and the counting is the same either way.
 */
export function bandCounts(factors: { band: Band }[]): Record<Band, number> {
  return factors.reduce(
    (acc, f) => {
      acc[f.band] += 1
      return acc
    },
    { lav: 0, middels: 0, hoy: 0 } as Record<Band, number>,
  )
}

/**
 * Reading results per group.
 *
 * `results_by_group` applies k per group before it returns anything: a group with
 * fewer than `threshold` responses comes back with `status: 'insufficient_data'` and
 * `factors: null`. The withholding is the server's, and this side must never try to
 * fill the hole — no zero, no average of the others, no "roughly". The screen renders
 * the design's masked treatment over the absence.
 *
 * Note what the RPC does NOT return: an overall index per group. The organisation's
 * index is computed in SQL by `results_summary`; there is no equivalent for a group,
 * and averaging the factor rows here would be this side deriving a headline figure
 * that the statutory report has never seen. See docs/DEVIATIONS.md D-15.
 */
const GroupFactorRow = z.object({
  key: z.string(),
  index: z.coerce.number(),
  band: BAND,
})

const GroupRow = z.object({
  group_name: z.string(),
  n: z.coerce.number(),
  /**
   * `protected`: at or above the threshold, withheld all the same, because the groups
   * under it would otherwise be the published whole minus the published parts (0034).
   */
  status: z.enum(['ok', 'insufficient_data', 'protected']),
  factors: z.array(GroupFactorRow).nullable(),
})

export const ByGroup = z.object({
  threshold: z.coerce.number(),
  /** 'org' when every group was offered, 'groups' when the caller's scope narrowed it */
  scope: z.enum(['org', 'groups']).default('org'),
  groups: z.array(GroupRow),
})

export type ResultsByGroup = z.infer<typeof ByGroup>
export type GroupResult = z.infer<typeof GroupRow>

/**
 * Returns null when the round is not available to this caller — which covers both
 * "does not exist" and "belongs to another organisation", because the RPC deliberately
 * does not distinguish them. Callers must treat null as "nothing to show", never as
 * "not found", or they reintroduce the enumeration oracle 0005 removed.
 */
export const getResultsByGroup = cache(async (roundId: string): Promise<ResultsByGroup | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('results_by_group', { p_round: roundId })
  if (callFailed('getResultsByGroup', error)) return null
  if (NotAvailable.safeParse(data).success) return null

  const parsed = ByGroup.safeParse(data)
  return parsed.success ? parsed.data : null
})

export { deltaColour, heatTone, signedDelta } from './tone'

/**
 * "Anbefaler oss" — the recommendation figure (0035): 100 × (answers of 5 − answers of
 * 1–3) / answers, for the whole organisation only. An avdelingsleder is refused, which
 * arrives here as null like every other refusal. `not_asked` and `insufficient_data`
 * carry no score, and the screen renders nothing for either — never a zero.
 */
export const Recommendation = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    threshold: z.coerce.number(),
    n: z.coerce.number(),
    answered: z.coerce.number(),
    score: z.coerce.number().int().min(-100).max(100),
  }),
  z.object({ status: z.literal('insufficient_data'), threshold: z.coerce.number() }),
  z.object({ status: z.literal('not_asked'), threshold: z.coerce.number() }),
])

export type ResultsRecommendation = z.infer<typeof Recommendation>

export const getRecommendation = cache(
  async (roundId: string): Promise<ResultsRecommendation | null> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('results_recommendation', { p_round: roundId })
    if (callFailed('getRecommendation', error)) return null
    if (NotAvailable.safeParse(data).success) return null
    const parsed = Recommendation.safeParse(data)
    return parsed.success ? parsed.data : null
  },
)
