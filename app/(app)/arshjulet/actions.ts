'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { WHEEL_CADENCES } from '@/lib/wheel/read'
import { createClient } from '@/lib/supabase/server'

/**
 * Writing the årshjul.
 *
 * `wheel_write` in 0019 admits daglig leder only — narrower than the pair that owns
 * measures, because this is the one setting that changes what happens to everybody
 * without anybody pressing anything. As everywhere else, the role is not re-checked here:
 * the policy is the rule, and a caller without it gets zero rows.
 */
const Wheel = z.object({
  cadence: z.enum(WHEEL_CADENCES as unknown as [string, ...string[]]),
  notifyLeadDays: z.number().int().min(1).max(60),
  extendIfLow: z.boolean(),
  skipFellesferie: z.boolean(),
  notifyVoOnOverdue: z.boolean(),
})

export type WheelActionResult = { ok: true } | { ok: false; problem: string }

const on = (v: FormDataEntryValue | null) => v !== null && v !== ''

export async function saveWheel(formData: FormData): Promise<WheelActionResult> {
  const parsed = Wheel.safeParse({
    cadence: formData.get('cadence'),
    notifyLeadDays: Number(formData.get('notifyLeadDays')),
    extendIfLow: on(formData.get('extendIfLow')),
    skipFellesferie: on(formData.get('skipFellesferie')),
    notifyVoOnOverdue: on(formData.get('notifyVoOnOverdue')),
  })
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const w = parsed.data
  const supabase = await createClient()

  const { data: row } = await supabase
    .schema('app')
    .from('year_wheels')
    .select('id')
    .limit(1)
    .maybeSingle()

  const id = z.object({ id: z.string() }).safeParse(row)
  if (!id.success) return { ok: false, problem: 'denied' }

  const { error } = await supabase
    .schema('app')
    .from('year_wheels')
    .update({
      cadence: w.cadence,
      notify_lead_days: w.notifyLeadDays,
      extend_if_low: w.extendIfLow,
      skip_fellesferie: w.skipFellesferie,
      notify_vo_on_overdue: w.notifyVoOnOverdue,
    })
    .eq('id', id.data.id)

  if (error) return { ok: false, problem: 'denied' }

  revalidatePath('/arshjulet')
  revalidatePath('/innsikt')
  revalidatePath('/maleoppsett')
  return { ok: true }
}
