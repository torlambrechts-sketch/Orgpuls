'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'
import { DeletePreview, TRASH_ENTITIES } from './crm'

/**
 * Delete, restore and delete permanently (0195, D-210; CRM-12, SF-15). The database decides who may do
 * what — deleting and restoring are CRM writes, deleting permanently a super-admin's — asks for a reason
 * while typed reasons are on, holds a bulk delete for a second admin while that rule is on, and logs each
 * call; these actions shape the request.
 */
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()
const Entity = z.enum(TRASH_ENTITIES)
const Ids = z.array(z.string().uuid()).min(1)
const reasonOf = (raw: FormDataEntryValue | null) => String(raw ?? '').trim().slice(0, 500)

async function rpc(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  const reply = Reply.safeParse(data)
  if (error || !reply.success) return { ok: false as const, problem: 'failed' }
  if (!reply.data.ok) return { ok: false as const, problem: reply.data.error ?? 'failed' }
  return { ok: true as const, data: reply.data as Record<string, unknown> }
}

function refresh() {
  revalidatePath('/admin/crm', 'layout')
}

export type PreviewResult = { ok: true; preview: DeletePreview } | { ok: false; problem: string }

/** What a delete would do: the records, their names and what goes with them; nothing is changed */
export async function previewDelete(entity: string, ids: string[]): Promise<PreviewResult> {
  const parsed = z.object({ entity: Entity, ids: Ids }).safeParse({ entity, ids })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_crm_delete_preview', { p_entity: parsed.data.entity, p_ids: parsed.data.ids })
  if (!r.ok) return r
  const preview = DeletePreview.safeParse(r.data)
  return preview.success ? { ok: true, preview: preview.data } : { ok: false, problem: 'failed' }
}

/** Into the restore list; or, for a bulk delete while approval is on, a request for a second admin (message «pending») */
export async function deleteRecords(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z.object({ entity: Entity, ids: Ids }).safeParse({ entity: formData.get('entity'), ids: formData.getAll('ids') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_crm_delete', { p_entity: parsed.data.entity, p_ids: parsed.data.ids, p_reason: reasonOf(formData.get('reason')) || null })
  if (!r.ok) return r
  refresh()
  return { ok: true, message: r.data.pending ? 'pending' : 'deleted' }
}

export async function restoreRecords(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z.object({ entity: Entity, ids: Ids }).safeParse({ entity: formData.get('entity'), ids: formData.getAll('ids') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_crm_restore', { p_entity: parsed.data.entity, p_ids: parsed.data.ids, p_reason: reasonOf(formData.get('reason')) || null })
  if (!r.ok) return r
  refresh()
  return { ok: true }
}

export async function purgeRecords(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z.object({ entity: Entity, ids: Ids }).safeParse({ entity: formData.get('entity'), ids: formData.getAll('ids') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_crm_purge_now', { p_entity: parsed.data.entity, p_ids: parsed.data.ids, p_reason: reasonOf(formData.get('reason')) || null })
  if (!r.ok) return r
  refresh()
  return { ok: true }
}

/** A second admin approves or rejects a bulk delete */
export async function decideDelete(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ id: z.string().uuid(), approve: z.enum(['yes', 'no']) })
    .safeParse({ id: formData.get('id'), approve: formData.get('approve') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_crm_delete_decide', {
    p_request: parsed.data.id,
    p_approve: parsed.data.approve === 'yes',
    p_reason: reasonOf(formData.get('reason')) || null,
  })
  if (!r.ok) return r
  refresh()
  return { ok: true }
}
