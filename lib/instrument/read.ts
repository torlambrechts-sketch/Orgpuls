import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

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

export async function getFactors(): Promise<Factor[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('factors')
    // disambiguated by foreign key: app.answers also relates factors to statements,
    // so an unqualified embed is rejected as ambiguous (PGRST201)
    .select('key, law_ref, sort_order, statements!statements_factor_key_fkey(ordinal)')
    .order('sort_order')

  if (error || !data) return []
  const parsed = z.array(FactorRow).safeParse(data)
  if (!parsed.success) return []

  return parsed.data.map((f) => ({
    key: f.key,
    lawRef: f.law_ref,
    ordinals: f.statements.map((s) => s.ordinal).sort((a, b) => a - b),
  }))
}

export async function getExtraQuestions(): Promise<ExtraQuestion[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('extra_questions')
    .select('key, kind, sort_order, org_only')
    .order('sort_order')

  if (error || !data) return []
  const parsed = z.array(ExtraRow).safeParse(data)
  return parsed.success ? parsed.data : []
}
