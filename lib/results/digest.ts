import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'
import { Participation } from '@/lib/participation/read'
import { Summary, type ResultsSummary } from './read'
import { orNull, Workspace, type ResultsWorkspace } from './workspace'

/**
 * A screen's results, in one call (0044's `results_digest`).
 *
 * A screen names what it shows — the rounds whose response rate it prints, the rounds
 * whose index it prints, and at most one round in depth — and gets all of it in one
 * response. Before, each was its own call: twelve `participation` calls for the rounds
 * list alone on the design fixture, up to fifteen round trips for one page.
 *
 * Every part is one of the gated readers, composed in the database with no privilege of
 * its own, so each part arrives already k-gated and already scoped to the caller. As with
 * the workspace, a part that is refused, or whose shape is not the expected one, becomes
 * null, and the screen renders its empty treatment.
 */
const Digest = z.object({
  participation: z.array(z.object({ round_id: z.string(), participation: orNull(Participation) })),
  summaries: z.array(z.object({ round_id: z.string(), summary: orNull(Summary) })),
  workspace: orNull(Workspace),
})

export type DigestRequest = {
  /** rounds whose response rate the screen prints */
  participation?: (string | null | undefined)[]
  /** rounds whose index the screen prints */
  summaries?: (string | null | undefined)[]
  /** the round shown in depth, as Resultater reads it */
  workspace?: string | null
}

export type ResultsDigest = {
  participation: Map<string, z.infer<typeof Participation> | null>
  summaries: Map<string, ResultsSummary | null>
  workspace: ResultsWorkspace | null
}

const EMPTY: ResultsDigest = { participation: new Map(), summaries: new Map(), workspace: null }

/** Memoised per request on the request's canonical form: one call per distinct request. */
const read = cache(async (key: string): Promise<ResultsDigest> => {
  const req = JSON.parse(key) as { p: string[]; s: string[]; w: string | null }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('results_digest', {
    p_participation: req.p,
    p_summaries: req.s,
    p_workspace: req.w,
  })
  if (callFailed('getResultsDigest', error)) return EMPTY
  const parsed = Digest.safeParse(data)
  if (!parsed.success) return EMPTY
  return {
    participation: new Map(parsed.data.participation.map((p) => [p.round_id, p.participation])),
    summaries: new Map(parsed.data.summaries.map((s) => [s.round_id, s.summary])),
    workspace: parsed.data.workspace,
  }
})

const ids = (xs: (string | null | undefined)[] | undefined) => [...new Set((xs ?? []).filter((x): x is string => !!x))].sort()

export function getResultsDigest(req: DigestRequest): Promise<ResultsDigest> {
  const key = { p: ids(req.participation), s: ids(req.summaries), w: req.workspace ?? null }
  if (!key.p.length && !key.s.length && !key.w) return Promise.resolve(EMPTY)
  return read(JSON.stringify(key))
}
