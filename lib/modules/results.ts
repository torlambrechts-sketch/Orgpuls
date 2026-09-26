import 'server-only'
import { getLocale } from 'next-intl/server'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * A closed round's industry module, as `module_results` and `get_count_item_totals` (0070)
 * return it. Both apply k in the database; nothing here computes from answers. A value the
 * RPC withheld is null and the screen draws "–" over it, never a number.
 *
 * The RPCs return the English beside the Norwegian (0072); the reader picks by locale and
 * falls back to Norwegian wherever a translation is missing, so the screens never branch.
 */
const En = z.string().nullish()
const EnList = z.array(z.string().nullable()).nullish()
const pickList = (nb: string[], en: (string | null)[] | null | undefined, on: boolean) =>
  on && en && en.length === nb.length && en.every((x) => x) ? (en as string[]) : nb
const Band = z.enum(['lav', 'middels', 'hoy']).nullable()
const Factor = z.object({
  key: z.string(),
  name: z.string(),
  summary: z.string(),
  rationale: z.string(),
  rationale_sources: z.array(z.string()),
  legal_basis: z.array(z.string()),
  index: z.coerce.number().nullable(),
  band: Band,
  items: z.array(z.object({ code: z.string(), text: z.string(), text_en: En, index: z.coerce.number().nullable() })),
  en: z
    .object({ name: En, summary: En, rationale: En, legal_basis: z.array(z.string()).nullish() })
    .nullish(),
})
const Group = z.object({
  group_name: z.string(),
  n: z.coerce.number(),
  status: z.string(),
  factors: z.array(z.object({ key: z.string(), index: z.coerce.number().nullable(), band: Band })).nullable(),
})
const Results = z.object({
  threshold: z.coerce.number(),
  scope: z.enum(['org', 'groups']),
  modules: z.array(
    z.object({ key: z.string(), version: z.string(), name: z.string(), name_en: En, factors: z.array(Factor), groups: z.array(Group) }),
  ),
})
const Totals = z.object({
  threshold: z.coerce.number(),
  items: z.array(
    z.object({
      code: z.string(),
      text: z.string(),
      text_en: En,
      options: z.array(z.string()),
      options_en: EnList,
      suppressed: z.boolean(),
      n_total: z.coerce.number().nullable(),
      n_ja: z.coerce.number().nullable(),
      n_nei: z.coerce.number().nullable(),
      n_vet_ikke: z.coerce.number().nullable(),
    }),
  ),
})

export type ModuleResults = z.infer<typeof Results>
export type CountTotals = z.infer<typeof Totals>

function localise(r: ModuleResults, en: boolean): ModuleResults {
  if (!en) return r
  return {
    ...r,
    modules: r.modules.map((m) => ({
      ...m,
      name: m.name_en || m.name,
      factors: m.factors.map((f) => ({
        ...f,
        name: f.en?.name || f.name,
        summary: f.en?.summary || f.summary,
        rationale: f.en?.rationale || f.rationale,
        legal_basis: f.en?.legal_basis?.length === f.legal_basis.length ? f.en.legal_basis : f.legal_basis,
        items: f.items.map((i) => ({ ...i, text: i.text_en || i.text })),
      })),
    })),
  }
}

export const getModuleResults = cache(async (roundId: string): Promise<ModuleResults | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('module_results', { p_round: roundId })
  if (readFailed('module_results', error, data)) return null
  if (z.object({ error: z.string() }).safeParse(data).success) return null
  const parsed = Results.safeParse(data)
  if (parseFailed('module_results', parsed)) return null
  return localise(parsed.data, (await getLocale()) === 'en')
})

/** Organisation-level counts; null for a reader without the house's view (the RPC refuses). */
export const getCountTotals = cache(async (roundId: string): Promise<CountTotals | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_count_item_totals', { p_round_id: roundId })
  if (readFailed('get_count_item_totals', error, data)) return null
  if (z.object({ error: z.string() }).safeParse(data).success) return null
  const parsed = Totals.safeParse(data)
  if (parseFailed('get_count_item_totals', parsed)) return null
  const en = (await getLocale()) === 'en'
  return {
    ...parsed.data,
    items: parsed.data.items.map((i) => ({
      ...i,
      text: (en && i.text_en) || i.text,
      options: pickList(i.options, i.options_en, en),
    })),
  }
})
