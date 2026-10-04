'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'

/**
 * The job monitor's one write (0199, D-213): the deliveries an event subscriber gave up on, or set aside at the loop
 * window, are tried again from now. The database decides who may (super-admin, support) and logs the call.
 */
const Reply = z.object({ ok: z.boolean(), error: z.string().optional(), retried: z.coerce.number().optional() })

export async function retryDeliveries(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z.object({ subscriber: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/) }).safeParse({ subscriber: formData.get('subscriber') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_crm_event_retry', { p_subscriber: parsed.data.subscriber })
  const reply = Reply.safeParse(data)
  if (error || !reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  revalidatePath('/admin/ops')
  return { ok: true, message: String(reply.data.retried ?? 0) }
}
