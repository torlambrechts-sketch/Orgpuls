import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getParticipation, type Participation } from '@/lib/participation/read'
import { parseFailed, readFailed } from '@/lib/supabase/read'

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
 * `state` is not a column, but it is derived FROM the column. The schema's status says
 * whether a round is planned, open or closed; the design additionally distinguishes, among
 * the closed ones, the most recent ("Lukket", with the result as the primary action) from
 * earlier ones ("Arkivert", muted, offering a comparison), and among the planned ones the
 * next ("Neste") from the rest ("Planlagt") — bundle 4249-4267. Those two distinctions are
 * positions within a status, so they are computed here rather than stored: storing them
 * would mean rewriting every earlier round each time one closes.
 *
 * It used to be position in the whole list: row 0 was "Lukket" and every other row
 * "Arkivert", whatever its status. That held only while every round was closed. Once the
 * year wheel planned its first rounds (0020), the farthest-future planned round sorted
 * first by `closes_at` and was labelled "Lukket", the real latest result was "Arkivert",
 * and Oppsett read its "svar sist" figures from a round nobody had been asked. D-46.
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
  opens_at: z.string().nullable(),
  closes_at: z.string().nullable(),
  audience: z.string(),
  // a to-one embed comes back as an object, a to-many as an array
  measurements: z.object({ kind: z.string(), year: z.coerce.number() }),
  round_factors: z.array(
    z.object({ factors: z.object({ statements: z.array(z.object({ ordinal: z.number() })) }) }),
  ),
  round_extra_questions: z.array(z.object({ extra_key: z.string() })),
})

export type RoundState = 'apen' | 'lukket' | 'neste' | 'planlagt' | 'arkivert'

export interface RoundListItem {
  id: string
  kind: string
  year: number
  /** 'planlagt' | 'apen' | 'lukket' — app.round_status, not a computed label */
  status: string
  audience: string
  questionCount: number
  /** when it went out — the statutory report prints "sendt 7. september" */
  opensAt: string | null
  closesAt: string | null
  state: RoundState
  /** a puls's number within its year, by opening date — the design's "Puls 2 · 2025" */
  pulseNo: number | null
  participation: Participation | null
}

/**
 * Pulses numbered within their year, in the order they open — "Puls 1 · 2026", "Puls 2 ·
 * 2026" (bundle 2951-2953). A year can carry several pulses once the wheel runs quarterly,
 * and "Puls 2026" printed three times on one chip row names none of them.
 *
 * Numbered over every round the organisation has, planned ones included, so a puls keeps
 * its number when it opens and closes. A round with no opening date sorts last.
 */
export function numberPulses(
  rounds: { id: string; kind: string; year: number; opensAt: string | null }[],
): Map<string, number> {
  const numbers = new Map<string, number>()
  const perYear = new Map<number, number>()
  const byOpening = rounds
    .filter((r) => r.kind === 'puls')
    .sort((a, b) =>
      a.year !== b.year
        ? a.year - b.year
        : (a.opensAt ?? '\uffff').localeCompare(b.opensAt ?? '\uffff') || a.id.localeCompare(b.id),
    )
  for (const r of byOpening) {
    const n = (perYear.get(r.year) ?? 0) + 1
    perYear.set(r.year, n)
    numbers.set(r.id, n)
  }
  return numbers
}

/**
 * Which state each round is in, from its status and its place among rounds of that status.
 * `rows` must be ordered by `closes_at` descending, which is how `getRounds` reads them.
 */
export function roundStates(
  rows: { id: string; status: string; opensAt: string | null }[],
): Map<string, RoundState> {
  const states = new Map<string, RoundState>()
  const latestClosed = rows.find((r) => r.status === 'lukket')
  const nextPlanned = rows
    .filter((r) => r.status === 'planlagt')
    .sort((a, b) => (a.opensAt ?? '\uffff').localeCompare(b.opensAt ?? '\uffff'))[0]
  for (const r of rows) {
    states.set(
      r.id,
      r.status === 'apen'
        ? 'apen'
        : r.status === 'planlagt'
          ? r.id === nextPlanned?.id
            ? 'neste'
            : 'planlagt'
          : r.id === latestClosed?.id
            ? 'lukket'
            : 'arkivert',
    )
  }
  return states
}

/**
 * Memoised for the length of one request. P2 in docs/CODE_REVIEW_2026-09-23.md.
 *
 * `/rapport` calls fifteen read functions, two of them `getResultsSummary` explicitly, and
 * `getMeasureEffects` then called it again for every round it found — so the most expensive
 * aggregation in the product ran three to five times for the same rounds in a single
 * render, returning identical results each time. Measured in the database on the design
 * fixture: `results_summary` 12.8 ms warm, 37.8 ms cold, over 1 559 buffers.
 *
 * React's `cache()` is per-request and argument-addressable: one render pass makes one call
 * per distinct argument, and nothing survives into the next request, so there is no
 * staleness to reason about. It is not a data cache and must not be confused with one — a
 * second page view recomputes everything.
 */
export type RoundRow = Omit<RoundListItem, 'participation'>

/**
 * The rounds without their participation. `getRounds` asks `participation` once per round,
 * which a screen that shows one round's response rate does not need: Resultater lists
 * eight rounds as chips and prints the rate of one.
 */
export const getRoundRows = cache(async (): Promise<RoundRow[]> => {
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
      'id, status, opens_at, closes_at, audience, measurements!inner(kind, year), round_factors(factors(statements!statements_factor_key_fkey(ordinal))), round_extra_questions(extra_key)',
    )
    .order('closes_at', { ascending: false })

  if (readFailed('getRounds', error, data)) return []

  const parsed = z.array(RoundRow).safeParse(data)
  if (parseFailed('getRounds', parsed)) return []

  const states = roundStates(
    parsed.data.map((r) => ({ id: r.id, status: r.status, opensAt: r.opens_at })),
  )
  const pulses = numberPulses(
    parsed.data.map((r) => ({
      id: r.id,
      kind: r.measurements.kind,
      year: r.measurements.year,
      opensAt: r.opens_at,
    })),
  )

  const rows = parsed.data.map((r) => ({
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
    opensAt: r.opens_at,
    closesAt: r.closes_at,
    state: states.get(r.id) ?? 'arkivert',
    pulseNo: pulses.get(r.id) ?? null,
  }))

  return rows
})

export const getRounds = cache(async (): Promise<RoundListItem[]> => {
  const rows = await getRoundRows()
  const participation = await Promise.all(rows.map((r) => getParticipation(r.id)))
  return rows.map((r, i) => ({ ...r, participation: participation[i] ?? null }))
})

/**
 * The factors a round carries, in the instrument's own order.
 *
 * A grunnlinje carries all eleven; a puls carries the few it was defined with. The
 * Resultat screen reads this twice — for the scope line ("alle elleve faktorer" against
 * "2 faktorer i denne pulsen") and for the columns of the group grid, which are the
 * round's factors rather than a subset chosen in a component.
 */
export const getRoundFactorKeys = cache(async (roundId: string): Promise<string[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('round_factors')
    .select('factor_key, factors!inner(sort_order)')
    .eq('round_id', roundId)

  if (readFailed('getRoundFactorKeys', error, data)) return []
  const parsed = z
    .array(z.object({ factor_key: z.string(), factors: z.object({ sort_order: z.coerce.number() }) }))
    .safeParse(data)
  if (parseFailed('getRoundFactorKeys', parsed)) return []

  return parsed.data
    .sort((a, b) => a.factors.sort_order - b.factors.sort_order)
    .map((r) => r.factor_key)
})

/**
 * The round a new measure hangs off.
 *
 * A measure raised today is a response to the most recent measurement whose results
 * exist — an open round has no result to act on yet, and a planned one has not been
 * asked. The column decides which that is, not a position in a list built elsewhere.
 * Null is a legitimate answer: an organisation that has never closed a round can still
 * record a measure, it just does not cite one.
 */
export const getLatestClosedRoundId = cache(async (): Promise<string | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('rounds')
    .select('id')
    .eq('status', 'lukket')
    .order('closes_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (readFailed('getLatestClosedRoundId', error, data)) return null
  const parsed = z.object({ id: z.string() }).safeParse(data)
  return parsed.success ? parsed.data.id : null
})

/**
 * The pulse numbers alone, for screens that name a round but do not list them — Tiltak and
 * Samtaler label a measure or a thread with the round it came from. `getRounds` would do,
 * but it calls `participation()` once per round, which these screens have no use for.
 */
export const getPulseNumbers = cache(async (): Promise<Map<string, number>> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('rounds')
    .select('id, opens_at, measurements!inner(kind, year)')

  if (readFailed('getPulseNumbers', error, data)) return new Map()
  const parsed = z
    .array(
      z.object({
        id: z.string(),
        opens_at: z.string().nullable(),
        measurements: z.object({ kind: z.string(), year: z.coerce.number() }),
      }),
    )
    .safeParse(data)
  if (parseFailed('getPulseNumbers', parsed)) return new Map()

  return numberPulses(
    parsed.data.map((r) => ({
      id: r.id,
      kind: r.measurements.kind,
      year: r.measurements.year,
      opensAt: r.opens_at,
    })),
  )
})
