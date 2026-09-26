'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * The platform admin's writes and its sign-in (D-90). Signing in is two steps: a password,
 * then a TOTP code, enrolled on first sign-in. The role only counts once the session has
 * passed the second step (aal2); the database checks that on every call, so these actions
 * shape requests and never decide who may do what.
 */
export type AdminResult = { ok: true; message?: string } | { ok: false; problem: string }

const IDLE_COOKIE = 'op_admin_seen'

export async function adminSignIn(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ email: z.string().trim().email(), password: z.string().min(8) })
    .safeParse({ email: formData.get('email'), password: formData.get('password') })
  // one answer for every failure: this form must not say which accounts exist
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { ok: false, problem: 'invalid' }
  const { data } = await supabase.rpc('admin_whoami')
  const who = z.object({ is_admin: z.boolean() }).safeParse(data)
  if (!who.success || !who.data.is_admin) {
    await supabase.auth.signOut()
    return { ok: false, problem: 'invalid' }
  }
  ;(await cookies()).set(IDLE_COOKIE, String(Date.now()), { httpOnly: true, sameSite: 'strict', secure: true, path: '/' })
  redirect('/admin/mfa')
}

export async function adminSignOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  ;(await cookies()).delete(IDLE_COOKIE)
  redirect('/admin/login')
}

export type Enrolment = { ok: true; factorId: string; qr: string; secret: string } | { ok: false; problem: string }

/** A new TOTP factor, after clearing any enrolment that was started and never verified. */
export async function mfaEnroll(): Promise<Enrolment> {
  const supabase = await createClient()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  if (factors?.totp.some((f) => f.status === 'verified')) return { ok: false, problem: 'already_enrolled' }
  for (const f of factors?.all ?? []) {
    if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Orgpuls admin ${Date.now()}` })
  if (error || !data) return { ok: false, problem: 'failed' }
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

export async function mfaVerify(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ factorId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) })
    .safeParse({ factorId: formData.get('factorId'), code: String(formData.get('code') ?? '').replace(/\s/g, '') })
  if (!parsed.success) return { ok: false, problem: 'invalid_code' }
  const supabase = await createClient()
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code })
  if (error) return { ok: false, problem: 'invalid_code' }
  await supabase.rpc('admin_record_login')
  ;(await cookies()).set(IDLE_COOKIE, String(Date.now()), { httpOnly: true, sameSite: 'strict', secure: true, path: '/' })
  redirect('/admin')
}

const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()

/** The first field a submission failed on, so the refusal names the right one. */
const failedField = (e: z.ZodError) => String(e.issues[0]?.path[0] ?? '')

async function rpc(fn: string, args: Record<string, unknown>): Promise<AdminResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  return { ok: true }
}

export async function extendTrialAsAdmin(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ org: z.string().uuid(), days: z.coerce.number().int().min(1).max(60), reason: z.string().trim().min(5).max(500) })
    .safeParse({ org: formData.get('org'), days: formData.get('days'), reason: formData.get('reason') })
  if (!parsed.success) return { ok: false, problem: failedField(parsed.error) === 'reason' ? 'reason_required' : 'invalid_days' }
  const r = await rpc('admin_extend_trial', { p_org: parsed.data.org, p_days: parsed.data.days, p_reason: parsed.data.reason })
  if (r.ok) revalidatePath(`/admin/orgs/${parsed.data.org}`)
  return r
}

export async function addNote(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ org: z.string().uuid(), body: z.string().trim().min(1).max(4000) })
    .safeParse({ org: formData.get('org'), body: formData.get('body') })
  if (!parsed.success) return { ok: false, problem: 'invalid_note' }
  const r = await rpc('admin_note_add', { p_org: parsed.data.org, p_body: parsed.data.body })
  if (r.ok) revalidatePath(`/admin/orgs/${parsed.data.org}`)
  return r
}

export async function setAdmin(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({
      email: z.string().trim().email(),
      role: z.enum(['super_admin', 'support', 'finance', 'analyst', 'marketing']),
      active: z.boolean(),
      reason: z.string().trim().min(5).max(500),
    })
    .safeParse({
      email: formData.get('email'),
      role: formData.get('role'),
      active: formData.get('active') !== 'off',
      reason: formData.get('reason'),
    })
  if (!parsed.success) return { ok: false, problem: failedField(parsed.error) === 'reason' ? 'reason_required' : 'invalid' }
  const r = await rpc('admin_set_admin', {
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_active: parsed.data.active,
    p_reason: parsed.data.reason,
  })
  if (r.ok) revalidatePath('/admin/admins')
  return r
}

// ---------------------------------------------------------------- tickets (0051, D-92)
export async function replyTicket(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      body: z.string().trim().min(1).max(10000),
      internal: z.boolean(),
      status: z.enum(['', 'open', 'waiting_customer', 'waiting_us', 'resolved', 'closed']),
    })
    .safeParse({
      id: formData.get('id'),
      body: formData.get('body'),
      internal: formData.get('internal') === 'on',
      status: formData.get('status') ?? '',
    })
  if (!parsed.success) return { ok: false, problem: 'invalid_reply' }
  const r = await rpc('admin_ticket_reply', {
    p_id: parsed.data.id,
    p_body: parsed.data.body,
    p_internal: parsed.data.internal,
    p_status: parsed.data.status || null,
  })
  if (r.ok) revalidatePath(`/admin/tickets/${parsed.data.id}`)
  return r
}

const FIELDS = ['status', 'type', 'impact', 'blocking', 'queue', 'category', 'assignee', 'problem'] as const

export async function updateTicket(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) return { ok: false, problem: 'invalid' }
  const changes: Record<string, string | boolean> = {}
  for (const f of FIELDS) {
    const v = formData.get(f)
    if (typeof v !== 'string') continue
    if (!/^[a-z_0-9-]{0,40}$/.test(v)) return { ok: false, problem: 'invalid' }
    changes[f] = f === 'blocking' ? v === 'yes' : v
  }
  const r = await rpc('admin_ticket_update', { p_id: id.data, p_changes: changes })
  if (r.ok) revalidatePath(`/admin/tickets/${id.data}`)
  return r
}

export async function linkRound(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ id: z.string().uuid(), round: z.string().uuid(), linked: z.enum(['yes', 'no']) })
    .safeParse({ id: formData.get('id'), round: formData.get('round'), linked: formData.get('linked') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_ticket_link_round', {
    p_id: parsed.data.id,
    p_round: parsed.data.round,
    p_linked: parsed.data.linked === 'yes',
  })
  if (r.ok) revalidatePath(`/admin/tickets/${parsed.data.id}`)
  return r
}

// ---------------------------------------------------------------- marketing spend (0062, D-107)
export async function addSpend(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      channel: z.enum(['paid', 'social', 'email', 'organic', 'referral', 'campaign', 'ai', 'direct', 'other']),
      campaign: z.string().trim().max(80),
      amount: z.coerce.number().int().min(0).max(100_000_000),
      note: z.string().trim().max(200),
    })
    .safeParse({
      month: formData.get('month'),
      channel: formData.get('channel'),
      campaign: formData.get('campaign') ?? '',
      amount: formData.get('amount'),
      note: formData.get('note') ?? '',
    })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_spend_add', {
    p_month: `${parsed.data.month}-01`,
    p_channel: parsed.data.channel,
    p_campaign: parsed.data.campaign || null,
    p_amount: parsed.data.amount,
    p_note: parsed.data.note || null,
  })
  if (r.ok) revalidatePath('/admin/acquisition')
  return r
}

export async function deleteSpend(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_spend_delete', { p_id: parsed.data.id })
  if (r.ok) revalidatePath('/admin/acquisition')
  return r
}
