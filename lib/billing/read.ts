import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed } from '@/lib/supabase/read'

/**
 * The organisation's trial and payment details (0048, D-89). RLS returns the row to the
 * daglig leder only; for anybody else this is null, and the tab says who handles payment.
 */
export const PLANS = ['small', 'usual', 'group'] as const
export type Plan = (typeof PLANS)[number]

/** The largest headcount each plan is priced for, as the price list and `save_billing` say. */
export const PLAN_MAX: Record<Plan, number> = { small: 25, usual: 100, group: Number.POSITIVE_INFINITY }

const BillingRow = z.object({
  trial_started_at: z.string(),
  trial_ends_at: z.string(),
  trial_extended_at: z.string().nullable(),
  plan: z.enum(PLANS).nullable(),
  invoice_email: z.string().nullable(),
  invoice_ref: z.string().nullable(),
  ehf: z.boolean(),
  confirmed_at: z.string().nullable(),
})
export type Billing = z.infer<typeof BillingRow>

export async function getBilling(orgId: string): Promise<Billing | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('billing')
    .select('trial_started_at, trial_ends_at, trial_extended_at, plan, invoice_email, invoice_ref, ehf, confirmed_at')
    .eq('org_id', orgId)
    .maybeSingle()

  // no row is the ordinary answer for everyone but the daglig leder, not a failure
  if (callFailed('getBilling', error) || !data) return null
  const parsed = BillingRow.safeParse(data)
  if (parseFailed('getBilling', parsed)) return null
  return parsed.data
}

/** The plan the price list puts an organisation of this size on. */
export const fittingPlan = (employees: number): Plan =>
  employees <= PLAN_MAX.small ? 'small' : employees <= PLAN_MAX.usual ? 'usual' : 'group'
