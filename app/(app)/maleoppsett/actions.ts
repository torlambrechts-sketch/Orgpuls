'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { COMMENT_POLICIES, EVALUATION_CADENCES } from '@/lib/setup/read'
import { createClient } from '@/lib/supabase/server'
import { writeFailed } from '@/lib/supabase/write'

/**
 * Writing a measurement's setup.
 *
 * Four actions, Zod at the boundary, and — as in the Tiltak actions — deliberately no
 * role check here. `round_group_write`, `org_question_write` and their siblings in 0017
 * enforce daglig leder or avdelingsleder against `auth.uid()`; a second copy of that rule
 * in the application is the copy that gets forgotten, and a caller without the role gets
 * zero rows and an unchanged screen.
 *
 * The five-question cap is likewise the database's. It is a trigger in 0017, so it holds
 * for this form, a future API and a hand-written INSERT alike, rather than for whoever
 * remembered to count.
 *
 * `allowDialogue` is parsed from a checkbox, which sends nothing at all when unticked.
 * That is why it is coerced from presence rather than read as a boolean: `formData.get`
 * returns null for an unchecked box, and `Boolean(null)` is the right answer only by
 * accident. Stated explicitly so the next reader does not "fix" it.
 */

const Uuid = z.string().uuid()

const Setup = z.object({
  roundId: Uuid,
  kind: z.enum(['grunnlinje', 'puls', 'oppfolging']),
  factorKeys: z.array(z.string().min(1).max(40)).min(1),
  commentPolicy: z.enum(COMMENT_POLICIES as unknown as [string, ...string[]]),
  allowDialogue: z.boolean(),
  reminderDay: z.union([z.null(), z.number().int().min(1).max(14)]),
  closeAfterDays: z.number().int().min(1).max(60),
  evaluationCadence: z.enum(EVALUATION_CADENCES as unknown as [string, ...string[]]),
  invitedGroupIds: z.array(Uuid),
})

export type SetupActionResult = { ok: true } | { ok: false; problem: string }

export async function saveSetup(formData: FormData): Promise<SetupActionResult> {
  const reminderRaw = String(formData.get('reminderDay') ?? '').trim()

  const parsed = Setup.safeParse({
    roundId: formData.get('roundId'),
    kind: formData.get('kind'),
    factorKeys: formData.getAll('factorKeys'),
    commentPolicy: formData.get('commentPolicy'),
    allowDialogue: formData.get('allowDialogue') !== null && formData.get('allowDialogue') !== '',
    reminderDay: reminderRaw === '' ? null : Number(reminderRaw),
    closeAfterDays: Number(formData.get('closeAfterDays')),
    evaluationCadence: formData.get('evaluationCadence'),
    invitedGroupIds: formData.getAll('invitedGroupIds'),
  })
  if (!parsed.success) return problem('invalid')

  const s = parsed.data
  const supabase = await createClient()

  const { data: round } = await supabase
    .schema('app')
    .from('rounds')
    .select('id, org_id, measurement_id')
    .eq('id', s.roundId)
    .maybeSingle()

  const round_ = z
    .object({ id: Uuid, org_id: Uuid, measurement_id: Uuid })
    .safeParse(round)
  if (!round_.success) return problem('gone')

  /*
   * This first write is the gate for the whole action. Everything after it -- the
   * measurement, the factor set, the invited departments -- is written only once this has
   * come back with a row, because they are all governed by the same policy on the same
   * organisation. A caller the policy refuses stops here rather than issuing five more
   * statements that will each silently do nothing.
   */
  const { data: savedRound, error } = await supabase
    .schema('app')
    .from('rounds')
    .update({
      comment_policy: s.commentPolicy,
      allow_dialogue: s.allowDialogue,
      reminder_day: s.reminderDay,
      close_after_days: s.closeAfterDays,
    })
    .eq('id', s.roundId)
    .select('id')
  if (writeFailed('saveRound', error, savedRound)) return problem('denied')

  const { error: measurementError } = await supabase
    .schema('app')
    .from('measurements')
    .update({ kind: s.kind, evaluation_cadence: s.evaluationCadence })
    .eq('id', round_.data.measurement_id)
  if (measurementError) return problem('denied')

  /*
   * The factor set and the invited departments are replaced rather than diffed, for the
   * reason the Tiltak actions give: a delete-then-insert says exactly what the person
   * left the form holding, where a diff has to decide what an absent row means.
   *
   * An empty `invitedGroupIds` writes no rows, which is how the schema says "everyone".
   * That is not the same as writing one row per department, and the difference is
   * visible later: a department added to the organisation next month is included by the
   * first and excluded by the second.
   */
  /*
   * These four are checked on `error` only, not on a row count, and the distinction is
   * deliberate. Authorisation was settled by the round update above: they are the same
   * organisation under the same policy, so a caller who got a row there gets rows here.
   * What a row count would mean instead is "how many factors did you choose", and zero is
   * a legitimate answer to that — an empty `invitedGroupIds` is how the schema says
   * *everyone*. So the count is not a verdict here; an error still is, and discarding it
   * was how a bad group id could leave the audience unsaved under a success message.
   */
  const { error: factorsCleared } = await supabase
    .schema('app')
    .from('round_factors')
    .delete()
    .eq('round_id', s.roundId)
  if (factorsCleared) return problem('denied')

  if (s.factorKeys.length) {
    const { error: factorsWritten } = await supabase
      .schema('app')
      .from('round_factors')
      .insert(
        s.factorKeys.map((factor_key) => ({
          org_id: round_.data.org_id,
          round_id: s.roundId,
          factor_key,
        })),
      )
    if (factorsWritten) return problem('denied')
  }

  const { error: groupsCleared } = await supabase
    .schema('app')
    .from('round_groups')
    .delete()
    .eq('round_id', s.roundId)
  if (groupsCleared) return problem('denied')

  if (s.invitedGroupIds.length) {
    const { error: groupsWritten } = await supabase
      .schema('app')
      .from('round_groups')
      .insert(s.invitedGroupIds.map((group_id) => ({ round_id: s.roundId, group_id })))
    if (groupsWritten) return problem('denied')
  }

  revalidatePath('/maleoppsett')
  revalidatePath('/malinger')
  return { ok: true }
}

/**
 * § 9-2 første ledd and § 6-2 fjerde ledd, as a record rather than a tick.
 *
 * The date and the counterpart are optional because the screen lets you confirm first and
 * fill in the meeting afterwards. A half-finished record is more useful than a refused
 * one: "drøftet, details to come" is true, and an inspector can ask for the rest.
 */
const Consultation = z.object({
  roundId: Uuid,
  kind: z.enum(['verneombud_raad', 'droftet_tillitsvalgte']),
  confirmed: z.boolean(),
  heldOn: z.union([z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  counterpart: z.union([z.null(), z.string().trim().min(1).max(200)]),
})

export async function saveConsultation(formData: FormData): Promise<SetupActionResult> {
  const held = String(formData.get('heldOn') ?? '').trim()
  const who = String(formData.get('counterpart') ?? '').trim()

  const parsed = Consultation.safeParse({
    roundId: formData.get('roundId'),
    kind: formData.get('kind'),
    confirmed: formData.get('confirmed') !== null && formData.get('confirmed') !== '',
    heldOn: held === '' ? null : held,
    counterpart: who === '' ? null : who,
  })
  if (!parsed.success) return problem('invalid')

  const c = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('round_consultations')
    .upsert(
      {
        round_id: c.roundId,
        kind: c.kind,
        confirmed: c.confirmed,
        held_on: c.heldOn,
        counterpart: c.counterpart,
      },
      { onConflict: 'round_id,kind' },
    )
    .select('round_id')

  if (writeFailed('saveConsultation', error, data)) return problem('denied')
  revalidatePath('/maleoppsett')
  return { ok: true }
}

export async function addOrgQuestion(formData: FormData): Promise<SetupActionResult> {
  const parsed = z
    .object({ body: z.string().trim().min(1).max(300) })
    .safeParse({ body: formData.get('body') })
  if (!parsed.success) return problem('invalid')

  const supabase = await createClient()
  const { data: org } = await supabase
    .schema('app')
    .from('organizations')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (!org) return problem('gone')

  const { data, error } = await supabase
    .schema('app')
    .from('org_questions')
    .insert({ org_id: (org as { id: string }).id, body: parsed.data.body })
    .select('id')

  // the cap is a trigger, so its refusal is what tells the screen it is full
  if (error) return problem(error.message.includes('at most five') ? 'capped' : 'denied')
  if (writeFailed('addOrgQuestion', null, data)) return problem('denied')
  revalidatePath('/maleoppsett')
  return { ok: true }
}

export async function removeOrgQuestion(formData: FormData): Promise<SetupActionResult> {
  const parsed = z.object({ id: Uuid }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return problem('invalid')

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('org_questions')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')
  if (writeFailed('removeOrgQuestion', error, data)) return problem('denied')

  revalidatePath('/maleoppsett')
  return { ok: true }
}

/** A key, not a sentence: the screen translates it, so the server never guesses a language. */
function problem(key: string): SetupActionResult {
  return { ok: false, problem: key }
}
