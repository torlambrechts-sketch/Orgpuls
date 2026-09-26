'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'
import { searchRegistry, SearchInput, type RegistryHit } from './brreg'
import { ACTIVITY_KINDS, Block, CAMPAIGN_KINDS, CONTACT_ROLES, Filter, MANUAL_STAGES } from './crm'

/**
 * The CRM's writes (0055, D-101; 0056–0058, D-103). The database decides who may do what, with a second
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
  const company = String(formData.get('company_id') ?? '')
  if (company && !z.string().uuid().safeParse(company).success) return { ok: false, problem: 'invalid' }
  if (formData.has('company_id')) p.company_id = company
  if (!id) {
    p.email = String(formData.get('email') ?? '').slice(0, 254)
    p.consent_source = String(formData.get('consent_source') ?? '').slice(0, 200)
    p.consent_at = String(formData.get('consent_at') ?? '')
    if (formData.get('source') === 'event') p.source = 'event'
  }
  const r = await rpc('admin_crm_save_contact', { p_id: id ? id.data : null, p })
  if (!r.ok) return r
  revalidatePath('/admin/crm/contacts')
  if (company) revalidatePath(`/admin/crm/prospects/${company}`)
  // a person added on a company's page stays on that page
  if (!id && company && formData.get('stay') === '1') return { ok: true }
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
  revalidatePath('/admin/crm/contacts')
  if (parsed.data.action === 'erase') redirect('/admin/crm/contacts' as Route)
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
  revalidatePath('/admin/crm/contacts')
  return { ok: true, ...out.data }
}

export async function saveCrmSettings(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ on: z.boolean(), reason: z.string().trim().min(5).max(500) })
    .safeParse({ on: formData.get('customer_exception') === 'on', reason: formData.get('reason') })
  if (!parsed.success) return { ok: false, problem: 'reason_required' }
  const r = await rpc('admin_crm_settings', { p_customer_exception: parsed.data.on, p_reason: parsed.data.reason })
  if (r.ok) revalidatePath('/admin/crm/contacts')
  return r.ok ? { ok: true } : r
}

// ---------------------------------------------------------------- segments
function filterOf(formData: FormData): Filter | null {
  const f: Record<string, unknown> = {}
  const list = (k: string) => formData.getAll(k).map(String).filter(Boolean)
  for (const k of ['types', 'roles', 'sources', 'stages', 'lists', 'bases'] as const) {
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
    .object({
      name: z.string().trim().min(1).max(120),
      kind: z.enum(CAMPAIGN_KINDS).optional(),
      lang: z.enum(['no', 'en']),
      template_key: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
    })
    .safeParse({
      name: formData.get('name'),
      kind: formData.get('kind') || undefined,
      lang: formData.get('lang') ?? 'no',
      template_key: formData.get('template_key') || undefined,
    })
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
      list_id: z.union([z.string().uuid(), z.literal('')]),
      utm_campaign: z.string().max(60),
      style: z.enum(['branded', 'letter']),
      signature: z.string().max(200),
      subject_b: z.string().max(150),
      ab_percent: z.coerce.number().int().min(10).max(50),
      ab_metric: z.enum(['open', 'click']),
      ab_wait_hours: z.coerce.number().int().min(1).max(48),
      publish_web: z.boolean(),
      slug: z.string().max(80),
      web_description: z.string().max(200),
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
      list_id: formData.get('list_id') ?? '',
      utm_campaign: formData.get('utm_campaign') ?? '',
      style: formData.get('style') ?? 'branded',
      signature: formData.get('signature') ?? '',
      subject_b: formData.get('subject_b') ?? '',
      ab_percent: formData.get('ab_percent') ?? 20,
      ab_metric: formData.get('ab_metric') ?? 'click',
      ab_wait_hours: formData.get('ab_wait_hours') ?? 4,
      publish_web: formData.get('publish_web') === 'on',
      slug: formData.get('slug') ?? '',
      web_description: formData.get('web_description') ?? '',
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

// ---------------------------------------------------------------- companies (0056, D-103)
const dateOrEmpty = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')])

export async function saveCompany(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = formData.get('id') ? z.string().uuid().safeParse(formData.get('id')) : null
  if (id && !id.success) return { ok: false, problem: 'invalid' }
  const tags = tagList(formData.get('tags'))
  if (tags.length > 20 || tags.some((t) => !TAG.test(t))) return { ok: false, problem: 'invalid_tags' }
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(200),
      org_number: z.string().max(20),
      employees: z.string().max(7),
      municipality: z.string().max(80),
      website: z.string().max(300),
      phone: z.string().max(40),
      owner_id: z.union([z.string().uuid(), z.literal('')]),
      next_step: z.string().max(300),
      next_step_at: dateOrEmpty,
      stage: z.union([z.enum(MANUAL_STAGES), z.literal('')]),
      lost_reason: z.string().max(300),
    })
    .safeParse({
      name: formData.get('name'),
      org_number: formData.get('org_number') ?? '',
      employees: formData.get('employees') ?? '',
      municipality: formData.get('municipality') ?? '',
      website: formData.get('website') ?? '',
      phone: formData.get('phone') ?? '',
      owner_id: formData.get('owner_id') ?? '',
      next_step: formData.get('next_step') ?? '',
      next_step_at: formData.get('next_step_at') ?? '',
      stage: formData.get('stage') ?? '',
      lost_reason: formData.get('lost_reason') ?? '',
    })
  if (!parsed.success) return { ok: false, problem: parsed.error.issues[0]?.path[0] === 'name' ? 'invalid_name' : 'invalid' }
  const p: Record<string, unknown> = { ...parsed.data, tags }
  // a customer's stage follows its plan: the form leaves it out, and the database refuses it
  if (!parsed.data.stage) delete p.stage
  if (id) delete p.org_number
  const r = await rpc('admin_crm_company_save', { p_id: id ? id.data : null, p })
  if (!r.ok) return r
  revalidatePath('/admin/crm/prospects')
  if (id) {
    revalidatePath(`/admin/crm/prospects/${id.data}`)
    return { ok: true }
  }
  redirect(`/admin/crm/prospects/${String(r.data?.id)}` as Route)
}

export async function logActivity(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({
      company: z.string().uuid(),
      contact: z.union([z.string().uuid(), z.literal('')]),
      kind: z.enum(ACTIVITY_KINDS),
      body: z.string().trim().min(1).max(4000),
      due: dateOrEmpty,
    })
    .safeParse({
      company: formData.get('company'),
      contact: formData.get('contact') ?? '',
      kind: formData.get('kind'),
      body: formData.get('body'),
      due: formData.get('due') ?? '',
    })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const d = parsed.data
  const r = await rpc('admin_crm_activity', { p_company: d.company, p_contact: d.contact || null, p_kind: d.kind, p_body: d.body, p_due: d.due || null })
  if (r.ok) {
    revalidatePath(`/admin/crm/prospects/${d.company}`)
    revalidatePath('/admin/crm')
  }
  return r.ok ? { ok: true } : r
}

export async function toggleTask(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = z.string().uuid().safeParse(formData.get('id'))
  const company = z.string().uuid().safeParse(formData.get('company'))
  if (!id.success || !company.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_crm_task_done', { p_id: id.data })
  if (r.ok) {
    revalidatePath(`/admin/crm/prospects/${company.data}`)
    revalidatePath('/admin/crm')
  }
  return r.ok ? { ok: true } : r
}

export type RegistryResult =
  | { ok: true; hits: (RegistryHit & { known: boolean })[]; total: number; page: number; pages: number }
  | { ok: false; problem: string }

/** A page of the register, with the companies already in the CRM marked. */
export async function findInRegistry(input: unknown): Promise<RegistryResult> {
  const parsed = SearchInput.safeParse(input)
  if (!parsed.success) return { ok: false, problem: 'invalid_filter' }
  const found = await searchRegistry(parsed.data)
  if (!found.ok) return { ok: false, problem: 'unreachable' }
  const r = await rpc('admin_crm_known_orgnrs', { p_orgnrs: found.hits.map((h) => h.org_number) })
  if (!r.ok) return { ok: false, problem: r.problem }
  const known = new Set(z.array(z.string()).catch([]).parse(r.data?.known))
  return { ok: true, hits: found.hits.map((h) => ({ ...h, known: known.has(h.org_number) })), total: found.total, page: found.page, pages: found.pages }
}

export type CompanyImport = { ok: true; added: number; known: number; business: number } | { ok: false; problem: string }

export async function importCompanies(rows: unknown): Promise<CompanyImport> {
  const Row = z.object({
    org_number: z.string().regex(/^\d{9}$/),
    name: z.string().min(1).max(200),
    form_code: z.string().max(10).nullable(),
    nace_code: z.string().max(10).nullable(),
    nace_label: z.string().max(200).nullable(),
    employees: z.number().int().nullable(),
    municipality: z.string().max(80).nullable(),
    municipality_no: z.string().max(4).nullable(),
    website: z.string().max(300).nullable(),
    email: z.string().max(254).nullable(),
    phone: z.string().max(40).nullable(),
  })
  const parsed = z.array(Row).min(1).max(200).safeParse(rows)
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_crm_company_import', { p_rows: parsed.data, p_source: 'brreg' })
  if (!r.ok) return { ok: false, problem: r.problem }
  const out = z.object({ added: z.coerce.number(), known: z.coerce.number(), business: z.coerce.number() }).safeParse(r.data)
  if (!out.success) return { ok: false, problem: 'failed' }
  revalidatePath('/admin/crm/prospects')
  return { ok: true, ...out.data }
}

// ---------------------------------------------------------------- lists (0056, D-103)
export async function saveList(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = formData.get('id') ? z.string().uuid().safeParse(formData.get('id')) : null
  if (id && !id.success) return { ok: false, problem: 'invalid' }
  const parsed = z
    .object({
      key: z.string().max(40),
      name_no: z.string().trim().min(1).max(80),
      name_en: z.string().trim().min(1).max(80),
      description_no: z.string().max(300),
      description_en: z.string().max(300),
      public: z.boolean(),
      archived: z.boolean(),
    })
    .safeParse({
      key: formData.get('key') ?? '',
      name_no: formData.get('name_no'),
      name_en: formData.get('name_en'),
      description_no: formData.get('description_no') ?? '',
      description_en: formData.get('description_en') ?? '',
      public: formData.get('public') === 'on',
      archived: formData.get('archived') === 'on',
    })
  if (!parsed.success) return { ok: false, problem: 'invalid_name' }
  const r = await rpc('admin_crm_list_save', { p_id: id ? id.data : null, p: parsed.data })
  if (!r.ok) return r
  revalidatePath('/admin/crm/lists')
  redirect('/admin/crm/lists' as Route)
}

export async function addToList(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ list: z.string().uuid(), contact: z.string().uuid(), source: z.string().trim().min(3).max(200) })
    .safeParse({ list: formData.get('list'), contact: formData.get('contact'), source: formData.get('source') })
  if (!parsed.success) return { ok: false, problem: 'consent_required' }
  const r = await rpc('admin_crm_list_add', { p_list: parsed.data.list, p_contacts: [parsed.data.contact], p_source: parsed.data.source })
  if (!r.ok) return r
  if (Number(r.data?.added ?? 0) === 0) return { ok: false, problem: 'not_consented' }
  revalidatePath(`/admin/crm/contacts/${parsed.data.contact}`)
  return { ok: true }
}

export async function removeFromList(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ list: z.string().uuid(), contact: z.string().uuid(), reason: z.string().trim().min(5).max(500) })
    .safeParse({ list: formData.get('list'), contact: formData.get('contact'), reason: formData.get('reason') })
  if (!parsed.success) return { ok: false, problem: 'reason_required' }
  const r = await rpc('admin_crm_list_remove', { p_list: parsed.data.list, p_contact: parsed.data.contact, p_reason: parsed.data.reason })
  if (r.ok) revalidatePath(`/admin/crm/contacts/${parsed.data.contact}`)
  return r.ok ? { ok: true } : r
}
