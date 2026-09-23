'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrgId } from '@/lib/org/current'
import { INFORMATION_AUDIENCES, INFORMATION_CHANNELS } from '@/lib/report/enums'
import { createClient } from '@/lib/supabase/server'
import { writeFailed } from '@/lib/supabase/write'

/**
 * Recording what section 8 prints: that the findings were shared, and that people were
 * trained. D-52.
 *
 * Who may write is `information_write_*` and `training_write_*` (0026): daglig leder
 * or verneombud, enforced by the database. A refused write returns no rows, and
 * `writeFailed` reports it rather than letting it read as saved. That a round's record
 * belongs to the round's own organisation is the `information_round_ok` trigger (0023).
 *
 * The notes are the organisation's own words about a meeting or a course, never a
 * respondent's, so they may be stored and printed. They are still not logged.
 */

export type RegisterResult = { ok: true } | { ok: false; problem: string }

const Uuid = z.string().uuid()
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** Empty string is what an untouched field sends; it means "no value". */
const Optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable())

const InformationFields = z.object({
  roundId: Uuid,
  audience: z.enum(INFORMATION_AUDIENCES),
  channel: z.enum(INFORMATION_CHANNELS),
  heldOn: Day,
  note: Optional(z.string().trim().max(1000)),
})

const TrainingFields = z
  .object({
    title: z.string().trim().min(1).max(200),
    audience: z.enum(INFORMATION_AUDIENCES),
    heldOn: Day,
    nextDue: Optional(Day),
    note: Optional(z.string().trim().max(1000)),
  })
  // the table's own check (0023): due again after it was held, never on the same day
  .refine((f) => f.nextDue === null || f.nextDue > f.heldOn, { path: ['nextDue'] })

export async function addInformation(_: RegisterResult | null, form: FormData): Promise<RegisterResult> {
  const parsed = InformationFields.safeParse({
    roundId: form.get('roundId'),
    audience: form.get('audience'),
    channel: form.get('channel'),
    heldOn: form.get('heldOn'),
    note: form.get('note'),
  })
  if (!parsed.success) return problem('invalid')

  const orgId = await getCurrentOrgId()
  if (!orgId) return problem('denied')

  const f = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('round_information')
    .insert({
      org_id: orgId,
      round_id: f.roundId,
      audience: f.audience,
      channel: f.channel,
      held_on: f.heldOn,
      note: f.note,
    })
    .select('id')

  // unique (round_id, audience, channel, held_on): the same meeting recorded twice
  if (error?.code === '23505') return problem('duplicate')
  if (writeFailed('addInformation', error, data)) return problem('denied')
  revalidatePath('/rapport')
  return { ok: true }
}

export async function addTraining(_: RegisterResult | null, form: FormData): Promise<RegisterResult> {
  const parsed = TrainingFields.safeParse({
    title: form.get('title'),
    audience: form.get('audience'),
    heldOn: form.get('heldOn'),
    nextDue: form.get('nextDue'),
    note: form.get('note'),
  })
  if (!parsed.success) {
    return problem(parsed.error.issues.some((i) => i.path[0] === 'nextDue') ? 'nextDue' : 'invalid')
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) return problem('denied')

  const f = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('trainings')
    .insert({
      org_id: orgId,
      title: f.title,
      audience: f.audience,
      held_on: f.heldOn,
      next_due: f.nextDue,
      note: f.note,
    })
    .select('id')

  if (writeFailed('addTraining', error, data)) return problem('denied')
  revalidatePath('/rapport')
  return { ok: true }
}

export async function removeInformation(id: string): Promise<RegisterResult> {
  return remove('round_information', 'removeInformation', id)
}

export async function removeTraining(id: string): Promise<RegisterResult> {
  return remove('trainings', 'removeTraining', id)
}

async function remove(
  table: 'round_information' | 'trainings',
  where: string,
  id: string,
): Promise<RegisterResult> {
  const parsed = Uuid.safeParse(id)
  if (!parsed.success) return problem('invalid')

  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from(table).delete().eq('id', parsed.data).select('id')
  if (writeFailed(where, error, data)) return problem('denied')
  revalidatePath('/rapport')
  return { ok: true }
}

function problem(p: string): RegisterResult {
  return { ok: false, problem: p }
}
