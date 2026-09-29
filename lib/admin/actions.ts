'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { legalInputs } from '@/lib/legal/inputs'
import { legalUnits } from '@/lib/legal/registry'
import { legalDocuments } from '@/lib/legal/documents'
import { MODULE_KEYS, moduleFile } from '@/content/industries/modules'
import { bodyHash, canonicalJson } from '@/lib/modules/schema'
import respondentUi from '@/lib/i18n/respondent-ui.json'
import { respondentHash } from '@/lib/i18n/respondent-strings'
import en from '@/messages/en.json'
import { TRANSLATION_LOCALES } from '@/lib/i18n/locales'
import { createHash } from 'node:crypto'
import { checkImport, FileError, ORIGINS, parseFile, type Origin } from '@/lib/i18n/translation-package'
import { currentRows, isScope, PLATFORM_CATALOGUE, platformView, REGISTRY_LANGUAGES, SCOPE_SECTIONS, surveyTexts, type RegistryLanguage } from '@/lib/admin/translations'
import { sectionOf } from '@/lib/i18n/translation-package'
import { checkPlatformImport, type PlatformRow } from '@/lib/i18n/platform-package'
import { readSiteSheet } from '@/lib/i18n/site-sheet'
import { readXlsx, SheetError } from '@/lib/xlsx'
import { OVERRIDES_TAG } from '@/lib/i18n/overrides'
import { autoRecord } from '@/lib/admin/auto'
import { isError, translationState } from '@/lib/admin/api'

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

/** The account owner (0118): an active platform admin, or nobody. */
export async function setAccountOwner(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ org: z.string().uuid(), owner: z.union([z.string().uuid(), z.literal('')]) })
    .safeParse({ org: formData.get('org'), owner: formData.get('owner') ?? '' })
  if (!parsed.success) return { ok: false, problem: 'failed' }
  const r = await rpc('admin_set_account_owner', { p_org: parsed.data.org, p_owner: parsed.data.owner || null })
  if (r.ok) {
    revalidatePath(`/admin/orgs/${parsed.data.org}`)
    revalidatePath('/admin/orgs')
  }
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

// ---------------------------------------------------------------- cancellation and deletion (0064, D-108)
export async function cancelOrg(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ org: z.string().uuid(), ends: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().min(5).max(500) })
    .safeParse({ org: formData.get('org'), ends: formData.get('ends'), reason: formData.get('reason') })
  if (!parsed.success) return { ok: false, problem: failedField(parsed.error) === 'reason' ? 'reason_required' : 'invalid_date' }
  const r = await rpc('admin_cancel_org', { p_org: parsed.data.org, p_ends: parsed.data.ends, p_reason: parsed.data.reason })
  if (r.ok) revalidatePath(`/admin/orgs/${parsed.data.org}`)
  return r
}

export async function withdrawCancellation(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ org: z.string().uuid(), reason: z.string().trim().min(5).max(500) })
    .safeParse({ org: formData.get('org'), reason: formData.get('reason') })
  if (!parsed.success) return { ok: false, problem: 'reason_required' }
  const r = await rpc('admin_cancel_withdraw', { p_org: parsed.data.org, p_reason: parsed.data.reason })
  if (r.ok) revalidatePath(`/admin/orgs/${parsed.data.org}`)
  return r
}

/** Deletes a cancelled organisation now, for an erasure request; the database checks the typed number. */
export async function deleteOrgNow(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ org: z.string().uuid(), confirm: z.string().trim().min(1).max(200), reason: z.string().trim().min(5).max(500) })
    .safeParse({ org: formData.get('org'), confirm: formData.get('confirm'), reason: formData.get('reason') })
  if (!parsed.success) return { ok: false, problem: failedField(parsed.error) === 'reason' ? 'reason_required' : 'confirm_mismatch' }
  const r = await rpc('admin_delete_now', { p_org: parsed.data.org, p_confirm: parsed.data.confirm, p_reason: parsed.data.reason })
  if (r.ok) redirect('/admin/ops#deletions')
  return r
}

// ---------------------------------------------------------------- industry modules (0067, 0068, D-117)
const ModuleRef = { key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), version: z.string().regex(/^\d+\.\d+\.\d+$/) }

const Synced = z.object({
  ok: z.literal(true),
  result: z.enum(['unchanged', 'new', 'draft', 'published']),
  version: z.string(),
  rounds_moved: z.coerce.number().optional(),
  translations_carried: z.coerce.number().optional(),
})

/**
 * «Make live» (X-096, 0122): the module file as this build has it becomes what the database asks —
 * the next version if the module is live (published at once, planned rounds moved, unchanged
 * translations carried, the old version retired), or its draft replaced. Super-admin, audited.
 */
export async function moduleSync(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const key = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).safeParse(formData.get('key'))
  if (!key.success || !MODULE_KEYS.includes(key.data)) return { ok: false, problem: 'invalid' }
  const m = moduleFile(key.data)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_module_sync', { p: JSON.parse(canonicalJson(m)), p_body: bodyHash(m) })
  if (error) return { ok: false, problem: 'failed' }
  const refused = Reply.safeParse(data)
  if (refused.success && !refused.data.ok) return { ok: false, problem: refused.data.error ?? 'failed' }
  const r = Synced.safeParse(data)
  if (!r.success) return { ok: false, problem: 'failed' }
  revalidatePath('/admin/modules')
  return { ok: true, message: JSON.stringify({ result: r.data.result, version: r.data.version, rounds: r.data.rounds_moved ?? 0, translations: r.data.translations_carried ?? 0 }) }
}

/**
 * Put a module in front of every organisation, or take it away (X-096): publishes its draft, or
 * retires the live version. The audit log says who and when; no reason is asked.
 */
export async function moduleSwitch(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ ...ModuleRef, on: z.enum(['on', 'off']) })
    .safeParse({ key: formData.get('key'), version: formData.get('version'), on: formData.get('on') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const on = parsed.data.on === 'on'
  const r = await rpc('admin_module_set_status', {
    p_key: parsed.data.key,
    p_version: parsed.data.version,
    p_status: on ? 'published' : 'retired',
    p_reason: on ? 'Published in Sentral' : 'Turned off in Sentral',
  })
  if (r.ok) revalidatePath('/admin/modules')
  return r
}

/**
 * «Validert» with a link to the validation report, or back to «Foreløpig» (0092): super-admin, with a
 * reason; the database logs and audits it.
 */
export async function moduleSetValidation(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({
      ...ModuleRef,
      status: z.enum(['provisional', 'validated']),
      report: z.string().trim().max(500).optional(),
      reason: z.string().trim().max(500).optional(),
    })
    .safeParse({
      key: formData.get('key'),
      version: formData.get('version'),
      status: formData.get('status'),
      report: formData.get('report') ?? undefined,
      reason: formData.get('reason') ?? undefined,
    })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const report = parsed.data.report ? parsed.data.report : null
  if (parsed.data.status === 'validated' && !(report && /^https:\/\/\S+$/.test(report))) return { ok: false, problem: 'report_required' }
  const r = await rpc('admin_module_set_validation', {
    p_key: parsed.data.key,
    p_version: parsed.data.version,
    p_status: parsed.data.status,
    p_report_url: parsed.data.status === 'validated' ? report : null,
    p_reason: parsed.data.reason || 'Set in Sentral',
  })
  if (r.ok) revalidatePath('/admin/modules')
  return r
}

/** Let an organisation try a draft (0068), or stop: super-admin, with a reason, audited. */
export async function modulePilot(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ ...ModuleRef, org: z.string().uuid(), on: z.enum(['on', 'off']) })
    .safeParse({ key: formData.get('key'), version: formData.get('version'), org: formData.get('org'), on: formData.get('on') })
  if (!parsed.success) return { ok: false, problem: failedField(parsed.error) === 'org' ? 'not_found' : 'invalid' }
  const r = await rpc('admin_module_pilot', {
    p_key: parsed.data.key, p_version: parsed.data.version, p_org: parsed.data.org, p_on: parsed.data.on === 'on', p_reason: 'Set in Sentral',
  })
  if (r.ok) revalidatePath('/admin/modules')
  return r
}

/**
 * Offer a survey language to one organisation before everyone (0085), or stop: super-admin, with
 * a reason, audited. The language is still offered only where its translations are approved.
 */
export async function localePilot(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({
      locale: z.enum(TRANSLATION_LOCALES),
      org: z.string().uuid(),
      on: z.enum(['on', 'off']),
      reason: z.string().trim().min(5).max(500),
    })
    .safeParse({ locale: formData.get('locale'), org: formData.get('org'), on: formData.get('on'), reason: formData.get('reason') })
  if (!parsed.success) return { ok: false, problem: failedField(parsed.error) === 'reason' ? 'reason_required' : failedField(parsed.error) === 'org' ? 'not_found' : 'invalid' }
  const r = await rpc('admin_locale_pilot', {
    p_locale: parsed.data.locale, p_org: parsed.data.org, p_on: parsed.data.on === 'on', p_reason: parsed.data.reason,
  })
  if (r.ok) revalidatePath('/admin/legal')
  return r
}

/**
 * «Mark reviewed» on one legal document (X-096, 0122): the document as the registry has it now,
 * stored with its text so a later change can be shown line by line. Refused when the page showed
 * another version of the text (stale) or the document is broken.
 */
export async function legalReview(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ key: z.string().min(3).max(200), hash: z.string().regex(/^[0-9a-f]{64}$/) })
    .safeParse({ key: formData.get('key'), hash: formData.get('hash') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const doc = legalDocuments(legalUnits(await legalInputs())).find((d) => d.key === parsed.data.key)
  if (!doc || doc.missing.length) return { ok: false, problem: 'not_found' }
  if (doc.hash !== parsed.data.hash) return { ok: false, problem: 'stale' }
  const r = await rpc('admin_legal_review', { p_key: doc.key, p_hash: doc.hash, p_text: doc.text })
  if (r.ok) revalidatePath('/admin/legal')
  return r
}

/**
 * A survey language's translation file, checked and then imported (D-133). The first press checks
 * the file against the source (lib/i18n/translation-package.ts) and shows what would be written;
 * the second writes it, but only if the file still checks to the very same rows (the digest), so
 * what is imported is what was shown. An import never approves. Super-admin, audited.
 */
export type ImportResult =
  | { ok: false; problem: string; detail?: string }
  | {
      ok: true
      applied: boolean
      locale: string
      format: string
      rows: number
      untranslated: number
      unchanged: number
      /** entries that belong to the other tab, left out (0101) */
      outside?: number
      problems: { key: string; level: 'error' | 'warning'; code: string; detail?: string }[]
      digest: string
      written?: { new: number; changed: number; same: number; removed?: number; refused: { key: string; error: string }[] }
    }

const FILE_MAX = 3_000_000

export async function translationsImport(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const parsed = z
    .object({
      locale: z.enum(REGISTRY_LANGUAGES as unknown as [RegistryLanguage, ...RegistryLanguage[]]),
      scope: z.enum(['questionnaire', 'pages']),
      origin: z.enum(ORIGINS as unknown as [Origin, ...Origin[]]),
      intent: z.enum(['check', 'apply']),
      digest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    })
    .safeParse({
      locale: formData.get('locale'),
      scope: formData.get('scope') || 'questionnaire',
      origin: formData.get('origin'),
      intent: formData.get('intent'),
      digest: formData.get('digest') || undefined,
    })
  const file = formData.get('file')
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, problem: 'no_file' }
  if (file.size > FILE_MAX) return { ok: false, problem: 'too_large' }

  let content
  try {
    content = parseFile(await file.text())
  } catch (err) {
    return { ok: false, problem: 'bad_file', detail: err instanceof FileError ? err.message : 'unreadable' }
  }
  if (content.locale !== parsed.data.locale) return { ok: false, problem: 'wrong_language', detail: content.locale }

  const [catalogue, state] = await Promise.all([surveyTexts(), translationState(parsed.data.locale)])
  if (isError(state)) return { ok: false, problem: state.error === 'not_allowed' ? 'not_allowed' : 'failed' }
  if (!catalogue) return { ok: false, problem: 'failed' }
  // this tab's texts only (0101): English's pages are messages/, a survey language's questions the other tab
  const sections = parsed.data.locale === 'en' ? SCOPE_SECTIONS.questionnaire : SCOPE_SECTIONS[parsed.data.scope]
  const inTab = content.entries.filter((e) => {
    const s = sectionOf(e.key)
    return s === null || sections.includes(s)
  })
  const outside = content.entries.length - inTab.length
  const checked = checkImport({ ...content, entries: inTab }, catalogue, currentRows(state), parsed.data.origin)
  const digest = createHash('sha256').update(JSON.stringify(checked.rows)).digest('hex')
  const summary = {
    ok: true as const,
    applied: false,
    locale: parsed.data.locale,
    format: content.format,
    rows: checked.rows.length,
    untranslated: checked.untranslated,
    unchanged: checked.unchanged,
    outside,
    problems: checked.problems.slice(0, 200),
    digest,
  }
  if (parsed.data.intent === 'check') return summary
  if (parsed.data.digest !== digest) return { ok: false, problem: 'stale' }
  if (!checked.rows.length) return { ...summary, applied: true, written: { new: 0, changed: 0, same: 0, refused: [] } }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_translations_import', {
    p_locale: parsed.data.locale,
    p_rows: checked.rows.map((r) => ({ key: r.key, text: r.text, source: r.source, status: r.status, notes: r.notes, source_hash: r.source_hash })),
  })
  if (error) return { ok: false, problem: 'failed' }
  const reply = z
    .object({
      ok: z.boolean(),
      error: z.string().optional(),
      new: z.coerce.number().optional(),
      changed: z.coerce.number().optional(),
      same: z.coerce.number().optional(),
      refused: z.array(z.object({ key: z.string(), error: z.string() })).optional(),
    })
    .safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  revalidatePath('/admin/translations')
  return {
    ...summary,
    applied: true,
    written: { new: reply.data.new ?? 0, changed: reply.data.changed ?? 0, same: reply.data.same ?? 0, refused: reply.data.refused ?? [] },
  }
}

/**
 * Approve a survey language's translations that may be approved (0086: an official version at any
 * step, the rest once pretested), exactly those the page showed (the digest). Super-admin, audited.
 */
export async function translationsApproveLanguage(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({
      locale: z.enum(REGISTRY_LANGUAGES as unknown as [RegistryLanguage, ...RegistryLanguage[]]),
      read: z.literal('on'),
      digest: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .safeParse({ locale: formData.get('locale'), read: formData.get('read'), digest: formData.get('digest') })
  if (!parsed.success) return { ok: false, problem: failedField(parsed.error) === 'read' ? 'confirm_required' : 'invalid' }
  const r = await rpc('admin_translations_approve', { p_locale: parsed.data.locale, p_ui_hash: null, p_digest: parsed.data.digest })
  if (r.ok) revalidatePath('/admin/translations')
  return r
}

/**
 * Approve a language's survey (0082): every unapproved item translation and the respondent
 * pages' strings as this build has them (lib/i18n/respondent-ui.json). Super-admin, audited.
 */
export async function translationsApprove(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({ locale: z.enum(['en']), read: z.literal('on'), digest: z.string().regex(/^[0-9a-f]{64}$/) })
    .safeParse({ locale: formData.get('locale'), read: formData.get('read'), digest: formData.get('digest') })
  if (!parsed.success) return { ok: false, problem: failedField(parsed.error) === 'read' ? 'confirm_required' : 'invalid' }
  // the page strings the page showed are the ones this build hashes (lib/i18n/respondent-strings)
  const hash = (respondentUi as Record<string, string>)[parsed.data.locale]
  if (!hash || respondentHash(en as Record<string, unknown>) !== hash) return { ok: false, problem: 'invalid' }
  // the database refuses when the items are no longer what the page showed (the digest)
  const r = await rpc('admin_translations_approve', { p_locale: parsed.data.locale, p_ui_hash: hash, p_digest: parsed.data.digest })
  if (r.ok) revalidatePath('/admin/legal')
  return r
}

/**
 * A bokmål or English page package, checked and then imported (0101, D-152), the same two presses
 * as a survey language's: the check shows what would be written, the import writes exactly that
 * (the digest). Each row becomes an override of one string in messages/; a text equal to the file's
 * own removes the override. Nothing is approved unless the auto-approve switch is on.
 */
export async function messagesImport(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const parsed = z
    .object({
      locale: z.enum(['no', 'en']),
      origin: z.enum(ORIGINS as unknown as [Origin, ...Origin[]]),
      intent: z.enum(['check', 'apply']),
      digest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    })
    .safeParse({
      locale: formData.get('locale'),
      origin: formData.get('origin'),
      intent: formData.get('intent'),
      digest: formData.get('digest') || undefined,
    })
  const file = formData.get('file')
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, problem: 'no_file' }
  if (file.size > FILE_MAX * 3) return { ok: false, problem: 'too_large' }
  let content
  try {
    content = parseFile(await file.text())
  } catch (err) {
    return { ok: false, problem: 'bad_file', detail: err instanceof FileError ? err.message : 'unreadable' }
  }
  const fileLocale = content.locale === 'nb' ? 'no' : content.locale
  if (fileLocale !== parsed.data.locale) return { ok: false, problem: 'wrong_language', detail: content.locale }

  const view = await platformView(parsed.data.locale)
  if (view === 'not_allowed' || view === 'failed') return { ok: false, problem: view }
  const checked = checkPlatformImport(content, parsed.data.locale, PLATFORM_CATALOGUE, view.own, view.bokmal, parsed.data.origin)
  const digest = createHash('sha256').update(JSON.stringify(checked.rows)).digest('hex')
  const summary = {
    ok: true as const,
    applied: false,
    locale: parsed.data.locale,
    format: content.format,
    rows: checked.rows.length,
    untranslated: checked.untranslated,
    unchanged: checked.unchanged,
    outside: checked.outside,
    problems: checked.problems.slice(0, 200),
    digest,
  }
  if (parsed.data.intent === 'check') return summary
  if (parsed.data.digest !== digest) return { ok: false, problem: 'stale' }
  if (!checked.rows.length) return { ...summary, applied: true, written: { new: 0, changed: 0, same: 0, removed: 0, refused: [] } }

  const written = await writeOverrides(parsed.data.locale, checked.rows)
  if ('problem' in written) return { ok: false, problem: written.problem }
  revalidateTag(OVERRIDES_TAG)
  revalidatePath('/admin/translations')
  return { ...summary, applied: true, written }
}

type Written = { new: number; changed: number; same: number; removed: number; refused: { key: string; error: string }[] }
const OverridesReply = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  new: z.coerce.number().optional(),
  changed: z.coerce.number().optional(),
  removed: z.coerce.number().optional(),
  same: z.coerce.number().optional(),
  refused: z.array(z.object({ key: z.string(), error: z.string() })).optional(),
})

/** Checked rows into app.message_overrides (0101): what the database wrote, or why it did not */
async function writeOverrides(locale: 'no' | 'en', rows: PlatformRow[]): Promise<Written | { problem: string }> {
  if (!rows.length) return { new: 0, changed: 0, same: 0, removed: 0, refused: [] }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_message_overrides_import', { p_locale: locale, p_rows: rows })
  if (error) return { problem: 'failed' }
  const reply = OverridesReply.safeParse(data)
  if (!reply.success) return { problem: 'failed' }
  if (!reply.data.ok) return { problem: reply.data.error ?? 'failed' }
  return {
    new: reply.data.new ?? 0,
    changed: reply.data.changed ?? 0,
    same: reply.data.same ?? 0,
    removed: reply.data.removed ?? 0,
    refused: reply.data.refused ?? [],
  }
}

/**
 * One text of the site, edited in place on its page in admin › Translations (X-090): bokmål and
 * English, each checked as an import of that one key would be (placeholders, tags, plurals), then
 * written as an override that waits for approval, or is approved at once while auto-approve is on.
 */
export type EditResult = { ok: true } | { ok: false; problem: string; detail?: string }
export async function messageEdit(_prev: EditResult | null, formData: FormData): Promise<EditResult> {
  const parsed = z
    .object({ key: z.string().min(1).max(300), no: z.string().max(20_000), en: z.string().max(20_000) })
    .safeParse({ key: formData.get('key'), no: formData.get('no'), en: formData.get('en') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const view = await platformView('no')
  if (view === 'not_allowed' || view === 'failed') return { ok: false, problem: view }
  const key = `msg:${parsed.data.key}`
  const results = (['no', 'en'] as const).map((locale) =>
    checkPlatformImport(
      { format: 'json', locale, entries: [{ key, target: parsed.data[locale] }] },
      locale,
      PLATFORM_CATALOGUE,
      locale === 'no' ? view.bokmal : view.english,
      view.bokmal,
      'professional',
    ),
  )
  const error = results.flatMap((r) => r.problems).find((p) => p.level === 'error')
  if (error) return { ok: false, problem: `code.${error.code}`, detail: error.detail }
  if (!results.some((r) => r.rows.length)) return { ok: false, problem: 'unchanged' }
  for (const [i, locale] of (['no', 'en'] as const).entries()) {
    const written = await writeOverrides(locale, results[i]!.rows)
    if ('problem' in written) return { ok: false, problem: written.problem }
    if (written.refused.length) return { ok: false, problem: 'failed', detail: written.refused[0]!.error }
  }
  revalidateTag(OVERRIDES_TAG)
  revalidatePath('/admin/translations')
  return { ok: true }
}

/**
 * A page's bilingual spreadsheet back from a reviewer (X-090): a column of keys, a bokmål column
 * and an English one (lib/i18n/site-sheet.ts). Each language is checked as its own import would be,
 * and «Import» writes exactly what «Check file» showed, both languages, as overrides.
 */
export async function messagesSheetImport(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const parsed = z
    .object({
      origin: z.enum(ORIGINS as unknown as [Origin, ...Origin[]]),
      intent: z.enum(['check', 'apply']),
      digest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    })
    .safeParse({ origin: formData.get('origin'), intent: formData.get('intent'), digest: formData.get('digest') || undefined })
  const file = formData.get('file')
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, problem: 'no_file' }
  if (file.size > FILE_MAX) return { ok: false, problem: 'too_large' }
  let sheet
  try {
    sheet = readSiteSheet(readXlsx(new Uint8Array(await file.arrayBuffer())))
  } catch (err) {
    return { ok: false, problem: 'bad_file', detail: err instanceof SheetError ? err.message : 'unreadable' }
  }
  const view = await platformView('no')
  if (view === 'not_allowed' || view === 'failed') return { ok: false, problem: view }
  const checked = (['no', 'en'] as const).map((locale) => ({
    locale,
    ...checkPlatformImport(
      { format: 'xlsx', locale, entries: sheet[locale] },
      locale,
      PLATFORM_CATALOGUE,
      locale === 'no' ? view.bokmal : view.english,
      view.bokmal,
      parsed.data.origin,
    ),
  }))
  const digest = createHash('sha256').update(JSON.stringify(checked.map((c) => c.rows))).digest('hex')
  const summary = {
    ok: true as const,
    applied: false,
    locale: 'no+en',
    format: 'xlsx',
    rows: checked.reduce((n, c) => n + c.rows.length, 0),
    untranslated: checked.reduce((n, c) => n + c.untranslated, 0),
    unchanged: checked.reduce((n, c) => n + c.unchanged, 0),
    outside: 0,
    problems: checked.flatMap((c) => c.problems.map((p) => ({ ...p, key: `${p.key} · ${c.locale}` }))).slice(0, 200),
    digest,
  }
  if (parsed.data.intent === 'check') return summary
  if (parsed.data.digest !== digest) return { ok: false, problem: 'stale' }
  const written: Written = { new: 0, changed: 0, same: 0, removed: 0, refused: [] }
  for (const c of checked) {
    const w = await writeOverrides(c.locale, c.rows)
    if ('problem' in w) return { ok: false, problem: w.problem }
    written.new += w.new
    written.changed += w.changed
    written.same += w.same
    written.removed += w.removed
    written.refused.push(...w.refused)
  }
  revalidateTag(OVERRIDES_TAG)
  revalidatePath('/admin/translations')
  return { ...summary, applied: true, written }
}

/** Approve the waiting overrides the page listed, each by the hash of the text it showed (0101) */
export async function messagesApprove(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const items = z.array(z.object({ key: z.string().max(300), hash: z.string().regex(/^[0-9a-f]{64}$/) })).max(10000)
  let raw: unknown
  try {
    raw = JSON.parse(String(formData.get('items') ?? '[]'))
  } catch {
    return { ok: false, problem: 'invalid' }
  }
  const parsed = z
    .object({ locale: z.enum(['no', 'en']), read: z.literal('on'), items })
    .safeParse({ locale: formData.get('locale'), read: formData.get('read'), items: raw })
  if (!parsed.success) return { ok: false, problem: failedField(parsed.error) === 'read' ? 'confirm_required' : 'invalid' }
  const r = await rpc('admin_message_overrides_approve', { p_locale: parsed.data.locale, p_items: parsed.data.items })
  if (r.ok) {
    revalidateTag(OVERRIDES_TAG)
    revalidatePath('/admin/translations')
  }
  return r
}

/**
 * The auto-approve switch (0101, D-152): on, every translation, override, legal text and page
 * string is approved as it arrives, and everything waiting now, each marked automatic; off, a
 * person approves again. Super-admin, audited.
 */
export async function setAutoApprove(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z.object({ on: z.enum(['on', 'off']) }).safeParse({ on: formData.get('on') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const r = await rpc('admin_auto_approve_set', { p_on: parsed.data.on === 'on' })
  if (!r.ok) return r
  if (parsed.data.on === 'on') await autoRecord()
  revalidateTag(OVERRIDES_TAG)
  revalidatePath('/admin', 'layout')
  return { ok: true }
}
