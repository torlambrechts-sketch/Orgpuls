'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'

/**
 * Admin › Users & roles › CRM access (0196, D-211; SEC-07, SEC-08, SEC-09): permission sets, who works under
 * which set and in which visibility group, the groups and the teams. The database decides — a super-admin's
 * calls, with a reason while typed reasons are on, each logged; these actions shape the request.
 */
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()
const Id = z.string().uuid()
const OptionalId = z.union([z.literal(''), Id]).transform((v) => (v === '' ? null : v))
const reasonOf = (raw: FormDataEntryValue | null) => String(raw ?? '').trim().slice(0, 500) || null
const ACTION = /^(deals|contacts|campaigns|global)\.[a-z_]{2,30}$/

async function rpc(fn: string, args: Record<string, unknown>): Promise<AdminResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  const reply = Reply.safeParse(data)
  if (error || !reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  revalidatePath('/admin/admins')
  revalidatePath('/admin/crm', 'layout')
  return { ok: true }
}

/** Add a custom set (no id), or change a set's name and actions */
export async function saveCrmSet(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ id: OptionalId, name: z.string().trim().min(1).max(80), actions: z.array(z.string().regex(ACTION)).max(100) })
    .safeParse({ id: String(formData.get('id') ?? ''), name: String(formData.get('name') ?? ''), actions: formData.getAll('actions') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  return rpc('admin_crm_set_save', { p_id: parsed.data.id, p_name: parsed.data.name, p_actions: parsed.data.actions, p_reason: reasonOf(formData.get('reason')) })
}

export async function deleteCrmSet(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = Id.safeParse(formData.get('id'))
  if (!id.success) return { ok: false, problem: 'invalid' }
  return rpc('admin_crm_set_delete', { p_id: id.data, p_reason: reasonOf(formData.get('reason')) })
}

/** A staff member's own set (empty: their role's) and visibility group (empty: none) */
export async function setCrmStaffAccess(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ user: Id, set: OptionalId, group: OptionalId })
    .safeParse({ user: formData.get('user'), set: String(formData.get('set') ?? ''), group: String(formData.get('group') ?? '') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  return rpc('admin_crm_staff_access', { p_user: parsed.data.user, p_set: parsed.data.set, p_group: parsed.data.group, p_reason: reasonOf(formData.get('reason')) })
}

/** Add a visibility group (no id), or rename and move one */
export async function saveCrmGroup(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ id: OptionalId, name: z.string().trim().min(1).max(80), parent: OptionalId })
    .safeParse({ id: String(formData.get('id') ?? ''), name: String(formData.get('name') ?? ''), parent: String(formData.get('parent') ?? '') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  return rpc('admin_crm_group_save', { p_id: parsed.data.id, p_name: parsed.data.name, p_parent: parsed.data.parent, p_reason: reasonOf(formData.get('reason')) })
}

export async function deleteCrmGroup(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = Id.safeParse(formData.get('id'))
  if (!id.success) return { ok: false, problem: 'invalid' }
  return rpc('admin_crm_group_delete', { p_id: id.data, p_reason: reasonOf(formData.get('reason')) })
}

/** Add a team (no id), or change its name, manager and members */
export async function saveCrmTeam(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ id: OptionalId, name: z.string().trim().min(1).max(80), manager: OptionalId, members: z.array(Id).max(500) })
    .safeParse({
      id: String(formData.get('id') ?? ''),
      name: String(formData.get('name') ?? ''),
      manager: String(formData.get('manager') ?? ''),
      members: formData.getAll('members'),
    })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  return rpc('admin_crm_team_save', {
    p_id: parsed.data.id,
    p_name: parsed.data.name,
    p_manager: parsed.data.manager,
    p_members: parsed.data.members,
    p_reason: reasonOf(formData.get('reason')),
  })
}

export async function deleteCrmTeam(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = Id.safeParse(formData.get('id'))
  if (!id.success) return { ok: false, problem: 'invalid' }
  return rpc('admin_crm_team_delete', { p_id: id.data, p_reason: reasonOf(formData.get('reason')) })
}
