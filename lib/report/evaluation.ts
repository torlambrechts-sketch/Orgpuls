import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed, readFailed } from '@/lib/supabase/read'
import { EVALUATION_CADENCES } from '@/lib/setup/read'

/**
 * «Evaluering av ordningen» (aml. § 9-2 tredje ledd; audit A-02, 0103, D-153).
 *
 * The cadence is chosen in Måleoppsett. What makes it more than a label is here: the
 * evaluations recorded under the report, and `evaluation_status`, which says by that cadence
 * when the next one is due — the same function that decides when the daglig leder is reminded,
 * so the report and the reminder cannot disagree.
 */
const Status = z.object({
  cadence: z.enum(EVALUATION_CADENCES as unknown as [string, ...string[]]).nullable(),
  last_on: z.string().nullable(),
  due_on: z.string().nullable(),
})
export type EvaluationStatus = z.infer<typeof Status>

export async function getEvaluationStatus(org: string | null): Promise<EvaluationStatus | null> {
  if (!org) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('evaluation_status', { p_org: org })
  if (callFailed('getEvaluationStatus', error)) return null
  const parsed = Status.safeParse(data)
  if (parseFailed('getEvaluationStatus', parsed)) return null
  return parsed.data
}

const Row = z.object({
  id: z.string(),
  held_on: z.string(),
  counterpart: z.string().nullable(),
  note: z.string().nullable(),
})
export type Evaluation = z.infer<typeof Row>

export async function getEvaluations(): Promise<Evaluation[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('evaluations')
    .select('id, held_on, counterpart, note')
    .order('held_on', { ascending: false })
  if (readFailed('getEvaluations', error, data)) return []
  const parsed = z.array(Row).safeParse(data)
  if (parseFailed('getEvaluations', parsed)) return []
  return parsed.data
}
