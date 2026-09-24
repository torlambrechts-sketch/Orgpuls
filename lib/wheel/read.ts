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
const CADENCES = ['minimum', 'kvartalspuls', 'halvarspuls', 'manedspuls'] as const
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

export { wheelMonths } from '@/lib/wheel/months'

/**
 * The heartbeat, and only the heartbeat.
 *
 * `app.job_runs` also counts what each tick opened, closed, planned and queued — but
 * across every organisation, because the tick is global. Since sign-up went live any
 * organisation's users could read those platform-wide counts, and this screen never
 * rendered them: "Årshjulet gikk sist …" needs the time and nothing else. Migration 0026
 * narrows the grant to `ran_at`, so asking for more would now be refused outright.
 */
const RunRow = z.object({
  ran_at: z.string(),
})

export type JobRun = z.infer<typeof RunRow>

/** The last thing the scheduler did, which is what makes "kjører" checkable. */
export async function getLastRun(): Promise<JobRun | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('job_runs')
    .select('ran_at')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (readFailed('getLastRun', error, data)) return null
  const parsed = RunRow.safeParse(data)
  return parsed.success ? parsed.data : null
}

/**
 * How much is queued, how much has gone out, and how much never will (0032): a row the
 * dispatcher gave up on — stale, no address, or five failed attempts — is neither waiting
 * nor sent, and counting it as waiting would promise a mail that is not coming.
 */
export async function getQueueCounts(): Promise<{ pending: number; sent: number; failed: number }> {
  const supabase = await createClient()
  const outbox = () => supabase.schema('app').from('outbox').select('id', { count: 'exact', head: true })
  const [pending, sent, failed] = await Promise.all([
    outbox().is('sent_at', null).is('failed_at', null),
    outbox().not('sent_at', 'is', null),
    outbox().is('sent_at', null).not('failed_at', 'is', null),
  ])
  return { pending: pending.count ?? 0, sent: sent.count ?? 0, failed: failed.count ?? 0 }
}
