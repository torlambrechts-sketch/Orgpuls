import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * The industry modules, as the product reads them (0067, D-111).
 *
 * The registry is public reference data for published versions, so these reads run as the
 * signed-in user (or anon, for a respondent's form) under RLS. They are flat reads assembled
 * here rather than PostgREST embeds: module_action_suggestions has two relationships to
 * module_items (the re-measure item, and through the factor), and an ambiguous embed is the
 * failure lib/supabase/read.ts describes — a list that silently comes back empty.
 *
 * Rows are parsed, not cast: the type generator does not emit the `app` schema.
 */

const ModuleRow = z.object({
  id: z.string().uuid(),
  key: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(['draft', 'published', 'retired']),
  estimated_minutes: z.coerce.number(),
  relation_to_core: z.object({ covered_by_core_factors: z.array(z.string()).optional() }).passthrough(),
})
const FactorRow = z.object({
  id: z.string().uuid(),
  module_id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  summary: z.string(),
  rationale: z.string(),
  rationale_sources: z.array(z.string()),
  legal_basis: z.array(z.string()),
  sort: z.coerce.number(),
})
const Locale = z.object({ nb: z.string() }).passthrough()
const ItemRow = z.object({
  id: z.string().uuid(),
  module_id: z.string().uuid(),
  factor_id: z.string().uuid().nullable(),
  code: z.string(),
  kind: z.enum(['likert5', 'count', 'segment']),
  text: Locale,
  options: z.array(Locale).nullable(),
  sort: z.coerce.number(),
})
const ActionRow = z.object({
  id: z.string().uuid(),
  factor_id: z.string().uuid(),
  type: z.enum(['workshop', 'rutine', 'lederpraksis']),
  title: z.string(),
  description: z.string(),
  remeasure_item_id: z.string().uuid(),
  sort: z.coerce.number(),
})
const SourceRow = z.object({ key: z.string(), title: z.string(), url: z.string(), sort: z.coerce.number() })

export type ModuleItem = { id: string; code: string; text: string; options: string[] }
export type ModuleAction = {
  id: string
  type: 'workshop' | 'rutine' | 'lederpraksis'
  title: string
  description: string
  remeasureItem: ModuleItem
}
export type ModuleFactor = {
  id: string
  key: string
  name: string
  summary: string
  rationale: string
  rationaleSources: string[]
  legalBasis: string[]
  items: ModuleItem[]
  actions: ModuleAction[]
}
export type Module = {
  id: string
  key: string
  version: string
  name: string
  description: string
  status: 'draft' | 'published' | 'retired'
  estimatedMinutes: number
  coveredByCore: string[]
  factors: ModuleFactor[]
  countItems: ModuleItem[]
  segments: ModuleItem[]
  sources: { key: string; title: string; url: string }[]
}

const ACTION_ORDER = { workshop: 0, rutine: 1, lederpraksis: 2 } as const

/** Semantic version order, newest first: "1.10.0" after "1.9.0". */
const newestFirst = (a: string, b: string) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0)
  return 0
}

async function loadModules(filter: { ids?: string[]; status?: 'published' }): Promise<Module[]> {
  const supabase = await createClient()
  let q = supabase
    .schema('app')
    .from('question_modules')
    .select('id, key, version, name, description, status, estimated_minutes, relation_to_core')
  if (filter.ids) q = q.in('id', filter.ids)
  if (filter.status) q = q.eq('status', filter.status)
  const { data: mods, error } = await q
  if (readFailed('modules', error, mods)) return []
  const parsedMods = z.array(ModuleRow).safeParse(mods)
  if (parseFailed('modules', parsedMods) || !parsedMods.data.length) return []
  const ids = parsedMods.data.map((m) => m.id)

  const [factors, items, actions, sources] = await Promise.all([
    supabase.schema('app').from('module_factors')
      .select('id, module_id, key, name, summary, rationale, rationale_sources, legal_basis, sort').in('module_id', ids),
    supabase.schema('app').from('module_items')
      .select('id, module_id, factor_id, code, kind, text, options, sort').in('module_id', ids),
    supabase.schema('app').from('module_action_suggestions')
      .select('id, module_id, factor_id, type, title, description, remeasure_item_id, sort').in('module_id', ids),
    supabase.schema('app').from('module_sources').select('module_id, key, title, url, sort').in('module_id', ids),
  ])
  if (readFailed('module_factors', factors.error, factors.data)) return []
  if (readFailed('module_items', items.error, items.data)) return []
  if (readFailed('module_action_suggestions', actions.error, actions.data)) return []
  if (readFailed('module_sources', sources.error, sources.data)) return []
  const f = z.array(FactorRow).safeParse(factors.data)
  const it = z.array(ItemRow).safeParse(items.data)
  const ac = z.array(ActionRow.extend({ module_id: z.string().uuid() })).safeParse(actions.data)
  const so = z.array(SourceRow.extend({ module_id: z.string().uuid() })).safeParse(sources.data)
  if (parseFailed('module_factors', f) || parseFailed('module_items', it)) return []
  if (parseFailed('module_action_suggestions', ac) || parseFailed('module_sources', so)) return []

  const item = (r: z.infer<typeof ItemRow>): ModuleItem => ({
    id: r.id,
    code: r.code,
    text: r.text.nb,
    options: (r.options ?? []).map((o) => o.nb),
  })
  const itemById = new Map(it.data.map((r) => [r.id, item(r)]))
  const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort

  return parsedMods.data.map((m) => {
    const mine = it.data.filter((r) => r.module_id === m.id).sort(bySort)
    return {
      id: m.id,
      key: m.key,
      version: m.version,
      name: m.name,
      description: m.description,
      status: m.status,
      estimatedMinutes: m.estimated_minutes,
      coveredByCore: m.relation_to_core.covered_by_core_factors ?? [],
      factors: f.data
        .filter((r) => r.module_id === m.id)
        .sort(bySort)
        .map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          summary: r.summary,
          rationale: r.rationale,
          rationaleSources: r.rationale_sources,
          legalBasis: r.legal_basis,
          items: mine.filter((i) => i.factor_id === r.id && i.kind === 'likert5').map(item),
          actions: ac.data
            .filter((a) => a.factor_id === r.id)
            .sort((a, b) => ACTION_ORDER[a.type] - ACTION_ORDER[b.type] || a.sort - b.sort)
            .flatMap((a) => {
              const remeasureItem = itemById.get(a.remeasure_item_id)
              return remeasureItem
                ? [{ id: a.id, type: a.type, title: a.title, description: a.description, remeasureItem }]
                : []
            }),
        })),
      countItems: mine.filter((i) => i.kind === 'count').map(item),
      segments: mine.filter((i) => i.kind === 'segment').map(item),
      sources: so.data.filter((s) => s.module_id === m.id).sort(bySort).map(({ key, title, url }) => ({ key, title, url })),
    }
  })
}

/**
 * The module versions a new survey can use: the newest published version of each key, and
 * any draft the organisation pilots (0068), which takes the place of its key's published one.
 */
export const getPublishedModules = cache(async (orgId?: string | null): Promise<Module[]> => {
  let pilots: string[] = []
  if (orgId) {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('pilot_module_ids', { p_org: orgId })
    const parsed = z.array(z.string().uuid()).safeParse(data)
    if (!error && parsed.success) pilots = parsed.data
  }
  const [published, drafts] = await Promise.all([
    loadModules({ status: 'published' }),
    pilots.length ? loadModules({ ids: pilots }) : Promise.resolve([] as Module[]),
  ])
  const all = [...drafts, ...published.filter((p) => !drafts.some((d) => d.key === p.key))]
  const latest = new Map<string, Module>()
  for (const m of [...all].sort((a, b) => newestFirst(a.version, b.version))) {
    if (!latest.has(m.key)) latest.set(m.key, m)
  }
  return [...latest.values()].sort((a, b) => a.name.localeCompare(b.name, 'nb'))
})

/** Specific versions, by id — whatever their status, as a round that asked them must say. */
export const getModulesById = cache(async (ids: string[]): Promise<Module[]> =>
  ids.length ? loadModules({ ids }) : [],
)

const RoundModuleRow = z.object({
  round_id: z.string().uuid(),
  module_id: z.string().uuid(),
  item_ids: z.array(z.string().uuid()),
  include_count_items: z.boolean(),
  include_segments: z.boolean(),
})
export type RoundModule = {
  roundId: string
  moduleId: string
  itemIds: string[]
  includeCountItems: boolean
  includeSegments: boolean
}

/** Which modules the given rounds ask, and which of their statements. */
export const getRoundModules = cache(async (roundIds: string[]): Promise<RoundModule[]> => {
  if (!roundIds.length) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('round_modules')
    .select('round_id, module_id, item_ids, include_count_items, include_segments')
    .in('round_id', roundIds)
  if (readFailed('round_modules', error, data)) return []
  const parsed = z.array(RoundModuleRow).safeParse(data)
  if (parseFailed('round_modules', parsed)) return []
  return parsed.data.map((r) => ({
    roundId: r.round_id,
    moduleId: r.module_id,
    itemIds: r.item_ids,
    includeCountItems: r.include_count_items,
    includeSegments: r.include_segments,
  }))
})

/** The organisation's industry code from Brønnøysund, for the module suggestion. */
export const getOrgNaceCode = cache(async (): Promise<string | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from('organizations').select('registry_nace_code').limit(2)
  if (readFailed('organizations.nace', error, data)) return null
  const parsed = z.array(z.object({ registry_nace_code: z.string().nullable() })).safeParse(data)
  if (parseFailed('organizations.nace', parsed) || parsed.data.length !== 1) return null
  return parsed.data[0]?.registry_nace_code ?? null
})
