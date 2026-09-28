import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * Målinger › Innstillinger's readers (0076, D-126): the organisation's standard for a survey,
 * its change log, and the QR entry code. Every read is org-scoped by RLS; each table admits
 * any member and nobody writes it but its function.
 */

export const COMMENT_POLICIES = ['hvert', 'lave', 'slutt', 'av'] as const
export const EXTRA_KEYS = ['anbefaling', 'krenkende', 'vold', 'apent_felt'] as const
/** the statutory screening: on by default, off only with a reason */
export const SCREENING = ['krenkende', 'vold'] as const

export type SurveyDefaults = {
  closeDaysGrunnlinje: number
  closeDaysPuls: number
  reminderDay: number | null
  finalReminder: boolean
  quietHours: boolean
  commentPolicy: (typeof COMMENT_POLICIES)[number]
  allowDialogue: boolean
  extras: string[]
  extrasOffReason: string | null
}

/**
 * The product's own standard, the same values as app.survey_defaults_of (0076). It is what
 * the form starts from before an organisation has saved one, and what "Anbefalt" marks.
 */
export const PRODUCT_DEFAULTS: SurveyDefaults = {
  // 0097: two weeks for a grunnlinje, which covers a holiday week and a shift rotation
  closeDaysGrunnlinje: 14,
  closeDaysPuls: 7,
  reminderDay: 2,
  finalReminder: true,
  quietHours: true,
  commentPolicy: 'lave',
  allowDialogue: true,
  extras: [...EXTRA_KEYS],
  extrasOffReason: null,
}

const Row = z.object({
  close_days_grunnlinje: z.number().int(),
  close_days_puls: z.number().int(),
  reminder_day: z.number().int().nullable(),
  final_reminder: z.boolean(),
  quiet_hours: z.boolean(),
  comment_policy: z.enum(COMMENT_POLICIES),
  allow_dialogue: z.boolean(),
  extras: z.array(z.string()),
  extras_off_reason: z.string().nullable(),
  updated_at: z.string(),
})

/** The saved standard, or null when the organisation has none (and the product's applies). */
export async function getSurveyDefaults(orgId: string): Promise<(SurveyDefaults & { updatedAt: string }) | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('survey_defaults')
    .select('close_days_grunnlinje, close_days_puls, reminder_day, final_reminder, quiet_hours, comment_policy, allow_dialogue, extras, extras_off_reason, updated_at')
    .eq('org_id', orgId)
    .limit(1)
  if (readFailed('getSurveyDefaults', error, data)) return null
  const parsed = z.array(Row).safeParse(data)
  if (parseFailed('getSurveyDefaults', parsed)) return null
  const r = parsed.data[0]
  if (!r) return null
  return {
    closeDaysGrunnlinje: r.close_days_grunnlinje,
    closeDaysPuls: r.close_days_puls,
    reminderDay: r.reminder_day,
    finalReminder: r.final_reminder,
    quietHours: r.quiet_hours,
    commentPolicy: r.comment_policy,
    allowDialogue: r.allow_dialogue,
    extras: r.extras,
    extrasOffReason: r.extras_off_reason,
    updatedAt: r.updated_at,
  }
}

const LogRow = z.object({ id: z.number(), changed_at: z.string(), change: z.record(z.string(), z.unknown()) })
export type DefaultsChange = { id: number; at: string; keys: string[] }

/** The last changes to the standard, newest first: when, and which settings. */
export async function getDefaultsLog(orgId: string, limit = 5): Promise<DefaultsChange[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('survey_defaults_log')
    .select('id, changed_at, change')
    .eq('org_id', orgId)
    .order('changed_at', { ascending: false })
    .limit(limit)
  if (readFailed('getDefaultsLog', error, data)) return []
  const parsed = z.array(LogRow).safeParse(data)
  if (parseFailed('getDefaultsLog', parsed)) return []
  return parsed.data.map((r) => ({ id: r.id, at: r.changed_at, keys: Object.keys(r.change) }))
}

/** The organisation's QR entry code, or null before a daglig leder has made one. */
export async function getEntryCode(orgId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from('entry_codes').select('code').eq('org_id', orgId).limit(1)
  if (readFailed('getEntryCode', error, data)) return null
  const parsed = z.array(z.object({ code: z.string() })).safeParse(data)
  if (parseFailed('getEntryCode', parsed)) return null
  return parsed.data[0]?.code ?? null
}

/**
 * Who the survey can reach, as counts only — never whose address (the reasoning of
 * getSmsReach, lib/settings/read.ts). `email` and `phone` are what the register holds;
 * whether a phone counts depends on SMS being on, which the caller knows.
 */
export async function getReach(): Promise<{ total: number; email: number; phoneOnly: number; neither: number }> {
  const supabase = await createClient()
  const active = () =>
    supabase.schema('app').from('employees').select('id', { count: 'exact', head: true }).eq('active', true)
  const [total, email, phoneOnly, neither] = await Promise.all([
    active(),
    active().not('email', 'is', null),
    active().is('email', null).not('phone', 'is', null),
    active().is('email', null).is('phone', null),
  ])
  return { total: total.count ?? 0, email: email.count ?? 0, phoneOnly: phoneOnly.count ?? 0, neither: neither.count ?? 0 }
}

/** The daglig leder's greeting in the invitation (0099, P1-1); empty when none is written */
export async function getInviteGreeting(org: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from('organizations').select('invite_greeting').eq('id', org).maybeSingle()
  if (error) {
    readFailed('getInviteGreeting', error, data)
    return ''
  }
  const parsed = z.object({ invite_greeting: z.string().nullable() }).nullable().safeParse(data)
  return parsed.success ? (parsed.data?.invite_greeting ?? '') : ''
}
