'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current'
import { callFailed } from '@/lib/supabase/read'
import { writeFailed } from '@/lib/supabase/write'
import { WHEEL_CADENCES } from '@/lib/wheel/read'
import { getWizard, type WizardModel } from '@/lib/wizard/read'

/**
 * The Veiviser's own writes (P7, D-76). Each step saves through the action that already
 * owns its table — `fetchRegistry`, `importEmployees`, `setThreshold`,
 * `setEmployeeDutyRole`, `saveLawMode` — and only what no screen wrote before lives here:
 * where the wizard stands, the rhythm with its notice ladder, and the first send-out.
 *
 * As everywhere else, none of these re-checks the role. The policies on
 * `setup_progress`, `year_wheels` and `wheel_notifications` admit a daglig leder only,
 * `plan_first_round` refuses anyone else, and a refused write comes back as zero rows.
 */

export type WizardResult = { ok: true } | { ok: false; problem: string }

/** The model, fetched when the wizard opens rather than on every page view. */
export async function loadWizard(): Promise<WizardModel | null> {
  return getWizard()
}

async function saveProgress(patch: { step?: number; completed_at?: string; skipped_at?: string }): Promise<WizardResult> {
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'denied' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('setup_progress')
    .upsert({ org_id: org, ...patch }, { onConflict: 'org_id' })
    .select('org_id')
  if (writeFailed('saveWizardProgress', error, data)) return { ok: false, problem: 'denied' }
  return { ok: true }
}

/** "Neste", "Tilbake" and "Fortsett senere" all land here: the step to resume at. */
export async function saveWizardStep(formData: FormData): Promise<WizardResult> {
  const parsed = z.coerce.number().int().min(0).max(8).safeParse(formData.get('step'))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  return saveProgress({ step: parsed.data })
}

/** "Hopp over": put aside, so it does not open by itself again. Oppsett can still run it. */
export async function skipWizard(): Promise<WizardResult> {
  return saveProgress({ skipped_at: new Date().toISOString() })
}

/** "Til oversikten": finished. A later run starts from the beginning. */
export async function finishWizard(): Promise<WizardResult> {
  const result = await saveProgress({ step: 8, completed_at: new Date().toISOString() })
  if (result.ok) revalidatePath('/', 'layout')
  return result
}

/**
 * "Rytme og oppfølging": the cadence, the baseline month and July's pause on the wheel,
 * and the verneombud's early notice on its ladder.
 *
 * The ladder is written only where the wizard has something to say. An organisation with
 * no ladder gets the design's: verneombud and tillitsvalgte two days before (or on the day,
 * with the box unticked), daglig leder one day before, avdelingsledere on the day — they
 * are who "Resultat til ledere" reaches at the close. An existing ladder keeps its own
 * lead times; only the verneombud's and tillitsvalgtes' move, and only when the box does.
 */
export async function saveWizardRhythm(formData: FormData): Promise<WizardResult> {
  const parsed = z
    .object({
      cadence: z.enum(WHEEL_CADENCES as unknown as [string, ...string[]]),
      baselineMonth: z.coerce.number().int().min(1).max(12),
      skipFellesferie: z.enum(['on', 'off']),
      voFirst: z.enum(['on', 'off']),
    })
    .safeParse({
      cadence: formData.get('cadence'),
      baselineMonth: formData.get('baselineMonth'),
      skipFellesferie: formData.get('skipFellesferie'),
      voFirst: formData.get('voFirst'),
    })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'denied' }

  const supabase = await createClient()
  const app = supabase.schema('app')
  const { data: wheel, error } = await app
    .from('year_wheels')
    .update({
      cadence: parsed.data.cadence,
      baseline_month: parsed.data.baselineMonth,
      skip_fellesferie: parsed.data.skipFellesferie === 'on',
    })
    .eq('org_id', org)
    .select('id')
  if (writeFailed('saveWizardRhythm', error, wheel)) return { ok: false, problem: 'no_wheel' }
  const wheelId = z.string().safeParse(wheel?.[0]?.id)
  if (!wheelId.success) return { ok: false, problem: 'no_wheel' }

  const voLead = parsed.data.voFirst === 'on' ? 2 : 0
  const { data: ladder, error: readError } = await app
    .from('wheel_notifications')
    .select('audience, lead_days')
    .eq('wheel_id', wheelId.data)
  if (callFailed('saveWizardRhythm.ladder', readError)) return { ok: false, problem: 'denied' }
  const rows = z.array(z.object({ audience: z.string(), lead_days: z.coerce.number() })).safeParse(ladder)
  if (!rows.success) return { ok: false, problem: 'denied' }

  if (rows.data.length === 0) {
    const { data, error: insertError } = await app
      .from('wheel_notifications')
      .insert([
        { wheel_id: wheelId.data, audience: 'verneombud', lead_days: voLead, sort_order: 1 },
        { wheel_id: wheelId.data, audience: 'tillitsvalgte', lead_days: voLead, sort_order: 2 },
        { wheel_id: wheelId.data, audience: 'daglig_leder', lead_days: 1, sort_order: 3 },
        { wheel_id: wheelId.data, audience: 'avdelingsledere', lead_days: 0, sort_order: 4 },
      ])
      .select('audience')
    if (writeFailed('saveWizardRhythm.ladder', insertError, data)) return { ok: false, problem: 'denied' }
  } else {
    const vo = rows.data.find((r) => r.audience === 'verneombud')
    const wasFirst = !!vo && vo.lead_days > 0
    if (wasFirst !== voLead > 0) {
      const { data, error: updateError } = await app
        .from('wheel_notifications')
        .update({ lead_days: voLead })
        .eq('wheel_id', wheelId.data)
        .in('audience', ['verneombud', 'tillitsvalgte'])
        .select('audience')
      if (writeFailed('saveWizardRhythm.lead', updateError, data)) return { ok: false, problem: 'denied' }
    }
  }

  revalidatePath('/malinger')
  revalidatePath('/oppsett')
  return { ok: true }
}

/**
 * "Planlegg utsendingen" (0041). The guards are the function's: only a daglig leder, never
 * once the organisation has measured, a weekday from three to 120 days out, and someone
 * to invite. It plans the grunnlinje and switches the wheel on.
 */
const PlanResult = z.union([
  z.object({ ok: z.literal(true), round_id: z.string().uuid(), opens_at: z.string() }),
  z.object({
    error: z.enum(['not_available', 'already_measured', 'weekend', 'too_soon', 'too_far', 'no_employees', 'read_only']),
  }),
])

export async function planFirstRound(formData: FormData): Promise<WizardResult> {
  const parsed = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(formData.get('day'))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'not_available' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('plan_first_round', { p_org: org, p_opens_on: parsed.data })
  if (callFailed('planFirstRound', error)) return { ok: false, problem: 'not_available' }
  const result = PlanResult.safeParse(data)
  if (!result.success) return { ok: false, problem: 'not_available' }
  if ('error' in result.data) return { ok: false, problem: result.data.error }

  revalidatePath('/malinger')
  revalidatePath('/innsikt')
  return { ok: true }
}
