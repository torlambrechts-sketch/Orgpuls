'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'
import { Block, CAMPAIGN_KINDS, CONTACT_ROLES, Filter } from './crm'

/**
 * The CRM's writes (0055, D-101). The database decides who may do what, with a second
 * factor, and logs each call; these actions shape the request and name the refusal.
 */
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()

async function rpc(fn: string, args: Record<string, unknown>): Promise<AdminResult & { data?: Record<string, unknown> }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  return { ok: true, data: reply.data }
}

const tagList = (raw: FormDataEntryValue | null) =>
  String(raw ?? '')
    .split(/[,;\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)

const TAG = /^[a-z0-9æøå_-]{1,40}$/

// ---------------------------------------------------------------- contacts
export async function saveContact(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = formData.get('id') ? z.string().uuid().safeParse(formData.get('id')) : null
  if (id && !id.success) return { ok: false, problem: 'invalid' }
  const tags = tagList(formData.get('tags'))
  if (tags.length > 20 || tags.some((t) => !TAG.test(t))) return { ok: false, problem: 'invalid_tags' }
  const role = String(formData.get('role') ?? '')
  if (role && !(CONTACT_ROLES as readonly string[]).includes(role)) return { ok: false, problem: 'invalid_role' }
  const p: Record<string, unknown> = {
    name: String(formData.get('name') ?? '').slice(0, 120),
    company: String(formData.get('company') ?? '').slice(0, 200),
    org_number: String(formData.get('org_number') ?? '').slice(0, 20),
    role,
    tags,
    lang: formData.get('lang') === 'en' ? 'en' : 'no',
  }
  if (!id) {
    p.email = String(formData.get('email') ?? '').slice(0, 254)
    p.consent_source = String(formData.get('consent_source') ?? '').slice(0, 200)
    p.consent_at = String(formData.get('consent_at') ?? '')
    if (formData.get('source') === 'event') p.source = 'event'
  }
  const r = await rpc('admin_crm_save_contact', { p_id: id ? id.data : null, p })
  if (!r.ok) return r
  revalidatePath('/admin/crm')
  if (id) {
    revalidatePath(`/admin/crm/contacts/${id.data}`)
    return { ok: true }
  }
  redirect(`/admin/crm/contacts/${String(r.data?.id)}` as Route)
}

export async function contactAction(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ id: z.string().uuid(), action: z.enum(['unsubscribe', 'erase']), reason: z.string().trim().min(5).max(500) })
    .safeParse({ id: formData.get('id'), action: formData.get('action'), reason: formData.get('reason') })
  if (!parsed.success) return { ok: false, problem: 'reason_required' }
  const r = await rpc('admin_crm_contact_action', { p_id: parsed.data.id, p_action: parsed.data.action, p_reason: parsed.data.reason })
  if (!r.ok) return r
  revalidatePath('/admin/crm')
  if (parsed.data.action === 'erase') redirect('/admin/crm' as Route)
  revalidatePath(`/admin/crm/contacts/${parsed.data.id}`)
  return { ok: true }
}

export type ImportResult =
  | { ok: true; inserted: number; updated: number; suppressed: number; rejected: { row: number; reason: string }[] }
  | { ok: false; problem: string }

const ImportRow = z.object({
  email: z.string().max(254),
  name: z.string().max(120).optional(),
  company: z.string().max(200).optional(),
  org_number: z.string().max(20).optional(),
  role: z.string().max(40).optional(),
  tags: z.string().max(400).optional(),
  consent_source: z.string().max(200).optional(),
  consent_at: z.string().max(40).optional(),
  lang: z.string().max(4).optional(),
})

/** Rows parsed from the admin's CSV in the browser; the database checks every one again. */
export async function importContacts(rows: unknown): Promise<ImportResult> {
  const parsed = z.array(ImportRow).min(1).max(5000).safeParse(rows)
  if (!parsed.success) return { ok: false, problem: 'invalid_file' }
  const r = await rpc('admin_crm_import', { p_rows: parsed.data })
  if (!r.ok) return { ok: false, problem: r.problem }
  const out = z
    .object({
      inserted: z.coerce.number(),
      updated: z.coerce.number(),
      suppressed: z.coerce.number(),
      rejected: z.array(z.object({ row: z.coerce.number(), reason: z.string() })),
    })
    .safeParse(r.data)
  if (!out.success) return { ok: false, problem: 'failed' }
  revalidatePath('/admin/crm')
  return { ok: true, ...out.data }
}

export async function saveCrmSettings(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ on: z.boolean(), reason: z.string().trim().min(5).max(500) })
    .safeParse({ on: formData.get('customer_exception') === 'on', reason: formData.get('reason') })
  if (!parsed.success) return { ok: false, problem: 'reason_required' }
  const r = await rpc('admin_crm_settings', { p_customer_exception: parsed.data.on, p_reason: parsed.data.reason })
  if (r.ok) revalidatePath('/admin/crm')
  return r.ok ? { ok: true } : r
}

// ---------------------------------------------------------------- segments
function filterOf(formData: FormData): Filter | null {
  const f: Record<string, unknown> = {}
  const list = (k: string) => formData.getAll(k).map(String).filter(Boolean)
  for (const k of ['types', 'roles', 'sources'] as const) {
    const v = list(k)
    if (v.length) f[k] = v
  }
  const tags = tagList(formData.get('tags'))
  if (tags.length) f.tags = tags
  const lang = String(formData.get('lang') ?? '')
  if (lang) f.lang = lang
  for (const k of ['min_employees', 'max_employees', 'no_survey_days'] as const) {
    const v = String(formData.get(k) ?? '').trim()
    if (v) f[k] = Number(v)
  }
  const nace = String(formData.get('nace') ?? '').trim()
  if (nace) f.nace = nace
  if (formData.get('mailable_only') === 'on') f.mailable_only = true
  const parsed = Filter.safeParse(f)
  return parsed.success ? parsed.data : null
}

export async function saveSegment(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = formData.get('id') ? z.string().uuid().safeParse(formData.get('id')) : null
  if (id && !id.success) return { ok: false, problem: 'invalid' }
  const filter = filterOf(formData)
  if (!filter) return { ok: false, problem: 'invalid_filter' }
  const r = await rpc('admin_crm_segment_save', { p_id: id ? id.data : null, p_name: String(formData.get('name') ?? ''), p_filter: filter })
  if (!r.ok) return r
  revalidatePath('/admin/crm/segments')
  redirect('/admin/crm/segments' as Route)
}

export type Preview =
  | { ok: true; total: number; mailable: number; sample: { email: string; name: string | null; type: string; mailable: boolean }[] }
  | { ok: false; problem: string }

export async function previewSegment(formData: FormData): Promise<Preview> {
  const filter = filterOf(formData)
  if (!filter) return { ok: false, problem: 'invalid_filter' }
  const r = await rpc('admin_crm_segment_preview', { p_filter: filter })
  if (!r.ok) return { ok: false, problem: r.problem }
  const out = z
    .object({
      total: z.coerce.number(),
      mailable: z.coerce.number(),
      sample: z.array(z.object({ email: z.string(), name: z.string().nullable(), type: z.string(), mailable: z.boolean() })),
    })
    .safeParse(r.data)
  return out.success ? { ok: true, ...out.data } : { ok: false, problem: 'failed' }
}

export async function deleteSegment(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_crm_segment_delete', { p_id: id.data })
  if (!r.ok) return r
  revalidatePath('/admin/crm/segments')
  redirect('/admin/crm/segments' as Route)
}

// ---------------------------------------------------------------- campaigns
export async function createCampaign(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ name: z.string().trim().min(1).max(120), kind: z.enum(CAMPAIGN_KINDS), lang: z.enum(['no', 'en']) })
    .safeParse({ name: formData.get('name'), kind: formData.get('kind'), lang: formData.get('lang') })
  if (!parsed.success) return { ok: false, problem: 'invalid_name' }
  const r = await rpc('admin_crm_campaign_save', { p_id: null, p: parsed.data })
  if (!r.ok) return r
  redirect(`/admin/crm/campaigns/${String(r.data?.id)}` as Route)
}

export async function saveCampaign(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  let blocks: unknown
  try {
    blocks = JSON.parse(String(formData.get('blocks') ?? '[]'))
  } catch {
    return { ok: false, problem: 'invalid_blocks' }
  }
  const parsed = z
    .object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      kind: z.enum(CAMPAIGN_KINDS),
      lang: z.enum(['no', 'en']),
      subject: z.string().max(150),
      preheader: z.string().max(200),
      segment_id: z.union([z.string().uuid(), z.literal('')]),
      utm_campaign: z.string().max(60),
      blocks: z.array(Block).max(30),
    })
    .safeParse({
      id: formData.get('id'),
      name: formData.get('name'),
      kind: formData.get('kind'),
      lang: formData.get('lang'),
      subject: formData.get('subject') ?? '',
      preheader: formData.get('preheader') ?? '',
      segment_id: formData.get('segment_id') ?? '',
      utm_campaign: formData.get('utm_campaign') ?? '',
      blocks,
    })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const { id, ...p } = parsed.data
  const r = await rpc('admin_crm_campaign_save', { p_id: id, p })
  if (r.ok) revalidatePath(`/admin/crm/campaigns/${id}`)
  return r.ok ? { ok: true } : r
}

/** A datetime-local value, read as Oslo time. */
function osloToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!m) return null
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Oslo',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asOslo = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(guess - (asOslo - guess)).toISOString()
}

export async function campaignAction(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ id: z.string().uuid(), action: z.enum(['test', 'schedule', 'now', 'cancel']), at: z.string().max(20) })
    .safeParse({ id: formData.get('id'), action: formData.get('action'), at: formData.get('at') ?? '' })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const { id, action, at } = parsed.data
  let r: AdminResult & { data?: Record<string, unknown> }
  if (action === 'test') r = await rpc('admin_crm_campaign_test', { p_id: id })
  else if (action === 'cancel') r = await rpc('admin_crm_campaign_cancel', { p_id: id })
  else {
    const when = action === 'now' ? new Date().toISOString() : osloToIso(at)
    if (!when) return { ok: false, problem: 'invalid_time' }
    r = await rpc('admin_crm_campaign_schedule', { p_id: id, p_at: when })
  }
  if (!r.ok) return r
  revalidatePath(`/admin/crm/campaigns/${id}`)
  revalidatePath('/admin/crm/campaigns')
  return action === 'test' ? { ok: true, message: String(r.data?.to ?? '') } : { ok: true }
}
