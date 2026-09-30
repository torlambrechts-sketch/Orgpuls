'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from '@/lib/admin/actions'

/**
 * Ticketing Phase 2's writes (0135): canned replies edited in the admin, and the caller's
 * @mentions marked seen. The database checks the role and the second factor on every call and
 * writes the audit row; these only shape the request.
 */
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()

async function rpc(fn: string, args: Record<string, unknown>): Promise<AdminResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  return { ok: true }
}

const CannedInput = z.object({
  id: z.union([z.string().uuid(), z.literal('')]),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10000),
  sort: z.coerce.number().int().min(0).max(999),
})

/** Creates a canned reply (no id) or edits one. */
export async function saveCanned(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = CannedInput.safeParse({
    id: formData.get('id') ?? '',
    title: formData.get('title'),
    body: formData.get('body'),
    sort: formData.get('sort') || 0,
  })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_canned_reply_save', {
    p_id: parsed.data.id || null,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_sort: parsed.data.sort,
  })
  if (r.ok) revalidatePath('/admin/tickets/canned')
  return r
}

/** Archives a canned reply, or restores it: an archived one is not offered in the reply box. */
export async function setCannedActive(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ id: z.string().uuid(), active: z.enum(['yes', 'no']) })
    .safeParse({ id: formData.get('id'), active: formData.get('active') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_canned_reply_active', { p_id: parsed.data.id, p_active: parsed.data.active === 'yes' })
  if (r.ok) revalidatePath('/admin/tickets/canned')
  return r
}

/** Marks all the caller's @mentions seen. Opening a ticket marks that ticket's own. */
export async function markMentionsSeen(_prev: AdminResult | null): Promise<AdminResult> {
  const r = await rpc('admin_ticket_mentions_seen', { p_ticket: null })
  if (r.ok) revalidatePath('/admin/tickets/mentions')
  return r
}
