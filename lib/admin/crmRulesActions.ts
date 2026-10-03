'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'
import { ruleValueFromForm } from './crmRuleValue'

/**
 * Admin › Settings › CRM rules (0192, D-208). The database decides who may change a rule (a super-admin
 * with the second factor), checks the value against the rule's options, asks for a reason while typed
 * reasons are on, and logs the change; this shapes the request.
 */
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() }).passthrough()

export async function setCrmRule(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const parsed = z
    .object({
      key: z.string().regex(/^[a-z][a-z0-9_]{2,60}$/),
      kind: z.enum(['choice', 'limit']),
      choice: z.string().max(60),
      limit: z.union([z.literal(''), z.string().regex(/^[0-9]{1,9}$/)]),
      unlimited: z.boolean(),
      reason: z.string().max(500),
    })
    .safeParse({
      key: formData.get('key'),
      kind: formData.get('kind'),
      choice: String(formData.get('choice') ?? ''),
      limit: String(formData.get('limit') ?? '').trim(),
      unlimited: formData.get('unlimited') === 'on',
      reason: String(formData.get('reason') ?? '').trim(),
    })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const d = parsed.data
  const value = ruleValueFromForm(d.kind, d.choice, d.unlimited, d.limit)
  if (value === undefined) return { ok: false, problem: 'invalid' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_crm_rule_set', { p_key: d.key, p_value: value, p_reason: d.reason || null })
  const r = Reply.safeParse(data)
  if (error || !r.success) return { ok: false, problem: 'failed' }
  if (!r.data.ok) return { ok: false, problem: r.data.error ?? 'failed' }
  revalidatePath('/admin/settings')
  revalidatePath('/admin/crm', 'layout')
  return { ok: true }
}
