'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'
import { ADMIN_SUPPRESSION_REASONS, PARTNER_KINDS, PARTNER_STATUSES, SHARE_KINDS } from './growthCrm'

/**
 * The writes of the CRM's revision-3 pages (phase G3, 0143, D-184). The database checks the role and
 * the second factor and logs each one; these shape the request and name the refusal. An address a
 * suppression is added for goes to the database once, is hashed there, and is never logged.
 */
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()

async function rpc(fn: string, args: Record<string, unknown>): Promise<AdminResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  return reply.data.ok ? { ok: true } : { ok: false, problem: reply.data.error ?? 'failed' }
}

const orgNumber = z
  .string()
  .transform((v) => v.replace(/\s/g, ''))
  .pipe(z.string().regex(/^[0-9]{9}$/))

// ---------------------------------------------------------------- consent
export async function addSuppression(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email().max(254), reason: z.enum(ADMIN_SUPPRESSION_REASONS) })
    .safeParse({ email: formData.get('email'), reason: formData.get('reason') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_crm_suppress', { p_email: parsed.data.email, p_reason: parsed.data.reason })
  if (r.ok) revalidatePath('/admin/crm/consent')
  return r
}

export async function recordPhoneNotice(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ org: orgNumber, outcome: z.enum(['notice', 'objected']) })
    .safeParse({ org: String(formData.get('org') ?? ''), outcome: formData.get('outcome') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_consent_phone_notice', { p_org_number: parsed.data.org, p_objected: parsed.data.outcome === 'objected' })
  if (r.ok) {
    revalidatePath('/admin/crm/consent')
    revalidatePath('/admin/crm/triggers')
  }
  return r
}

// ---------------------------------------------------------------- Brønnøysund triggers
export async function setDryRun(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ on: z.enum(['true', 'false']), reason: z.string().trim().max(300) })
    .safeParse({ on: formData.get('on'), reason: String(formData.get('reason') ?? '') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_brreg_set_dry_run', { p_on: parsed.data.on === 'true', p_reason: parsed.data.reason || null })
  if (r.ok) {
    revalidatePath('/admin/crm/triggers')
    revalidatePath('/admin/crm/tasks')
  }
  return r
}

export async function runPollNow(_prev: AdminResult | null): Promise<AdminResult> {
  const r = await rpc('admin_brreg_poll_now', {})
  if (r.ok) revalidatePath('/admin/crm/triggers')
  return r
}

// ---------------------------------------------------------------- partners
export async function savePartner(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const blank = (v: FormDataEntryValue | null) => {
    const s = String(v ?? '').trim()
    return s === '' ? null : s
  }
  const parsed = z
    .object({
      id: z.string().uuid().nullable(),
      name: z.string().min(2).max(200),
      org: orgNumber.nullable(),
      kind: z.enum(PARTNER_KINDS),
      contact: z.string().min(2).max(120).nullable(),
      code: z
        .string()
        .transform((v) => v.toUpperCase())
        .pipe(z.string().regex(/^[A-Z0-9]{2,20}$/))
        .nullable(),
      shareKind: z.enum(SHARE_KINDS).nullable(),
      sharePct: z.coerce.number().int().min(1).max(50).nullable(),
      status: z.enum(PARTNER_STATUSES),
    })
    .refine((p) => p.sharePct === null || (p.shareKind !== null && p.shareKind !== 'member_discount'))
    .safeParse({
      id: blank(formData.get('id')),
      name: blank(formData.get('name')),
      org: blank(formData.get('org')),
      kind: formData.get('kind'),
      contact: blank(formData.get('contact')),
      code: blank(formData.get('code')),
      shareKind: blank(formData.get('share_kind')),
      sharePct: blank(formData.get('share_pct')),
      status: formData.get('status'),
    })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const p = parsed.data
  const r = await rpc('admin_crm_partner_save', {
    p_id: p.id,
    p_name: p.name,
    p_org_number: p.org,
    p_kind: p.kind,
    p_contact: p.contact,
    p_code: p.code,
    p_share_kind: p.shareKind,
    p_share_pct: p.sharePct,
    p_status: p.status,
  })
  if (r.ok) revalidatePath('/admin/crm/partners')
  return r
}
