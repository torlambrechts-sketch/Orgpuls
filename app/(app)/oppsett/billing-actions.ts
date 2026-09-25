'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PLANS } from '@/lib/billing/read'
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
  invoiceEmail: z.string().trim().min(3).max(254),
  invoiceRef: z.string().trim().max(60),
  ehf: z.boolean(),
  intent: z.enum(['save', 'confirm']),
})

export async function saveBilling(_prev: BillingResult | null, formData: FormData): Promise<BillingResult> {
  const parsed = Form.safeParse({
    plan: formData.get('plan'),
    invoiceEmail: formData.get('invoiceEmail') ?? '',
    invoiceRef: formData.get('invoiceRef') ?? '',
    ehf: formData.get('ehf') === 'on',
    intent: formData.get('intent'),
  })
  if (!parsed.success) {
    const plan = PLANS.includes(formData.get('plan') as (typeof PLANS)[number])
    return { ok: false, problem: plan ? 'invalid_email' : 'invalid_plan' }
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
  })
  if (error) return { ok: false, problem: 'failed' }
  const reply = Reply.safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error ?? 'failed' }
  revalidatePath('/oppsett')
  return { ok: true, confirmed: parsed.data.intent === 'confirm' }
}
