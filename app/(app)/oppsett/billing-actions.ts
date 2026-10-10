'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CANCEL_REASONS, INTERVALS, PLANS } from '@/lib/billing/read'
import { getCurrentOrgId } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'

/**
 * The trial and the payment details (D-89). The writes are `public.extend_trial` and
 * `public.save_billing`, which decide who may, how often, and what is valid; these only
 * shape what is sent and read back what happened.
 */
export type BillingResult = { ok: true; confirmed?: boolean } | { ok: false; problem: string }

const Reply = z.object({ ok: z.boolean(), error: z.string().optional() })

export async function extendTrial(_prev: BillingResult | null): Promise<BillingResult> {
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'not_allowed' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('extend_trial', { p_org: org })
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  revalidatePath('/oppsett')
  return { ok: true }
}

const Form = z.object({
  plan: z.enum(PLANS),
  interval: z.enum(INTERVALS),
  invoiceEmail: z.string().trim().min(3).max(254),
  invoiceRef: z.string().trim().max(60),
  ehf: z.boolean(),
  // the UK VAT number (0227): drawn, and so sent, only for an organisation in the United Kingdom
  vatNumber: z.string().trim().max(64).nullable(),
  intent: z.enum(['save', 'confirm']),
})

export async function saveBilling(_prev: BillingResult | null, formData: FormData): Promise<BillingResult> {
  const parsed = Form.safeParse({
    plan: formData.get('plan'),
    interval: formData.get('interval') ?? 'month',
    invoiceEmail: formData.get('invoiceEmail') ?? '',
    invoiceRef: formData.get('invoiceRef') ?? '',
    ehf: formData.get('ehf') === 'on',
    vatNumber: formData.has('vatNumber') ? String(formData.get('vatNumber') ?? '') : null,
    intent: formData.get('intent'),
  })
  if (!parsed.success) {
    const plan = PLANS.includes(formData.get('plan') as (typeof PLANS)[number])
    const vat = parsed.error.issues.some((i) => i.path[0] === 'vatNumber')
    return { ok: false, problem: !plan ? 'invalid_plan' : vat ? 'invalid_vat_number' : 'invalid_email' }
  }

  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'not_allowed' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_billing', {
    p_org: org,
    p_plan: parsed.data.plan,
    p_invoice_email: parsed.data.invoiceEmail,
    p_invoice_ref: parsed.data.invoiceRef,
    p_ehf: parsed.data.ehf,
    p_confirm: parsed.data.intent === 'confirm',
    p_interval: parsed.data.interval,
    // optional with its default (D-251): sent only by the form that draws the field
    ...(parsed.data.vatNumber === null ? {} : { p_vat_number: parsed.data.vatNumber }),
  })
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  revalidatePath('/oppsett')
  return { ok: true, confirmed: parsed.data.intent === 'confirm' }
}

/**
 * The daglig leder cancels (0066, D-110). The database decides the last day (the end of a
 * paid month, or today in a trial) and refuses without the explicit confirmation; the reason
 * is one of five fixed answers or none.
 */
export async function cancelSubscription(_prev: BillingResult | null, formData: FormData): Promise<BillingResult> {
  const parsed = z
    .object({ reason: z.enum(CANCEL_REASONS).nullable(), confirm: z.literal('on') })
    .safeParse({ reason: formData.get('reason') || null, confirm: formData.get('confirm') })
  if (!parsed.success) return { ok: false, problem: 'confirm_required' }
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'not_allowed' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cancel_subscription', { p_org: org, p_reason: parsed.data.reason, p_confirm: true })
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function withdrawCancellation(_prev: BillingResult | null): Promise<BillingResult> {
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'not_allowed' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('withdraw_cancellation', { p_org: org })
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * The daglig leder moves a paid plan to the free plan (0202, D-226). The database decides the day
 * it begins (after the paid month or year, or when the trial ends) and refuses without the explicit
 * confirmation; nothing is deleted.
 */
export async function downgradeToFree(_prev: BillingResult | null, formData: FormData): Promise<BillingResult> {
  if (formData.get('confirm') !== 'on') return { ok: false, problem: 'confirm_required' }
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'not_allowed' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('downgrade_to_free', { p_org: org, p_confirm: true })
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Takes the move to the free plan back, until the day it would begin (0202). */
export async function withdrawDowngrade(_prev: BillingResult | null): Promise<BillingResult> {
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'not_allowed' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('withdraw_downgrade', { p_org: org })
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  revalidatePath('/', 'layout')
  return { ok: true }
}
