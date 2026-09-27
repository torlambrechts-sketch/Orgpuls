import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'
import { pickWording, WORDINGS, type Wording, type WordingVariants } from './wording'

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
  /** a worded module's rule (0083); null for a module without wordings */
  wording: z.object({ default: z.enum(WORDINGS) }).passthrough().nullable().default(null),
  i18n: z
    .object({ en: z.object({ name: z.string(), description: z.string(), covered_by_core_factors: z.array(z.string()).optional() }).partial() })
    .partial()
    .default({}),
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
  i18n: z
    .object({
      en: z.object({ name: z.string(), summary: z.string(), rationale: z.string(), legal_basis: z.array(z.string()) }).partial(),
      // a worded module's factor name, where it names the children (0083)
      'nb.barnehage': z.object({ name: z.string() }),
      'nb.skole': z.object({ name: z.string() }),
    })
    .partial()
    .default({}),
})
const Locale = z.object({ nb: z.string(), en: z.string().optional() }).passthrough()
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
  i18n: z.object({ en: z.object({ title: z.string(), description: z.string() }).partial() }).partial().default({}),
})
const SourceRow = z.object({ key: z.string(), title: z.string(), url: z.string(), sort: z.coerce.number() })

/** `text` is the «begge» wording of a worded module's statement; `variants` the other two (0083) */
export type ModuleItem = { id: string; code: string; text: string; options: string[]; variants?: WordingVariants }
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
  /** the name's other wordings, where it names the children (0083) */
  nameVariants?: WordingVariants
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
  /** its statements come in wordings (barnehage, skole, begge); see withWording */
  worded: boolean
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
    .select('id, key, version, name, description, status, estimated_minutes, relation_to_core, wording, i18n')
  if (filter.ids) q = q.in('id', filter.ids)
  if (filter.status) q = q.eq('status', filter.status)
  const { data: mods, error } = await q
  if (readFailed('modules', error, mods)) return []
  const parsedMods = z.array(ModuleRow).safeParse(mods)
  if (parseFailed('modules', parsedMods) || !parsedMods.data.length) return []
  const ids = parsedMods.data.map((m) => m.id)

  const [factors, items, actions, sources] = await Promise.all([
    supabase.schema('app').from('module_factors')
      .select('id, module_id, key, name, summary, rationale, rationale_sources, legal_basis, sort, i18n').in('module_id', ids),
    supabase.schema('app').from('module_items')
      .select('id, module_id, factor_id, code, kind, text, options, sort').in('module_id', ids),
    supabase.schema('app').from('module_action_suggestions')
      .select('id, module_id, factor_id, type, title, description, remeasure_item_id, sort, i18n').in('module_id', ids),
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

  // the reader's language where the module has it (0072), Norwegian otherwise
  const en = (await getLocale()) === 'en'
  const pick = (l: z.infer<typeof Locale>) => (en && l.en ? l.en : l.nb)
  const item = (r: z.infer<typeof ItemRow>): ModuleItem => {
    const b = r.text['nb.barnehage']
    const s = r.text['nb.skole']
    return {
      id: r.id,
      code: r.code,
      text: pick(r.text),
      options: (r.options ?? []).map(pick),
      // the wordings are Norwegian: a reader shown the English text has no use for them
      ...(!(en && r.text.en) && typeof b === 'string' && typeof s === 'string' ? { variants: { barnehage: b, skole: s } } : {}),
    }
  }
  const itemById = new Map(it.data.map((r) => [r.id, item(r)]))
  const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort

  return parsedMods.data.map((m) => {
    const mine = it.data.filter((r) => r.module_id === m.id).sort(bySort)
    return {
      id: m.id,
      key: m.key,
      version: m.version,
      name: (en && m.i18n.en?.name) || m.name,
      description: (en && m.i18n.en?.description) || m.description,
      status: m.status,
      estimatedMinutes: m.estimated_minutes,
      worded: m.wording !== null,
      coveredByCore: (en && m.i18n.en?.covered_by_core_factors) || m.relation_to_core.covered_by_core_factors || [],
      factors: f.data
        .filter((r) => r.module_id === m.id)
        .sort(bySort)
        .map((r) => ({
          id: r.id,
          key: r.key,
          name: (en && r.i18n.en?.name) || r.name,
          ...(!(en && r.i18n.en?.name) && r.i18n['nb.barnehage'] && r.i18n['nb.skole']
            ? { nameVariants: { barnehage: r.i18n['nb.barnehage'].name, skole: r.i18n['nb.skole'].name } }
            : {}),
          summary: (en && r.i18n.en?.summary) || r.summary,
          rationale: (en && r.i18n.en?.rationale) || r.rationale,
          rationaleSources: r.rationale_sources,
          legalBasis: (en && r.i18n.en?.legal_basis) || r.legal_basis,
          items: mine.filter((i) => i.factor_id === r.id && i.kind === 'likert5').map(item),
          actions: ac.data
            .filter((a) => a.factor_id === r.id)
            .sort((a, b) => ACTION_ORDER[a.type] - ACTION_ORDER[b.type] || a.sort - b.sort)
            .flatMap((a) => {
              const remeasureItem = itemById.get(a.remeasure_item_id)
              return remeasureItem
                ? [
                    {
                      id: a.id,
                      type: a.type,
                      title: (en && a.i18n.en?.title) || a.title,
                      description: (en && a.i18n.en?.description) || a.description,
                      remeasureItem,
                    },
                  ]
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
  wording: z.enum(WORDINGS).nullable().default(null),
})
export type RoundModule = {
  roundId: string
  moduleId: string
  itemIds: string[]
  includeCountItems: boolean
  includeSegments: boolean
  /** the wording the round asks a worded module in (0083); null for a module without */
  wording: Wording | null
}

/** Which modules the given rounds ask, and which of their statements. */
export const getRoundModules = cache(async (roundIds: string[]): Promise<RoundModule[]> => {
  if (!roundIds.length) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('round_modules')
    .select('round_id, module_id, item_ids, include_count_items, include_segments, wording')
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
    wording: r.wording,
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

/**
 * The organisation's standing choice of question sets (0074): which module keys are on.
 * No row is off — the default.
 */
export const getOrgModuleChoices = cache(async (orgId: string): Promise<Set<string>> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('org_modules')
    .select('module_key, enabled')
    .eq('org_id', orgId)
  if (readFailed('org_modules', error, data)) return new Set()
  const parsed = z.array(z.object({ module_key: z.string(), enabled: z.boolean() })).safeParse(data)
  if (parseFailed('org_modules', parsed)) return new Set()
  return new Set(parsed.data.filter((r) => r.enabled).map((r) => r.module_key))
})

/**
 * The statements an organisation has left out of its grunnlinjer (0088, D-136), per module key, by
 * code: a code outlives a new version of the module.
 */
export const getOrgModuleItemsOff = cache(async (orgId: string): Promise<Map<string, Set<string>>> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('org_module_items_off')
    .select('module_key, item_code')
    .eq('org_id', orgId)
  if (readFailed('org_module_items_off', error, data)) return new Map()
  const parsed = z.array(z.object({ module_key: z.string(), item_code: z.string() })).safeParse(data)
  if (parseFailed('org_module_items_off', parsed)) return new Map()
  const out = new Map<string, Set<string>>()
  for (const r of parsed.data) out.set(r.module_key, (out.get(r.module_key) ?? new Set()).add(r.item_code))
  return out
})

/**
 * A module as a round, or an organisation, asks it: every statement and count question in that
 * wording (0083). A module without wordings, or «begge», comes back as it is.
 */
export function withWording(m: Module, w: Wording | null | undefined): Module {
  if (!m.worded || !w || w === 'begge') return m
  const item = (i: ModuleItem): ModuleItem => ({ ...i, text: pickWording(i.text, i.variants, w) })
  return {
    ...m,
    factors: m.factors.map((f) => ({
      ...f,
      name: pickWording(f.name, f.nameVariants, w),
      items: f.items.map(item),
      actions: f.actions.map((a) => ({ ...a, remeasureItem: item(a.remeasureItem) })),
    })),
    countItems: m.countItems.map(item),
  }
}

/**
 * The wording each worded module is asked in by this organisation (0083): its own choice, or
 * the one its registered industry suggests (`chosen` false).
 */
export type OrgWording = {
  wording: Wording
  chosen: boolean
  /** the organisation chose it, its registered industry suggested it, or it is the module's default */
  source: 'chosen' | 'nace' | 'default'
}

export const getOrgModuleWordings = cache(async (orgId: string): Promise<Map<string, OrgWording>> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('org_module_wordings', { p_org: orgId })
  if (readFailed('org_module_wordings', error, data)) return new Map()
  const parsed = z
    .object({
      ok: z.literal(true),
      wordings: z.record(z.string(), z.object({ wording: z.enum(WORDINGS), chosen: z.boolean(), source: z.enum(['chosen', 'nace', 'default']) })),
    })
    .safeParse(data)
  if (parseFailed('org_module_wordings', parsed)) return new Map()
  return new Map(Object.entries(parsed.data.wordings))
})
