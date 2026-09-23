'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { WHEEL_CADENCES } from '@/lib/wheel/read'
import { createClient } from '@/lib/supabase/server'
import { writeFailed } from '@/lib/supabase/write'

/**
 * Writing the årshjul.
 *
 * `wheel_write` in 0019 admits daglig leder only — narrower than the pair that owns
 * measures, because this is the one setting that changes what happens to everybody
 * without anybody pressing anything. As everywhere else, the role is not re-checked here:
 * the policy is the rule, and a caller without it gets zero rows.
 *
 * Zero rows is now the answer the caller gets. It used to be success: an UPDATE that RLS
 * filters to nothing is not an error, so `if (error)` passed and a verneombud was told the
 * cadence had been saved. `.select('id')` makes the write observable and `writeFailed`
 * reads it. See lib/supabase/write.ts and S1 in docs/CODE_REVIEW_2026-09-23.md.
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

  const { data: saved, error } = await supabase
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
    .select('id')

  if (writeFailed('saveWheel', error, saved)) return { ok: false, problem: 'denied' }

  revalidatePath('/arshjulet')
  revalidatePath('/innsikt')
  revalidatePath('/maleoppsett')
  return { ok: true }
}
