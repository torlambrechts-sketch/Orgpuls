import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'

/**
 * Reading participation.
 *
 * Participation answers a different question from results — who was asked and who
 * answered, rather than what anyone said — and it is deliberately not k-anonymised.
 * The design shows Administrasjon at 5 employees and 3 answers on the same screen where
 * that group's results are withheld, and labels it "under terskel — vises bare som
 * deltakelse, aldri som resultat". A response rate discloses nothing about a person's
 * answers, and withholding it would break the product: you cannot chase a low response
 * rate you are not allowed to see.
 *
 * What the RPC never returns is WHO did not answer. There are counts here and no names,
 * because the product's promise is that the list of non-responders is unreadable by
 * anyone in the organisation. Do not add a reader for it on this side.
 *
 * `thin` and `pct` are the server's. `thin` in particular is computed from headcount
 * while results are withheld on respondent count; recomputing either here from the
 * numbers in this object would eventually disagree with the database and mask the wrong
 * groups.
 */
const GroupRow = z.object({
  group_name: z.string(),
  sort_order: z.coerce.number(),
  headcount: z.coerce.number(),
  answered: z.coerce.number(),
  pct: z.coerce.number(),
  thin: z.boolean(),
})

const Participation = z.object({
  threshold: z.coerce.number(),
  headcount: z.coerce.number(),
  answered: z.coerce.number(),
  pct: z.coerce.number(),
  groups: z.array(GroupRow),
})

const NotAvailable = z.object({ error: z.literal('not_available') })

export type Participation = z.infer<typeof Participation>
export type ParticipationGroup = z.infer<typeof GroupRow>

/**
 * Null means "nothing to show", never "not found" — the RPC merges the does-not-exist
 * and belongs-to-another-org branches on purpose, and a caller that distinguishes them
 * hands back the enumeration oracle 0005 removed.
 */
/**
 * Memoised for the length of one request. P2 in docs/CODE_REVIEW_2026-09-23.md.
 *
 * `/rapport` calls fifteen read functions, two of them `getResultsSummary` explicitly, and
 * `getMeasureEffects` then called it again for every round it found — so the most expensive
 * aggregation in the product ran three to five times for the same rounds in a single
 * render, returning identical results each time. Measured in the database on the design
 * fixture: `results_summary` 12.8 ms warm, 37.8 ms cold, over 1 559 buffers.
 *
 * React's `cache()` is per-request and argument-addressable: one render pass makes one call
 * per distinct argument, and nothing survives into the next request, so there is no
 * staleness to reason about. It is not a data cache and must not be confused with one — a
 * second page view recomputes everything.
 */
export const getParticipation = cache(async (roundId: string): Promise<Participation | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('participation', { p_round: roundId })
  if (callFailed('getParticipation', error)) return null
  if (NotAvailable.safeParse(data).success) return null

  const parsed = Participation.safeParse(data)
  return parsed.success ? parsed.data : null
})

/**
 * The bar colour thresholds are the design's (bundle line 2760): green at 80 and above,
 * amber at 60 and above, rust below. They are presentation, not policy — nothing in the
 * database branches on them — so they live here rather than in the RPC.
 */
export function rateColour(pct: number): string {
  if (pct >= 80) return '#5C9A55'
  if (pct >= 60) return '#E0A21F'
  return '#D4633A'
}
