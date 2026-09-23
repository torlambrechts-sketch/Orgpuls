'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { STEP_KEYS } from '@/lib/measures/read'
import { createClient } from '@/lib/supabase/server'
import { writeFailed } from '@/lib/supabase/write'

/**
 * Writing tiltak.
 *
 * Four actions, one boundary. Every field arriving from a form is parsed by Zod before
 * it reaches the database, per CLAUDE.md invariant 6 — a form post is the least
 * trustworthy input this application takes, since anyone signed in can send any field
 * with any value regardless of what the page rendered.
 *
 * What is NOT checked here, deliberately: whether this person may write. That is
 * `measure_write` in migration 0013 — daglig leder or avdelingsleder, enforced by the
 * database against `auth.uid()`. An action that checked the role itself would be a
 * second copy of the rule, and the copy that gets forgotten is always the one in the
 * application. A caller without the role gets zero rows updated and the screen
 * re-renders unchanged.
 *
 * The step is not given a transition rule here either. "A measure cannot be closed
 * before its effect is measured" lives in 0015 as a trigger, so it holds for every
 * writer — this form, a future API, a hand-written UPDATE — rather than for whoever
 * remembered to ask.
 */

const Uuid = z.string().uuid()

/** Empty string is what an untouched form field sends; it means "no value", not "". */
const Optional = (schema: z.ZodTypeAny) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable())

const MeasureFields = z.object({
  id: Uuid,
  title: z.string().trim().min(1).max(200),
  goal: Optional(z.string().trim().max(2000)),
  factorKey: z.string().min(1).max(40),
  ownerEmployeeId: Optional(Uuid),
  dueDate: Optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  step: z.enum(STEP_KEYS),
  kind: z.enum(['kollektivt', 'individuelt']),
  groupIds: z.array(Uuid),
})

export type MeasureActionResult = { ok: true } | { ok: false; problem: string }

/**
 * A new measure, deliberately almost empty.
 *
 * The design creates one and opens it for editing rather than asking for a title first,
 * so the row has to be insertable before anyone has decided anything. The factor is the
 * one thing a measure cannot be without — it is what the whole screen hangs on — so the
 * caller names it, and the rest is filled in by the person.
 */
export async function createMeasure(formData: FormData): Promise<MeasureActionResult> {
  const parsed = z
    .object({ factorKey: z.string().min(1).max(40), roundId: Optional(Uuid) })
    .safeParse({ factorKey: formData.get('factorKey'), roundId: formData.get('roundId') })
  if (!parsed.success) return problem('invalid')

  const t = await getTranslations()
  const supabase = await createClient()

  const { data: org } = await supabase.schema('app').from('organizations').select('id').limit(1).maybeSingle()
  if (!org) return problem('noOrg')

  const { data, error } = await supabase
    .schema('app')
    .from('measures')
    .insert({
      org_id: org.id,
      factor_key: parsed.data.factorKey,
      round_id: parsed.data.roundId,
      title: t('tiltak.newTitle'),
      step: 'foreslatt',
    })
    .select('id')

  if (writeFailed('createMeasure', error, data)) return problem('denied')
  revalidatePath('/tiltak')
  return { ok: true }
}

export async function updateMeasure(formData: FormData): Promise<MeasureActionResult> {
  const parsed = MeasureFields.safeParse({
    id: formData.get('id'),
    title: formData.get('title'),
    goal: formData.get('goal'),
    factorKey: formData.get('factorKey'),
    ownerEmployeeId: formData.get('ownerEmployeeId'),
    dueDate: formData.get('dueDate'),
    step: formData.get('step'),
    kind: formData.get('kind'),
    groupIds: formData.getAll('groupIds'),
  })
  if (!parsed.success) return problem('invalid')

  const m = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('app')
    .from('measures')
    .update({
      title: m.title,
      goal: m.goal,
      factor_key: m.factorKey,
      owner_employee_id: m.ownerEmployeeId,
      due_date: m.dueDate,
      step: m.step,
      kind: m.kind,
    })
    .eq('id', m.id)
    .select('id')

  // the trigger in 0015 refuses a close that skips the effect measurement
  if (error) return problem(error.message.includes('effect has been measured') ? 'closingRule' : 'denied')
  if (writeFailed('updateMeasure', null, data)) return problem('denied')

  /*
   * The audience is replaced rather than diffed. It is a small set chosen in one form,
   * and a delete-then-insert says exactly what the person left the form holding; a diff
   * would have to decide what an absent checkbox means, which is the same answer with
   * more ways to be wrong.
   */
  /*
   * Checked on `error` only. The measure update above already settled authorisation, and
   * a row count here would mean "how many departments did you pick", where zero is the
   * legitimate answer for a measure that affects everybody. An error is still a verdict,
   * and discarding it was how a bad group id could leave the audience unsaved while the
   * screen reported success.
   */
  const { error: cleared } = await supabase
    .schema('app')
    .from('measure_groups')
    .delete()
    .eq('measure_id', m.id)
  if (cleared) return problem('denied')

  if (m.groupIds.length) {
    const { error: written } = await supabase
      .schema('app')
      .from('measure_groups')
      .insert(m.groupIds.map((group_id) => ({ measure_id: m.id, group_id })))
    if (written) return problem('denied')
  }

  revalidatePath('/tiltak')
  revalidatePath('/rapport')
  return { ok: true }
}

/**
 * "Flytt videre": one step along, never past the end.
 *
 * The next step is computed from the current one read back from the database rather
 * than from what the page believed, so two people pressing the button on a stale page
 * cannot skip a step between them.
 */
export async function advanceMeasure(formData: FormData): Promise<MeasureActionResult> {
  const parsed = z.object({ id: Uuid }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return problem('invalid')

  const supabase = await createClient()
  const { data: current } = await supabase
    .schema('app')
    .from('measures')
    .select('step')
    .eq('id', parsed.data.id)
    .maybeSingle()

  const step = z.enum(STEP_KEYS).safeParse(current?.step)
  if (!step.success) return problem('gone')

  const next = STEP_KEYS[Math.min(STEP_KEYS.indexOf(step.data) + 1, STEP_KEYS.length - 1)]
  if (next === step.data) return { ok: true }

  const { data: moved, error } = await supabase
    .schema('app')
    .from('measures')
    .update({ step: next })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return problem(error.message.includes('effect has been measured') ? 'closingRule' : 'denied')
  if (writeFailed('advanceMeasure', null, moved)) return problem('denied')
  revalidatePath('/tiltak')
  revalidatePath('/rapport')
  return { ok: true }
}

export async function deleteMeasure(formData: FormData): Promise<MeasureActionResult> {
  const parsed = z.object({ id: Uuid }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return problem('invalid')

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('measures')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')
  if (writeFailed('deleteMeasure', error, data)) return problem('denied')

  revalidatePath('/tiltak')
  revalidatePath('/rapport')
  return { ok: true }
}

/** A key, not a sentence: the screen translates it, so the server never guesses a language. */
function problem(key: string): MeasureActionResult {
  return { ok: false, problem: key }
}
