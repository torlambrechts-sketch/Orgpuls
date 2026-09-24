import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'
import { ByGroup, NotAvailable, Recommendation, Summary } from './read'

/**
 * What design 3's Resultater reads, in one call (0037's `results_workspace`).
 *
 * Every part is one of the gated readers, composed in the database with no privilege of
 * its own, so each part arrives already k-gated and already scoped to the caller. Each is
 * parsed here and any part that is refused, or whose shape is not the expected one,
 * becomes null: the screen renders the block's empty treatment and never a guess. D-72.
 */
const Item = z.object({ key: z.string(), ordinal: z.coerce.number(), index: z.coerce.number() })

const Items = z.object({
  threshold: z.coerce.number(),
  scope: z.enum(['org', 'group']),
  status: z.enum(['ok', 'insufficient_data']),
  items: z.array(Item),
  groups: z.array(
    z.object({
      group_name: z.string(),
      n: z.coerce.number(),
      status: z.enum(['ok', 'insufficient_data', 'protected']),
      items: z.array(Item).nullable(),
    }),
  ),
})

const Importance = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    minimum: z.coerce.number(),
    factors: z.array(z.object({ key: z.string(), r: z.coerce.number().min(-1).max(1).nullable() })),
  }),
  z.object({ status: z.literal('insufficient_data'), minimum: z.coerce.number() }),
])

/** A part the caller may not have, or whose shape is not ours: null, never a guess. */
const orNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.unknown().transform((v): z.infer<T> | null => {
    if (NotAvailable.safeParse(v).success) return null
    const p = schema.safeParse(v)
    return p.success ? p.data : null
  })

const Workspace = z.object({
  history: z.array(
    z.object({ round_id: z.string(), summary: orNull(Summary), groups: orNull(ByGroup) }),
  ),
  items: orNull(Items),
  recommendation: orNull(Recommendation),
  importance: orNull(Importance),
})

export type ResultsWorkspace = z.infer<typeof Workspace>
export type WorkspaceItems = z.infer<typeof Items>
export type WorkspaceImportance = z.infer<typeof Importance>

export const getResultsWorkspace = cache(async (roundId: string): Promise<ResultsWorkspace | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('results_workspace', { p_round: roundId })
  if (callFailed('getResultsWorkspace', error)) return null
  const parsed = Workspace.safeParse(data)
  return parsed.success ? parsed.data : null
})
