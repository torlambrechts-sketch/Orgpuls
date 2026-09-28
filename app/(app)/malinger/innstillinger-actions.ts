'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrgId } from '@/lib/org/current'
import { COMMENT_POLICIES, EXTRA_KEYS } from '@/lib/settings/survey'
import { callFailed } from '@/lib/supabase/read'
import { createClient } from '@/lib/supabase/server'

/**
 * Målinger › Innstillinger's writes (0076, D-126). Each passes the organisation and the
 * values to one function, which checks the role and the rules — a reason for leaving out the
 * screening, the ranges — and this side reads the answer. It re-checks the shape at the
 * boundary and nothing else, so it cannot disagree with the database about who may.
 */

const Values = z.object({
  closeDaysGrunnlinje: z.number().int().min(1).max(60),
  closeDaysPuls: z.number().int().min(1).max(60),
  reminderDay: z.number().int().min(1).max(14).nullable(),
  finalReminder: z.boolean(),
  quietHours: z.boolean(),
  commentPolicy: z.enum(COMMENT_POLICIES),
  allowDialogue: z.boolean(),
  extras: z.array(z.enum(EXTRA_KEYS)).max(EXTRA_KEYS.length),
  extrasOffReason: z.string().max(500).nullable(),
})
export type DefaultsValues = z.infer<typeof Values>

const SaveResult = z.union([
  z.object({ ok: z.literal(true), planned_rounds: z.coerce.number() }),
  z.object({ error: z.enum(['not_allowed', 'invalid', 'reason_required']) }),
])

export type SaveDefaultsResult =
  | { ok: true; plannedRounds: number }
  | { ok: false; problem: 'not_allowed' | 'invalid' | 'reason_required' | 'failed' }

export async function saveSurveyDefaults(values: DefaultsValues): Promise<SaveDefaultsResult> {
  const org = await getCurrentOrgId()
  const v = Values.safeParse(values)
  if (!org) return { ok: false, problem: 'failed' }
  if (!v.success) return { ok: false, problem: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_survey_defaults', {
    p_org: org,
    p: {
      close_days_grunnlinje: v.data.closeDaysGrunnlinje,
      close_days_puls: v.data.closeDaysPuls,
      reminder_day: v.data.reminderDay,
      final_reminder: v.data.finalReminder,
      quiet_hours: v.data.quietHours,
      comment_policy: v.data.commentPolicy,
      allow_dialogue: v.data.allowDialogue,
      extras: v.data.extras,
      extras_off_reason: v.data.extrasOffReason,
    },
  })
  if (callFailed('saveSurveyDefaults', error)) return { ok: false, problem: 'failed' }
  const parsed = SaveResult.safeParse(data)
  if (!parsed.success) return { ok: false, problem: 'failed' }
  if ('error' in parsed.data) return { ok: false, problem: parsed.data.error }

  revalidatePath('/malinger')
  revalidatePath('/maleoppsett')
  return { ok: true, plannedRounds: parsed.data.planned_rounds }
}

const CodeResult = z.union([
  z.object({ ok: z.literal(true), code: z.string().regex(/^[a-hjkmnp-z2-9]{8}$/) }),
  z.object({ error: z.literal('not_allowed') }),
])

/** Makes the organisation's QR code, or with `renew` replaces it; the old poster then stops working. */
export async function makeEntryCode(renew: boolean): Promise<{ ok: true } | { ok: false; problem: 'not_allowed' | 'failed' }> {
  const org = await getCurrentOrgId()
  if (!org || typeof renew !== 'boolean') return { ok: false, problem: 'failed' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('entry_code', { p_org: org, p_new: renew })
  if (callFailed('makeEntryCode', error)) return { ok: false, problem: 'failed' }
  const parsed = CodeResult.safeParse(data)
  if (!parsed.success) return { ok: false, problem: 'failed' }
  if ('error' in parsed.data) return { ok: false, problem: 'not_allowed' }
  revalidatePath('/malinger')
  revalidatePath('/malinger/plakat')
  return { ok: true }
}

/** The invitation's greeting (0099, P1-1): set_invite_greeting decides who may, and empty clears it */
export async function saveInviteGreeting(text: string): Promise<{ ok: true } | { ok: false; problem: 'not_allowed' | 'failed' }> {
  const v = z.string().max(600).safeParse(text)
  if (!v.success) return { ok: false, problem: 'failed' }
  const org = await getCurrentOrgId()
  if (!org) return { ok: false, problem: 'not_allowed' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_invite_greeting', { p_org: org, p_text: v.data })
  if (callFailed('saveInviteGreeting', error)) return { ok: false, problem: 'failed' }
  const r = z.union([z.object({ ok: z.literal(true) }), z.object({ error: z.string() })]).safeParse(data)
  if (!r.success) return { ok: false, problem: 'failed' }
  if ('error' in r.data) return { ok: false, problem: r.data.error === 'not_allowed' ? 'not_allowed' : 'failed' }
  revalidatePath('/malinger')
  return { ok: true }
}
