import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getParticipation, type Participation } from '@/lib/participation/read'

/**
 * The rounds list.
 *
 * Every field the design prints on a row is derived from a real row:
 *
 *   title       kind + year, both columns on app.measurements
 *   audience    app.rounds.audience (0008) — not a caption
 *   questions   app.round_factors x app.statements, plus app.round_extra_questions.
 *               That is 11 x 3 + 4 = 37, which is the "37 spørsmål" the design prints,
 *               and it is counted rather than stated so a round that drops a factor
 *               prints a smaller number without anyone editing a component.
 *   closed      app.rounds.closes_at
 *   rate        public.participation(), the same RPC the Deltakelse card reads
 *
 * `state` is not a column. The schema's status says whether a round is open or closed;
 * the design additionally distinguishes the most recently closed round ("Lukket", with
 * the result as the primary action) from earlier ones ("Arkivert", muted, offering a
 * comparison). That is a position in an ordering, not a property of the row, so it is
 * computed here from the ordering rather than stored — storing it would mean rewriting
 * every earlier round each time one closes.
 *
 * The rows are parsed, not cast. `supabase gen types` only emits the schemas PostgREST
 * exposes by name in its generator, and `app` is not among them even though it is
 * exposed at runtime — so a cast here would be TypeScript asserting a shape nothing
 * checks. An embed that changes arity is then a silently wrong number on a compliance
 * screen, which is exactly what lib/results/read.ts refuses to allow for the RPCs.
 */
const RoundRow = z.object({
  id: z.string(),
  status: z.string(),
  closes_at: z.string().nullable(),
  audience: z.string(),
  // a to-one embed comes back as an object, a to-many as an array
  measurements: z.object({ kind: z.string(), year: z.coerce.number() }),
  round_factors: z.array(
    z.object({ factors: z.object({ statements: z.array(z.object({ ordinal: z.number() })) }) }),
  ),
  round_extra_questions: z.array(z.object({ extra_key: z.string() })),
})

export type RoundState = 'lukket' | 'arkivert'

export interface RoundListItem {
  id: string
  kind: string
  year: number
  /** 'planlagt' | 'apen' | 'lukket' — app.round_status, not a computed label */
  status: string
  audience: string
  questionCount: number
  closesAt: string | null
  state: RoundState
  participation: Participation | null
}

export async function getRounds(): Promise<RoundListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('app')
    .from('rounds')
    .select(
      // `statements` is disambiguated by foreign key on purpose. app.answers also
      // relates factors to statements (many-to-many, via answers_factor_key_fkey and
      // answers_factor_key_ordinal_fkey), so an unqualified embed is rejected as
      // ambiguous — and had PostgREST resolved it the other way, this count would
      // have been answers rather than questions, which is a plausible wrong number
      // rather than an error.
      'id, status, closes_at, audience, measurements!inner(kind, year), round_factors(factors(statements!statements_factor_key_fkey(ordinal))), round_extra_questions(extra_key)',
    )
    .order('closes_at', { ascending: false })

  if (error || !data) return []

  const parsed = z.array(RoundRow).safeParse(data)
  if (!parsed.success) return []

  const rows = parsed.data.map((r, i) => ({
    id: r.id,
    status: r.status,
    kind: r.measurements.kind,
    year: r.measurements.year,
    audience: r.audience,
    // counted, not multiplied by an assumed three: app.statements permits ordinals
    // 1..9, so a factor with a different number of statements changes this total
    questionCount:
      r.round_factors.reduce((n, rf) => n + rf.factors.statements.length, 0) +
      r.round_extra_questions.length,
    closesAt: r.closes_at,
    state: (i === 0 ? 'lukket' : 'arkivert') as RoundState,
  }))

  const participation = await Promise.all(rows.map((r) => getParticipation(r.id)))
  return rows.map((r, i) => ({ ...r, participation: participation[i] ?? null }))
}

/**
 * The factors a round carries, in the instrument's own order.
 *
 * A grunnlinje carries all eleven; a puls carries the few it was defined with. The
 * Resultat screen reads this twice — for the scope line ("alle elleve faktorer" against
 * "2 faktorer i denne pulsen") and for the columns of the group grid, which are the
 * round's factors rather than a subset chosen in a component.
 */
export async function getRoundFactorKeys(roundId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('round_factors')
    .select('factor_key, factors!inner(sort_order)')
    .eq('round_id', roundId)

  if (error || !data) return []
  const parsed = z
    .array(z.object({ factor_key: z.string(), factors: z.object({ sort_order: z.coerce.number() }) }))
    .safeParse(data)
  if (!parsed.success) return []

  return parsed.data
    .sort((a, b) => a.factors.sort_order - b.factors.sort_order)
    .map((r) => r.factor_key)
}
