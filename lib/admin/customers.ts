import { fittingPlan, PLAN_MAX, PLANS, type Plan } from '@/lib/billing/read'

/**
 * A customer's state and seats as Sentral's Customers page draws them (X-095, D-164). The state is
 * the access the product gives (0052: trial, grace, read-only, active) with a cancellation on top:
 * a cancelled customer is *cancelling* until its last day and *churned* after it. A demo sandbox is
 * its own kind, never counted as a customer.
 */
export const CUSTOMER_STATES = ['active', 'trial', 'ended', 'cancelling', 'churned', 'demo'] as const
export type CustomerState = (typeof CUSTOMER_STATES)[number]

type Row = {
  status: 'trial' | 'grace' | 'read_only' | 'active'
  cancelled_at: string | null
  cancel_effective_at: string | null
  demo: boolean
}

export function customerState(r: Row, now = Date.now()): CustomerState {
  if (r.demo) return 'demo'
  if (r.cancelled_at && r.cancel_effective_at) return new Date(r.cancel_effective_at).getTime() > now ? 'cancelling' : 'churned'
  if (r.status === 'active') return 'active'
  if (r.status === 'trial') return 'trial'
  return 'ended'
}

/** The dot beside a state, in the design's colours (`dot()`): live teal, trial yellow, trouble peach, gone grey */
export const STATE_DOT: Record<CustomerState, 'green' | 'yellow' | 'red' | 'grey'> = {
  active: 'green',
  trial: 'yellow',
  ended: 'red',
  cancelling: 'red',
  churned: 'grey',
  demo: 'grey',
}

/**
 * Seats: the employees registered against the plan's headcount (the price list's bands). Before a
 * plan is chosen, the plan the price list puts the stated size on. The largest plan has no ceiling,
 * so it has a count and no share.
 */
export function seats(plan: string | null, statedEmployees: number, registered: number) {
  const p: Plan = PLANS.includes(plan as Plan) ? (plan as Plan) : fittingPlan(statedEmployees)
  const max = PLAN_MAX[p]
  return {
    plan: p,
    chosen: plan !== null,
    used: registered,
    max: Number.isFinite(max) ? max : null,
    pct: Number.isFinite(max) ? Math.min(100, Math.round((100 * registered) / max)) : null,
  }
}
