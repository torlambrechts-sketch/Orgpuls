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

/**
 * «Fortell de ansatte» (0212, D-245): one e-mail to everyone asked, with the page's link, once the
 * measures are decided. public.tell_employees decides whether it may go – the daglig leder, a page
 * that is shown, a collective measure decided, once per round – and this passes its answer on.
 */
export type TellResult = { ok: true } | { ok: false; problem: 'not_allowed' | 'page_not_shown' | 'no_measures' | 'already' | 'failed' }

export async function tellEmployees(roundId: string): Promise<TellResult> {
  const v = z.string().uuid().safeParse(roundId)
  if (!v.success) return { ok: false, problem: 'failed' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('tell_employees', { p_round: v.data })
  if (callFailed('tellEmployees', error)) return { ok: false, problem: 'failed' }
  const r = z
    .union([z.object({ queued: z.literal(true) }), z.object({ error: z.enum(['not_allowed', 'page_not_shown', 'no_measures', 'already']) })])
    .safeParse(data)
  if (!r.success) return { ok: false, problem: 'failed' }
  if ('error' in r.data) return { ok: false, problem: r.data.error }
  revalidatePath('/resultater')
  return { ok: true }
}
