'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrgId } from '@/lib/org/current'
import { callFailed } from '@/lib/supabase/read'
import { createClient } from '@/lib/supabase/server'

/**
 * "Start neste puls nå" (0038). The guards are the function's: only a daglig leder, never
 * while a round is open, never within 14 days of the last one closing. This side passes
 * the organisation and reads the answer; it re-checks nothing, so it cannot disagree with
 * the database about who may.
 */
const Result = z.union([
  z.object({ ok: z.literal(true), round_id: z.string().uuid() }),
  z.object({
    error: z.enum(['not_available', 'round_open', 'too_soon', 'no_factors', 'read_only']),
    available_from: z.string().optional(),
  }),
])

export type StartResult =
  | { ok: true }
  | { ok: false; problem: 'not_available' | 'round_open' | 'too_soon' | 'no_factors' | 'read_only'; from?: string }

export async function startNextPulse(): Promise<StartResult> {
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'not_available' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('start_next_pulse', { p_org: org })
  if (callFailed('startNextPulse', error)) return { ok: false, problem: 'not_available' }

  const parsed = Result.safeParse(data)
  if (!parsed.success) return { ok: false, problem: 'not_available' }
  if ('error' in parsed.data) return { ok: false, problem: parsed.data.error, from: parsed.data.available_from }

  revalidatePath('/malinger')
  revalidatePath('/innsikt')
  revalidatePath('/resultater')
  return { ok: true }
}
