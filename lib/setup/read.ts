import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * Reading a measurement's setup.
 *
 * Everything Måleoppsett shows about one round: what kind of measurement it is, which
 * factors and questions it carries, who is invited, when the reminder goes and when it
 * closes, and the § 9-2 / § 6-2 record behind it.
 *
 * Two things this reader does NOT do, and the reasons are the same one:
 *
 *   * It does not decide who is invited when no group rows exist. Absence of rows means
 *     every group, and the caller is told `groupIds` is empty rather than handed all four
 *     ids as if somebody had chosen them — because "we did not narrow it" and "we chose
 *     all four" are different facts, and only the first is true.
 *   * It does not compute a closing date from `close_after_days`. The round already has
 *     `closes_at`, which is when it actually closes or closed; `closeAfterDays` is the
 *     setting it was configured with. A round closed early must not rewrite its own
 *     setting, and the setup screen must not print a date that disagrees with Målinger.
 *
 * Rows are parsed rather than cast, for the reason lib/rounds/read.ts gives.
 */
const COMMENT_POLICY = ['hvert', 'lave', 'slutt', 'av'] as const
const CONSULTATION_KIND = ['verneombud_raad', 'droftet_tillitsvalgte'] as const
const EVALUATION_CADENCE = ['hver_6_mnd', 'arlig', 'etter_hver_runde'] as const

export type CommentPolicy = (typeof COMMENT_POLICY)[number]
export type ConsultationKind = (typeof CONSULTATION_KIND)[number]
export type EvaluationCadence = (typeof EVALUATION_CADENCE)[number]

export const COMMENT_POLICIES: readonly CommentPolicy[] = COMMENT_POLICY
export const EVALUATION_CADENCES: readonly EvaluationCadence[] = EVALUATION_CADENCE

const SetupRow = z.object({
  id: z.string(),
  status: z.string(),
  opens_at: z.string().nullable(),
  closes_at: z.string().nullable(),
  audience: z.string(),
  comment_policy: z.enum(COMMENT_POLICY),
  allow_dialogue: z.boolean(),
  reminder_day: z.number().nullable(),
  close_after_days: z.coerce.number(),
  final_reminder: z.boolean(),
  slack_when: z.enum(['paaminn', 'alle']).nullable(),
  sms_when: z.enum(['mangler', 'paaminn', 'alle']).nullable(),
  teams_when: z.enum(['mangler', 'paaminn', 'alle']).nullable(),
  extras_off_reason: z.string().nullable(),
  measurements: z.object({
    id: z.string(),
    kind: z.string(),
    year: z.coerce.number(),
    label: z.string().nullable(),
    evaluation_cadence: z.enum(EVALUATION_CADENCE),
  }),
  round_factors: z.array(z.object({ factor_key: z.string() })),
  round_extra_questions: z.array(z.object({ extra_key: z.string() })),
  round_groups: z.array(z.object({ group_id: z.string() })),
  round_consultations: z.array(
    z.object({
      kind: z.enum(CONSULTATION_KIND),
      confirmed: z.boolean(),
      held_on: z.string().nullable(),
      counterpart: z.string().nullable(),
    }),
  ),
  round_org_questions: z.array(z.object({ question_id: z.string() })),
})

export interface Consultation {
  kind: ConsultationKind
  confirmed: boolean
  heldOn: string | null
  counterpart: string | null
}

export interface RoundSetup {
  id: string
  measurementId: string
  kind: string
  year: number
  status: string
  opensAt: string | null
  closesAt: string | null
  commentPolicy: CommentPolicy
  allowDialogue: boolean
  /** null is the design's "Ingen" — a real choice, not a missing value */
  reminderDay: number | null
  closeAfterDays: number
  /** a second reminder the day before closing (0076) */
  finalReminder: boolean
  /** this round's Slack rule; null follows the organisation's (0185) */
  slackWhen: 'paaminn' | 'alle' | null
  /** this round's SMS rule; null follows the organisation's (0076) */
  smsWhen: 'mangler' | 'paaminn' | 'alle' | null
  /** this round's Teams rule; null follows the organisation's (0176) */
  teamsWhen: 'mangler' | 'paaminn' | 'alle' | null
  /** why the screening was left out of this round, when it was (0076) */
  extrasOffReason: string | null
  evaluationCadence: EvaluationCadence
  factorKeys: string[]
  extraKeys: string[]
  /** empty means every group; see the note above */
  groupIds: string[]
  orgQuestionIds: string[]
  consultations: Consultation[]
}

const SELECT =
  'id, status, opens_at, closes_at, audience, comment_policy, allow_dialogue, reminder_day, slack_when,' +
  ' close_after_days, final_reminder, sms_when, teams_when, extras_off_reason,' +
  ' measurements!inner(id, kind, year, label, evaluation_cadence),' +
  ' round_factors(factor_key), round_extra_questions(extra_key), round_groups(group_id),' +
  ' round_consultations(kind, confirmed, held_on, counterpart),' +
  ' round_org_questions(question_id)'

const shape = (r: z.infer<typeof SetupRow>): RoundSetup => ({
  id: r.id,
  measurementId: r.measurements.id,
  kind: r.measurements.kind,
  year: r.measurements.year,
  status: r.status,
  opensAt: r.opens_at,
  closesAt: r.closes_at,
  commentPolicy: r.comment_policy,
  allowDialogue: r.allow_dialogue,
  reminderDay: r.reminder_day,
  closeAfterDays: r.close_after_days,
  finalReminder: r.final_reminder,
  slackWhen: r.slack_when,
  smsWhen: r.sms_when,
  teamsWhen: r.teams_when,
  extrasOffReason: r.extras_off_reason,
  evaluationCadence: r.measurements.evaluation_cadence,
  factorKeys: r.round_factors.map((f) => f.factor_key),
  extraKeys: r.round_extra_questions.map((x) => x.extra_key),
  groupIds: r.round_groups.map((g) => g.group_id),
  orgQuestionIds: r.round_org_questions.map((q) => q.question_id),
  consultations: r.round_consultations.map((c) => ({
    kind: c.kind,
    confirmed: c.confirmed,
    heldOn: c.held_on,
    counterpart: c.counterpart,
  })),
})

export async function getRoundSetup(roundId: string): Promise<RoundSetup | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('rounds')
    .select(SELECT)
    .eq('id', roundId)
    .maybeSingle()

  if (readFailed('getRoundSetup', error, data)) return null
  const parsed = SetupRow.safeParse(data)
  return parsed.success ? shape(parsed.data) : null
}

/**
 * The setup of the measurement a new round of this kind would follow.
 *
 * Used when the screen is opened to plan something that does not exist yet: the design
 * shows the form already filled in, and what it is filled in with is the last round of
 * that kind rather than a set of defaults written in a component. An organisation that
 * has never run one gets nulls, and the screen falls back to the schema's own defaults —
 * which are the same ones a round would be created with anyway.
 */
export async function getLatestSetupOfKind(kind: string): Promise<RoundSetup | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('rounds')
    .select(SELECT)
    .eq('measurements.kind', kind)
    .order('closes_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (readFailed('getLatestSetupOfKind', error, data)) return null
  const parsed = SetupRow.safeParse(data)
  return parsed.success ? shape(parsed.data) : null
}

const OrgQuestionRow = z.object({ id: z.string(), body: z.string(), kind: z.enum(['skala', 'fritekst']) })
export type OrgQuestion = z.infer<typeof OrgQuestionRow>

/**
 * A round's own questions (0095, D-145), in the order they were written. They belong to the
 * round: the cap of five is per round, and the database's (round_org_questions_cap).
 */
export async function getRoundQuestions(roundId: string): Promise<OrgQuestion[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('round_org_questions')
    .select('org_questions(id, body, kind, created_at)')
    .eq('round_id', roundId)

  if (readFailed('getRoundQuestions', error, data)) return []
  const parsed = z
    .array(z.object({ org_questions: OrgQuestionRow.extend({ created_at: z.string() }) }))
    .safeParse(data)
  if (parseFailed('getRoundQuestions', parsed)) return []
  return parsed.data
    .map((r) => r.org_questions)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map(({ id, body, kind }) => ({ id, body, kind }))
}
