'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { STEP_KEYS } from '@/lib/measures/read'
import { getCurrentOrgId } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'
import { writeFailed } from '@/lib/supabase/write'

/**
 * Measures from an industry module's suggestions (0071, D-115).
 *
 * A suggestion becomes a measure with its title and description, the module factor, and the
 * statement that re-measures it — the registry's, looked up here by the suggestion's id, never
 * taken from the form. Who may write is `measure_write` (0013), as for every measure; the
 * database refuses a statement that is not the factor's (measure_module_ok).
 */
export type ModuleMeasureResult = { ok: true; id?: string } | { ok: false; problem: string }

const Uuid = z.string().uuid()

export async function createModuleMeasure(formData: FormData): Promise<ModuleMeasureResult> {
  const parsed = z
    .object({ suggestionId: Uuid, roundId: Uuid.nullable() })
    .safeParse({ suggestionId: formData.get('suggestionId'), roundId: formData.get('roundId') || null })
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, problem: 'noOrg' }
  const supabase = await createClient()

  const { data: s } = await supabase
    .schema('app')
    .from('module_action_suggestions')
    .select('id, factor_id, title, description, remeasure_item_id')
    .eq('id', parsed.data.suggestionId)
    .maybeSingle()
  const suggestion = z
    .object({ id: Uuid, factor_id: Uuid, title: z.string(), description: z.string(), remeasure_item_id: Uuid })
    .safeParse(s)
  if (!suggestion.success) return { ok: false, problem: 'gone' }

  const { data, error } = await supabase
    .schema('app')
    .from('measures')
    .insert({
      org_id: orgId,
      factor_key: null,
      module_factor_id: suggestion.data.factor_id,
      remeasure_item_id: suggestion.data.remeasure_item_id,
      round_id: parsed.data.roundId,
      title: suggestion.data.title,
      goal: suggestion.data.description,
      step: 'foreslatt',
      kind: 'kollektivt',
    })
    .select('id')
  if (writeFailed('createModuleMeasure', error, data)) return { ok: false, problem: 'denied' }

  revalidatePath('/tiltak')
  revalidatePath('/resultater')
  const id = z.array(z.object({ id: Uuid })).safeParse(data)
  return { ok: true, id: id.success ? id.data[0]?.id : undefined }
}

const Update = z.object({
  id: Uuid,
  step: z.enum(STEP_KEYS as unknown as [string, ...string[]]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  ownerId: Uuid.nullable(),
})

export async function updateModuleMeasure(formData: FormData): Promise<ModuleMeasureResult> {
  const parsed = Update.safeParse({
    id: formData.get('id'),
    step: formData.get('step'),
    dueDate: String(formData.get('dueDate') ?? '').trim() || null,
    ownerId: String(formData.get('ownerId') ?? '').trim() || null,
  })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const m = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('measures')
    .update({ step: m.step, due_date: m.dueDate, owner_employee_id: m.ownerId })
    .eq('id', m.id)
    .not('module_factor_id', 'is', null)
    .select('id')
  if (error) {
    if (error.message.includes('effect has been measured')) return { ok: false, problem: 'closingRule' }
    return { ok: false, problem: 'denied' }
  }
  if (writeFailed('updateModuleMeasure', null, data)) return { ok: false, problem: 'denied' }
  revalidatePath('/tiltak')
  return { ok: true }
}
