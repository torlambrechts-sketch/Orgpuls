import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed } from '@/lib/supabase/read'

/**
 * The organisation's trial and payment details (0048, D-89). RLS returns the row to the
 * daglig leder only; for anybody else this is null, and the tab says who handles payment.
 */
export const PLANS = ['small', 'usual', 'group'] as const
export type Plan = (typeof PLANS)[number]

/** How a subscription is invoiced (0201, D-217): monthly, or yearly at ANNUAL_MONTHS months' price. */
export const INTERVALS = ['month', 'year'] as const
export type BillingInterval = (typeof INTERVALS)[number]
/** A year costs this many months; mirrors app.annual_months() (0201): two months free. */
export { ANNUAL_MONTHS } from '@/lib/site/pricing'

/** The largest headcount each plan is priced for, as the price list and `save_billing` say. */
export const PLAN_MAX: Record<Plan, number> = { small: 25, usual: 100, group: Number.POSITIVE_INFINITY }

const BillingRow = z.object({
  trial_started_at: z.string(),
  trial_ends_at: z.string(),
  trial_extended_at: z.string().nullable(),
  plan: z.enum(PLANS).nullable(),
  billing_interval: z.enum(INTERVALS),
  invoice_email: z.string().nullable(),
  invoice_ref: z.string().nullable(),
  ehf: z.boolean(),
  confirmed_at: z.string().nullable(),
  // a cancellation (0064, 0066; D-108, D-110)
  cancelled_at: z.string().nullable(),
  cancel_effective_at: z.string().nullable(),
  deletion_due_at: z.string().nullable(),
  cancel_source: z.enum(['admin', 'customer']).nullable(),
})
export type Billing = z.infer<typeof BillingRow>
export const CANCEL_REASONS = ['price', 'not_needed', 'missing', 'switching', 'other'] as const

export async function getBilling(orgId: string): Promise<Billing | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('billing')
    .select('trial_started_at, trial_ends_at, trial_extended_at, plan, billing_interval, invoice_email, invoice_ref, ehf, confirmed_at, cancelled_at, cancel_effective_at, deletion_due_at, cancel_source')
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

/** Days after the trial before an unconfirmed organisation is on the free plan; mirrors app.grace_days() (0052, 0201). */
export const GRACE_DAYS = 14

const AccessState = z.object({
  // read_only is a cancellation that has taken effect; past the trial and grace an unconfirmed
  // organisation is on the free plan (0201, D-217)
  access: z.enum(['trial', 'grace', 'free', 'read_only', 'active']),
  trial_ends_at: z.string(),
  free_from: z.string(),
  // a cancellation (0064, D-108): when the agreement ends, and when everything is deleted
  cancel_effective_at: z.string().nullable().optional(),
  deletion_due_at: z.string().nullable().optional(),
})
export type AccessState = z.infer<typeof AccessState>

/**
 * Where the organisation stands after its trial (0052, D-94; 0201, D-217), for every member: the
 * banner over the app and the free plan's limits read this. The database decides; this only
 * reports it.
 */
export const getAccessState = cache(async (orgId: string): Promise<AccessState | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('org_access_state', { p_org: orgId })
  if (callFailed('getAccessState', error) || !data) return null
  const parsed = AccessState.safeParse(data)
  if (parseFailed('getAccessState', parsed)) return null
  return parsed.data
})

/**
 * Whether the organisation is on the free plan (0201, D-217): the standard main survey, its
 * results and measures. The database refuses what the plan does not include; the screens read
 * this to say so before anyone tries, and to leave out the report and the comparisons with
 * earlier rounds, which are read paths.
 */
export async function isFreePlan(orgId: string | null): Promise<boolean> {
  if (!orgId) return false
  return (await getAccessState(orgId))?.access === 'free'
}
