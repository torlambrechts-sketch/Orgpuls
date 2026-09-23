import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * Reading the årshjul.
 *
 * The wheel is a configuration plus the evidence that it ran: `app.year_wheels` and its
 * notification ladder say what should happen, `app.job_runs` and `app.outbox` say what
 * did. Årshjulet shows both, which is the only way "kjører" can be a claim rather than a
 * caption — the screen reads a job log, not a boolean somebody set by hand.
 *
 * The month strip is derived, never stored: a quarterly wheel with its baseline in
 * September pulses in December, March and June, and three stored rows could disagree with
 * the cadence they were written from. `app.wheel_months` is the same function the
 * scheduler plans from, so the strip and the rounds cannot diverge.
 */
const CADENCES = ['minimum', 'kvartalspuls', 'manedspuls'] as const
const AUDIENCES = ['verneombud', 'tillitsvalgte', 'daglig_leder', 'avdelingsledere', 'alle_ansatte'] as const

export type WheelCadence = (typeof CADENCES)[number]
export type NotifyAudience = (typeof AUDIENCES)[number]
export const WHEEL_CADENCES: readonly WheelCadence[] = CADENCES

const WheelRow = z.object({
  id: z.string(),
  cadence: z.enum(CADENCES),
  baseline_month: z.coerce.number(),
  notify_lead_days: z.coerce.number(),
  extend_if_low: z.boolean(),
  skip_fellesferie: z.boolean(),
  notify_vo_on_overdue: z.boolean(),
  active: z.boolean(),
  wheel_notifications: z.array(
    z.object({
      audience: z.enum(AUDIENCES),
      lead_days: z.coerce.number(),
      sort_order: z.coerce.number(),
    }),
  ),
})

export interface Wheel {
  id: string
  cadence: WheelCadence
  baselineMonth: number
  notifyLeadDays: number
  extendIfLow: boolean
  skipFellesferie: boolean
  notifyVoOnOverdue: boolean
  active: boolean
  ladder: { audience: NotifyAudience; leadDays: number }[]
}

export async function getWheel(): Promise<Wheel | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('year_wheels')
    .select(
      'id, cadence, baseline_month, notify_lead_days, extend_if_low, skip_fellesferie,' +
        ' notify_vo_on_overdue, active, wheel_notifications(audience, lead_days, sort_order)',
    )
    .limit(1)
    .maybeSingle()

  if (readFailed('getWheel', error, data)) return null
  const parsed = WheelRow.safeParse(data)
  if (parseFailed('getWheel', parsed)) return null
  const w = parsed.data

  return {
    id: w.id,
    cadence: w.cadence,
    baselineMonth: w.baseline_month,
    notifyLeadDays: w.notify_lead_days,
    extendIfLow: w.extend_if_low,
    skipFellesferie: w.skip_fellesferie,
    notifyVoOnOverdue: w.notify_vo_on_overdue,
    active: w.active,
    ladder: w.wheel_notifications
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((n) => ({ audience: n.audience, leadDays: n.lead_days })),
  }
}

/**
 * Which months the wheel measures in, computed the same way the scheduler computes it.
 *
 * Kept in TypeScript as well as in SQL because the strip must render without a round
 * trip, and duplicated deliberately rather than read from the database: the rule is four
 * lines, and a screen that asked the server what month December is would be worse.
 * `app.wheel_months` is the authority; this mirrors it, and the invariant suite is what
 * would catch them drifting apart.
 */
export function wheelMonths(
  cadence: WheelCadence,
  baselineMonth: number,
  skipFellesferie: boolean,
): { month: number; kind: 'grunnlinje' | 'puls' }[] {
  const out: { month: number; kind: 'grunnlinje' | 'puls' }[] = [
    { month: baselineMonth, kind: 'grunnlinje' },
  ]
  const step = cadence === 'kvartalspuls' ? 3 : cadence === 'manedspuls' ? 1 : 0
  if (step === 0) return out

  for (let i = step; i < 12; i += step) {
    const month = ((baselineMonth - 1 + i) % 12) + 1
    if (skipFellesferie && month === 7) continue
    out.push({ month, kind: 'puls' })
  }
  return out
}

const RunRow = z.object({
  ran_at: z.string(),
  opened: z.coerce.number(),
  closed: z.coerce.number(),
  queued: z.coerce.number(),
  planned: z.coerce.number(),
})

export type JobRun = z.infer<typeof RunRow>

/** The last thing the scheduler did, which is what makes "kjører" checkable. */
export async function getLastRun(): Promise<JobRun | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('job_runs')
    .select('ran_at, opened, closed, queued, planned')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (readFailed('getLastRun', error, data)) return null
  const parsed = RunRow.safeParse(data)
  return parsed.success ? parsed.data : null
}

/** How much is queued and how much of it has gone out. */
export async function getQueueCounts(): Promise<{ pending: number; sent: number }> {
  const supabase = await createClient()
  const [pending, sent] = await Promise.all([
    supabase.schema('app').from('outbox').select('id', { count: 'exact', head: true }).is('sent_at', null),
    supabase.schema('app').from('outbox').select('id', { count: 'exact', head: true }).not('sent_at', 'is', null),
  ])
  return { pending: pending.count ?? 0, sent: sent.count ?? 0 }
}
