import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * The report's last three sections.
 *
 * Section 6 compares a measure's factor across two rounds; section 7 counts the screening
 * answers; section 8 lists what was shared and what was trained. Each was unprintable
 * until migration 0023, and each is unprintable *again* the moment its rows are missing —
 * so every reader here returns an empty result rather than a default, and the document
 * says what is absent instead of inventing a sentence.
 */

/* --------------------------------------------------------------- 6. effect */

const EffectRow = z.object({
  id: z.string(),
  factor_key: z.string(),
  title: z.string(),
  effect_note: z.string().nullable(),
  round_id: z.string().nullable(),
  effect_round_id: z.string().nullable(),
})

export interface MeasureEffect {
  id: string
  factorKey: string
  title: string
  note: string | null
  /** the factor's index in the round the measure was raised from */
  before: number | null
  /** and in the round chosen as the evidence */
  after: number | null
  fromYear: number | null
  toYear: number | null
}

/**
 * Both indices come from `results_summary`, the same k-gated RPC every other figure in
 * the document comes from. A factor the gate withheld in either round yields null on that
 * side, and the section prints the measure without a comparison rather than half of one:
 * "steg fra 39 til —" is not a sentence about an effect.
 */
export async function getMeasureEffects(): Promise<MeasureEffect[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('app')
    .from('measures')
    .select('id, factor_key, title, effect_note, round_id, effect_round_id')
    .not('effect_round_id', 'is', null)
    .order('created_at')

  if (readFailed('getMeasureEffects', error, data)) return []
  const parsed = z.array(EffectRow).safeParse(data)
  if (parseFailed('getMeasureEffects', parsed)) return []

  const roundIds = [
    ...new Set(parsed.data.flatMap((m) => [m.round_id, m.effect_round_id]).filter(Boolean)),
  ] as string[]

  const Summary = z.object({
    status: z.string(),
    factors: z.array(z.object({ key: z.string(), index: z.coerce.number() })).optional(),
  })

  const indices = new Map<string, Map<string, number>>()
  const years = new Map<string, number>()

  await Promise.all(
    roundIds.map(async (id) => {
      const [{ data: summary }, { data: round }] = await Promise.all([
        supabase.rpc('results_summary', { p_round: id }),
        supabase
          .schema('app')
          .from('rounds')
          .select('measurements(year)')
          .eq('id', id)
          .maybeSingle(),
      ])

      const s = Summary.safeParse(summary)
      if (s.success && s.data.status === 'ok' && s.data.factors) {
        indices.set(id, new Map(s.data.factors.map((f) => [f.key, f.index])))
      }

      const y = z
        .object({ measurements: z.object({ year: z.coerce.number() }) })
        .safeParse(round)
      if (y.success) years.set(id, y.data.measurements.year)
    }),
  )

  return parsed.data.map((m) => ({
    id: m.id,
    factorKey: m.factor_key,
    title: m.title,
    note: m.effect_note,
    before: (m.round_id ? (indices.get(m.round_id)?.get(m.factor_key) ?? null) : null),
    after: (m.effect_round_id ? (indices.get(m.effect_round_id)?.get(m.factor_key) ?? null) : null),
    fromYear: (m.round_id ? (years.get(m.round_id) ?? null) : null),
    toYear: (m.effect_round_id ? (years.get(m.effect_round_id) ?? null) : null),
  }))
}

/* ------------------------------------------------------------ 7. screening */

const Screening = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    n: z.coerce.number(),
    threshold: z.coerce.number(),
    questions: z.array(
      z.object({
        key: z.string(),
        answered: z.coerce.number(),
        options: z.array(z.object({ ordinal: z.coerce.number(), n: z.coerce.number() })),
      }),
    ),
  }),
  z.object({
    status: z.literal('insufficient_data'),
    n: z.coerce.number(),
    threshold: z.coerce.number(),
  }),
])

export type ScreeningCounts = z.infer<typeof Screening>

/**
 * Null means "nothing to print", never "nothing happened". The RPC merges the
 * no-membership and no-such-round branches the way every other reader here does.
 */
export async function getScreeningCounts(roundId: string): Promise<ScreeningCounts | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('screening_counts', { p_round: roundId })
  if (callFailed('getScreeningCounts', error)) return null
  const parsed = Screening.safeParse(data)
  return parsed.success ? parsed.data : null
}

/* -------------------------------------------------- 8. information, training */

const AUDIENCES = ['alle_ansatte', 'verneombud', 'tillitsvalgte', 'ledere', 'amu'] as const
const CHANNELS = ['allmote', 'skriftlig', 'epost', 'mote', 'intranett'] as const

const InformationRow = z.object({
  id: z.string(),
  audience: z.enum(AUDIENCES),
  channel: z.enum(CHANNELS),
  held_on: z.string(),
  note: z.string().nullable(),
})

const TrainingRow = z.object({
  id: z.string(),
  title: z.string(),
  audience: z.enum(AUDIENCES),
  held_on: z.string(),
  next_due: z.string().nullable(),
  note: z.string().nullable(),
})

export type InformationEvent = z.infer<typeof InformationRow>
export type Training = z.infer<typeof TrainingRow>

export async function getInformation(roundId: string): Promise<InformationEvent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('round_information')
    .select('id, audience, channel, held_on, note')
    .eq('round_id', roundId)
    .order('held_on')

  if (readFailed('getInformation', error, data)) return []
  const parsed = z.array(InformationRow).safeParse(data)
  return parsed.success ? parsed.data : []
}

export async function getTrainings(): Promise<Training[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('trainings')
    .select('id, title, audience, held_on, next_due, note')
    .order('held_on', { ascending: false })

  if (readFailed('getTrainings', error, data)) return []
  const parsed = z.array(TrainingRow).safeParse(data)
  return parsed.success ? parsed.data : []
}

/* ------------------------------------------------------- the signature block */

/**
 * Who signs.
 *
 * The design hard-codes three names. Here they come from `duty_role` on the register —
 * the column 0021 added for exactly this: § 6-2 and § 9-2 require the verneombud and the
 * tillitsvalgte to have been involved, and a signature block that names them is the
 * document's evidence of it.
 *
 * An organisation that has recorded nobody gets no signature block, rather than three
 * blank lines over invented titles.
 */
const SIGNER_ROLES = ['daglig_leder', 'verneombud', 'tillitsvalgt'] as const
export type SignerRole = (typeof SIGNER_ROLES)[number]

export interface Signer {
  name: string
  role: SignerRole
}

export async function getSigners(): Promise<Signer[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('employees')
    .select('full_name, duty_role')
    .eq('active', true)
    .in('duty_role', [...SIGNER_ROLES])
    .order('full_name')

  if (readFailed('getSigners', error, data)) return []
  const parsed = z
    .array(z.object({ full_name: z.string(), duty_role: z.enum(SIGNER_ROLES) }))
    .safeParse(data)
  if (parseFailed('getSigners', parsed)) return []

  // the act's own order: the undertaking signs, then the two it must have involved
  const order = (r: SignerRole) => SIGNER_ROLES.indexOf(r)
  return parsed.data
    .map((e) => ({ name: e.full_name, role: e.duty_role }))
    .sort((a, b) => order(a.role) - order(b.role))
}
