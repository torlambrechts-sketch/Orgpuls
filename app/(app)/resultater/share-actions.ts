'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { callFailed } from '@/lib/supabase/read'
import { createClient } from '@/lib/supabase/server'

/**
 * The round's page for employees (0100, D-151): shown or not. public.set_results_page decides
 * who may — the daglig leder — and this re-checks the shape at the boundary only.
 */
export async function setResultsPage(roundId: string, on: boolean): Promise<{ ok: true; on: boolean } | { ok: false; problem: 'not_allowed' | 'failed' }> {
  const v = z.object({ roundId: z.string().uuid(), on: z.boolean() }).safeParse({ roundId, on })
  if (!v.success) return { ok: false, problem: 'failed' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_results_page', { p_round: v.data.roundId, p_on: v.data.on })
  if (error?.code === '42501') return { ok: false, problem: 'not_allowed' }
  if (callFailed('setResultsPage', error)) return { ok: false, problem: 'failed' }
  const r = z.object({ results_page: z.boolean() }).safeParse(data)
  if (!r.success) return { ok: false, problem: 'failed' }
  revalidatePath('/resultater')
  return { ok: true, on: r.data.results_page }
}
