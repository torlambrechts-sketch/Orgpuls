import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Reading tiltak.
 *
 * A measure is the organisation's record of what it decided to do about a factor, and
 * unlike a result it is not anonymous data — it has an owner, a deadline and a legal
 * basis, and § 3-1 bokstav c is the reason it is kept at all. So this is an ordinary
 * org-scoped read through RLS rather than an RPC: `measure_read` admits any member of
 * the organisation, and there is nothing here to withhold per cell.
 *
 * Rows are parsed rather than cast, for the reason lib/rounds/read.ts gives: the type
 * generator does not emit the `app` schema, so a cast would assert a shape nothing
 * checks — and an embed that changes arity would become a missing owner rather than an
 * error.
 *
 * Two fields fall back rather than being restated on every row: `law_ref` is the
 * measure's own citation when it has one and the factor's otherwise, and the step order
 * is the enum's, not a number stored beside it.
 */
const STEPS = [
  'foreslatt',
  'besluttet',
  'pagar',
  'gjennomfort',
  'effekt_malt',
  'lukket',
] as const

export type MeasureStep = (typeof STEPS)[number]
export type MeasureBucket = 'apne' | 'frist' | 'effekt' | 'lukket'

/** The step's position, which is what "before the effect was measured" means. */
export const stepIndex = (step: MeasureStep) => STEPS.indexOf(step)
export const STEP_KEYS: readonly MeasureStep[] = STEPS

const MeasureRow = z.object({
  id: z.string(),
  factor_key: z.string(),
  law_ref: z.string().nullable(),
  title: z.string(),
  goal: z.string().nullable(),
  due_date: z.string().nullable(),
  completed_on: z.string().nullable(),
  step: z.enum(STEPS),
  kind: z.enum(['kollektivt', 'individuelt']),
  created_at: z.string(),
  factors: z.object({ law_ref: z.string() }),
  employees: z.object({ id: z.string(), full_name: z.string() }).nullable(),
  rounds: z
    .object({ id: z.string(), measurements: z.object({ kind: z.string(), year: z.coerce.number() }) })
    .nullable(),
})

export interface Measure {
  id: string
  factorKey: string
  /** the measure's own legal basis, or the factor's when it has none */
  lawRef: string
  title: string
  goal: string | null
  dueDate: string | null
  completedOn: string | null
  step: MeasureStep
  owner: { id: string; name: string } | null
  round: { id: string; kind: string; year: number } | null
  /** past its deadline and not yet carried out — derived, never stored */
  late: boolean
  bucket: MeasureBucket
}

/**
 * The four buckets the screen filters by, from the design (bundle line 4355).
 *
 * Order matters: closed wins over late, because a measure that was finished after its
 * deadline is finished, not overdue. And "late" only applies before the work is done —
 * after that the deadline has stopped being the thing anyone is waiting for.
 */
function bucketOf(step: MeasureStep, late: boolean): MeasureBucket {
  const i = stepIndex(step)
  if (i >= stepIndex('lukket')) return 'lukket'
  if (late) return 'frist'
  if (i >= stepIndex('gjennomfort')) return 'effekt'
  return 'apne'
}

export async function getMeasures(): Promise<Measure[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('measures')
    .select(
      'id, factor_key, law_ref, title, goal, due_date, completed_on, step, kind, created_at,' +
        ' factors(law_ref), employees(id, full_name), rounds(id, measurements(kind, year))',
    )
    // the order they were decided in; see the fixture's note on created_at
    .order('created_at', { ascending: true })

  if (error || !data) return []
  const parsed = z.array(MeasureRow).safeParse(data)
  if (!parsed.success) return []

  // "today" in the organisation's own zone: a deadline is a date, not an instant, and
  // whether it has passed must not depend on where the server happens to run.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date())

  return parsed.data.map((m) => {
    const late = m.due_date !== null && m.due_date < today && stepIndex(m.step) < stepIndex('gjennomfort')
    return {
      id: m.id,
      factorKey: m.factor_key,
      lawRef: m.law_ref ?? m.factors.law_ref,
      title: m.title,
      goal: m.goal,
      dueDate: m.due_date,
      completedOn: m.completed_on,
      step: m.step,
      owner: m.employees ? { id: m.employees.id, name: m.employees.full_name } : null,
      round: m.rounds
        ? { id: m.rounds.id, kind: m.rounds.measurements.kind, year: m.rounds.measurements.year }
        : null,
      late,
      bucket: bucketOf(m.step, late),
    }
  })
}
