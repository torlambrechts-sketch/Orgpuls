import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Band } from '@/components/ui/Risk'

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

const Summary = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    n: z.coerce.number(),
    threshold: z.coerce.number(),
    index: z.coerce.number(),
    band: BAND,
    factors: z.array(FactorRow),
  }),
  z.object({
    status: z.literal('insufficient_data'),
    n: z.coerce.number(),
    threshold: z.coerce.number(),
  }),
])

const NotAvailable = z.object({ error: z.literal('not_available') })

export type ResultsSummary = z.infer<typeof Summary>
export type FactorResult = z.infer<typeof FactorRow>
export type { Band }

/**
 * Returns null when the round is not available to this caller — which covers both
 * "does not exist" and "belongs to another organisation", because the RPC deliberately
 * does not distinguish them. Callers must treat null as "nothing to show", never as
 * "not found", or they reintroduce the enumeration oracle 0005 removed.
 */
export async function getResultsSummary(roundId: string): Promise<ResultsSummary | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('results_summary', { p_round: roundId })
  if (error) return null

  if (NotAvailable.safeParse(data).success) return null

  const parsed = Summary.safeParse(data)
  if (!parsed.success) {
    // a shape we do not recognise is not a number we are willing to render
    return null
  }
  return parsed.data
}

/** The band distribution the Innsikt screen prints beneath the index. */
export function bandCounts(factors: FactorResult[]): Record<Band, number> {
  return factors.reduce(
    (acc, f) => {
      acc[f.band] += 1
      return acc
    },
    { lav: 0, middels: 0, hoy: 0 } as Record<Band, number>,
  )
}
