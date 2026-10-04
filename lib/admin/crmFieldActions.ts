'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'
import { FIELD_ENTITIES, FIELD_TYPES, IMPORTANCES, KEY, parseOptions } from './crmFieldTypes'

/**
 * CRM › Fields (0197, D-222; CUS-01 to CUS-04): add and change custom fields and their groups, archive and bring
 * them back. The database decides — the CRM settings' holders only, a reason while typed reasons are on, every
 * save a new version — and these actions shape the request.
 */
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()
const Id = z.string().uuid()
const reasonOf = (raw: FormDataEntryValue | null) => String(raw ?? '').trim().slice(0, 500) || null

async function rpc(fn: string, args: Record<string, unknown>): Promise<AdminResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  const reply = Reply.safeParse(data)
  if (error || !reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  revalidatePath('/admin/crm', 'layout')
  return { ok: true }
}

const Field = z.object({
  id: z.union([z.literal(''), Id]),
  entity: z.enum(FIELD_ENTITIES),
  key: z.string().trim().toLowerCase(),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  type: z.enum(FIELD_TYPES),
  group_id: z.union([z.literal(''), Id]),
  sort: z.string().regex(/^-?\d{0,6}$/),
  options: z.string().max(100_000),
  importance: z.enum(IMPORTANCES),
  required_from_stage: z.string().max(40),
  formula: z.string().trim().max(500),
  version: z.string().regex(/^\d{0,9}$/),
  hidden_sets: z.array(Id).max(100),
  read_only_sets: z.array(Id).max(100),
})

/** Add a field (no id) or change one; the entity and key are fixed when it is made */
export async function saveCrmField(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = Field.safeParse({
    id: String(formData.get('id') ?? ''),
    entity: formData.get('entity'),
    key: String(formData.get('key') ?? ''),
    label: String(formData.get('label') ?? ''),
    description: String(formData.get('description') ?? ''),
    type: formData.get('type'),
    group_id: String(formData.get('group_id') ?? ''),
    sort: String(formData.get('sort') ?? ''),
    options: String(formData.get('options') ?? ''),
    importance: formData.get('importance') ?? 'none',
    required_from_stage: String(formData.get('required_from_stage') ?? ''),
    formula: String(formData.get('formula') ?? ''),
    version: String(formData.get('version') ?? ''),
    hidden_sets: formData.getAll('hidden_sets'),
    read_only_sets: formData.getAll('read_only_sets'),
  })
  if (!parsed.success) return { ok: false, problem: parsed.error.issues[0]?.path[0] === 'label' ? 'invalid_label' : 'invalid' }
  const d = parsed.data
  if (!d.id && !KEY.test(d.key)) return { ok: false, problem: 'invalid_key' }
  const p: Record<string, unknown> = {
    label: d.label,
    description: d.description,
    type: d.type,
    group_id: d.group_id,
    sort: d.sort === '' ? 0 : Number(d.sort),
    importance: d.importance,
    required_from_stage: d.entity === 'company' ? d.required_from_stage : '',
    in_add_form: formData.get('in_add_form') === 'on',
    in_detail: formData.get('in_detail') === 'on',
    formula: d.type === 'number' || d.type === 'monetary' ? d.formula : '',
    hidden_sets: d.hidden_sets,
    read_only_sets: d.read_only_sets,
    options: parseOptions(d.options),
  }
  if (!d.id) Object.assign(p, { entity: d.entity, key: d.key })
  if (d.version) p.version = Number(d.version)
  return rpc('admin_crm_field_save', { p_id: d.id || null, p, p_reason: reasonOf(formData.get('reason')) })
}

/** Archive a field (its values stay, out of sight) or bring it back */
export async function archiveCrmField(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = Id.safeParse(formData.get('id'))
  if (!id.success) return { ok: false, problem: 'invalid' }
  return rpc('admin_crm_field_archive', { p_id: id.data, p_archived: formData.get('archived') === 'true', p_reason: reasonOf(formData.get('reason')) })
}

/** Add a group (no id), or rename and re-sort one */
export async function saveCrmFieldGroup(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ id: z.union([z.literal(''), Id]), entity: z.enum(FIELD_ENTITIES), name: z.string().trim().min(1).max(80), sort: z.string().regex(/^-?\d{0,6}$/) })
    .safeParse({
      id: String(formData.get('id') ?? ''),
      entity: formData.get('entity'),
      name: String(formData.get('name') ?? ''),
      sort: String(formData.get('sort') ?? ''),
    })
  if (!parsed.success) return { ok: false, problem: 'invalid_name' }
  const d = parsed.data
  return rpc('admin_crm_field_group_save', {
    p_id: d.id || null,
    p_entity: d.entity,
    p_name: d.name,
    p_sort: d.sort === '' ? 0 : Number(d.sort),
    p_reason: reasonOf(formData.get('reason')),
  })
}

/** Archive a group no live field sits in, or bring it back */
export async function archiveCrmFieldGroup(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = Id.safeParse(formData.get('id'))
  if (!id.success) return { ok: false, problem: 'invalid' }
  return rpc('admin_crm_field_group_archive', { p_id: id.data, p_archived: formData.get('archived') === 'true', p_reason: reasonOf(formData.get('reason')) })
}
