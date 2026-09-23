import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * The instrument, as data.
 *
 * Eleven factors with three statements each, plus the four questions outside the index.
 * Nothing here is a list in a component: adding a factor, or a twelfth statement to
 * one, is a row in app.factors / app.statements and a message key, and this reader and
 * every renderer pick it up without changing.
 *
 * `law_ref` is the one user-facing string that comes from the database rather than from
 * next-intl, and deliberately so. "aml. § 4-3 · § 2A" is a citation of Norwegian
 * statute; it identifies a law that exists under that name and number, so translating
 * it would make it wrong rather than accessible. The surrounding copy is translated.
 *
 * Rows are parsed rather than cast, for the reason lib/rounds/read.ts states: the type
 * generator does not emit the `app` schema, so a cast asserts a shape nothing checks.
 */
const FactorRow = z.object({
  key: z.string(),
  law_ref: z.string(),
  sort_order: z.coerce.number(),
  statements: z.array(z.object({ ordinal: z.coerce.number() })),
})

const ExtraRow = z.object({
  key: z.string(),
  kind: z.string(),
  sort_order: z.coerce.number(),
  org_only: z.boolean(),
})

export interface Factor {
  key: string
  lawRef: string
  /** statement ordinals in order, so the renderer numbers them from the data */
  ordinals: number[]
}

export type ExtraQuestion = z.infer<typeof ExtraRow>

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
export const getFactors = cache(async (): Promise<Factor[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('factors')
    // disambiguated by foreign key: app.answers also relates factors to statements,
    // so an unqualified embed is rejected as ambiguous (PGRST201)
    .select('key, law_ref, sort_order, statements!statements_factor_key_fkey(ordinal)')
    .order('sort_order')

  if (readFailed('getFactors', error, data)) return []
  const parsed = z.array(FactorRow).safeParse(data)
  if (parseFailed('getFactors', parsed)) return []

  return parsed.data.map((f) => ({
    key: f.key,
    lawRef: f.law_ref,
    ordinals: f.statements.map((s) => s.ordinal).sort((a, b) => a - b),
  }))
})

export const getExtraQuestions = cache(async (): Promise<ExtraQuestion[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('extra_questions')
    .select('key, kind, sort_order, org_only')
    .order('sort_order')

  if (readFailed('getExtraQuestions', error, data)) return []
  const parsed = z.array(ExtraRow).safeParse(data)
  return parsed.success ? parsed.data : []
})
