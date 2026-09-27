import { createHash } from 'node:crypto'
import { z } from 'zod'
import { pickWording, WORDINGS, type Wording as WordingKey } from './wording'

/**
 * An industry module file (`modules/<key>/v<major>.json`), parsed.
 *
 * The file is the single source of truth for a module's wording: the seed script writes it
 * into the registry (app.question_modules and its children), and the industry pages read
 * their statements from it by item code. Anything this schema lets through reaches both, so
 * the rules that protect a respondent are checked here and again in the database:
 *
 *   - three statements per factor, because a factor's index is the mean of three and the
 *     release rule decides a factor only where every statement of it is released; a module in
 *     two variants (kunnskap og kontor, 0089) has three to five in each extended factor and
 *     exactly three in each simplified one;
 *   - a minimum of five responses that cannot be lowered, the product's k (app.k_min());
 *   - codes of a fixed shape, so a statement is addressed the same way everywhere.
 */

const SCALE_INDEX = { '1': 0, '2': 25, '3': 50, '4': 75, '5': 100 } as const

const Kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case')
const Semver = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'semver')
const Text = z.string().trim().min(1)

/**
 * Wording (barnehage og skole): one statement, said about «barna» in a kindergarten, «elevene»
 * in a school, and both where an organisation has both. `text` is the «begge» wording; the file
 * carries the other two filled in, never a token, and the organisation's choice decides which a
 * respondent reads. The three are the same statement: one code, scored alike.
 */
const Wording = z.enum(WORDINGS)
const TextVariants = z.object({ barnehage: Text, skole: Text })
/** a NACE code or prefix as the registry prints it: 85, 85.1, 88.911 */
const Nace = z.string().regex(/^\d{2}(\.\d{1,3})?$/, 'NACE prefix, e.g. 85.1')

const Item = z.object({
  id: z.string().regex(/^[A-Z]{2}-[A-Z]{2}-[1-5]$/, 'factor item code, e.g. BA-SF-1'),
  text: Text,
  text_variants: TextVariants.optional(),
  /** a line under the statement for the respondent, e.g. what it does not cover */
  help: Text.optional(),
  reverse: z.boolean(),
  pulse_eligible: z.boolean(),
  /** a module in variants (0089): asked in both, so the simplified index can always be computed */
  core_indicator: z.boolean().optional(),
  /** the method record kept with a statement: what it measures, where it comes from, what to test */
  construct: Text.optional(),
  source: Text.optional(),
  improvement_note: Text.optional(),
})

const ActionSuggestion = z.object({
  type: z.enum(['workshop', 'rutine', 'lederpraksis']),
  title: Text,
  description: Text,
  remeasure_item: z.string(),
})

const FactorKey = z.string().regex(/^[a-z][a-z0-9_]*$/, 'snake_case factor key')

const Factor = z.object({
  id: FactorKey,
  /** a module in variants: FA, MK … for the extended factors */
  code: z.string().regex(/^[A-Z0-9]{2}$/).optional(),
  name: Text,
  /** a worded module's factor name, where it names the children (0083): the respondent reads it above the statements */
  name_variants: TextVariants.optional(),
  summary: Text,
  rationale: Text,
  rationale_sources: z.array(z.string()),
  evidence_strength: Text.optional(),
  legal_basis: z.array(Text),
  /** a module in variants: a factor the organisation may leave out, and one only the extended set has */
  optional: z.boolean().optional(),
  extended_only: z.boolean().optional(),
  items: z.array(Item).min(3).max(5, 'a factor has three statements, an extended one up to five'),
  action_suggestions: z.array(ActionSuggestion).min(1),
})

const VariantKey = z.enum(['forenklet', 'utvidet'])

const CountItem = z.object({
  id: z.string().regex(/^[A-Z]{2}-T-[0-9]+$/, 'count item code, e.g. BA-T-1'),
  text: Text,
  text_variants: TextVariants.optional(),
  /**
   * Ja, Nei, Vet ikke; and, where the question does not apply to everyone, a fourth answer that
   * says so (e.g. «Jobber ikke fast hjemmefra"), which is kept out of the share (0089)
   */
  options: z.array(Text).min(3).max(4),
  why: Text.optional(),
  /** a module in variants: the variants that ask it */
  variants: z.array(VariantKey).min(1).optional(),
})

const Segment = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  text: Text,
  options: z.array(Text).min(2).max(9),
  // a file may say how small categories are merged (`merge_rule`); it is not parsed, as it never
  // was: a published module's hash is of what this schema keeps, and must not move
})

/**
 * A module in two variants (kunnskap og kontor, 0089). `factors` is the extended set, every
 * statement in full; the simplified variant regroups the core statements (`core_indicator`)
 * into factors of its own, by code, so the simplified index can be computed from either.
 */
const SimplifiedFactor = z.object({
  id: FactorKey,
  code: z.string().regex(/^F[0-9]+$/),
  name: Text,
  summary: Text,
  /** the extended factors its statements come from */
  built_from: z.array(FactorKey).min(1),
  items: z.array(z.string()).length(3, 'a simplified factor has exactly three statements'),
  action_suggestions: z.array(ActionSuggestion).min(1),
})
const Simplified = z.object({
  key: z.literal('forenklet'),
  code: Text,
  version: Text,
  name: Text,
  estimated_minutes: z.number().int().min(1).max(30),
  factor_toggles: z.literal(false),
  factors: z.array(SimplifiedFactor).min(1),
  count_items: z.array(z.string()),
  segments: z.array(z.string()),
})
const Extended = z.object({
  key: z.literal('utvidet'),
  code: Text,
  version: Text,
  name: Text,
  estimated_minutes: z.number().int().min(1).max(30),
  factor_toggles: z.boolean(),
  /** the fewest extended factors an organisation may ask */
  min_factors: z.number().int().min(1),
  recommended_factors: z.tuple([z.number().int(), z.number().int()]).optional(),
  /** off until the organisation turns them on */
  default_off: z.array(FactorKey),
  /** asked whatever factors are chosen: the core statements */
  locked_items: z.array(z.string()).min(1),
  count_items: z.array(z.string()),
  segments: z.array(z.string()),
})
const Variants = z.tuple([Simplified, Extended])

/**
 * A translation of the whole module (open decision 4: English for respondents and leaders).
 * It lives in the same file, so the content hash covers it and a published version's English
 * can no more change than its Norwegian. When present it must be complete: a statement asked
 * in Norwegian because its English was forgotten would be a different question.
 */
const Translation = z.object({
  name: Text,
  description: Text,
  scale_labels: z.array(Text).length(5),
  covered_by_core_factors: z.array(Text).optional(),
  factors: z.record(
    z.string(),
    z.object({
      name: Text,
      summary: Text,
      rationale: Text,
      legal_basis: z.array(Text),
      items: z.record(z.string(), Text),
      action_suggestions: z.array(z.object({ title: Text, description: Text })),
    }),
  ),
  count_items: z.record(z.string(), z.object({ text: Text, options: z.array(Text).length(3), why: Text.optional() })),
  segments: z.record(z.string(), z.object({ text: Text, options: z.array(Text) })),
})

const Source = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]*$/), title: Text, url: z.url() })

export const ModuleFile = z
  .object({
    module_id: Kebab,
    version: Semver,
    locale: z.literal('nb-NO'),
    name: Text,
    /** not yet tested on a large sample: the risk bands are provisional (shown as «Foreløpig») */
    validation_status: z.enum(['provisional', 'validated']).optional(),
    description: Text,
    /** the industries it is written for, by NACE prefix; content/industries/meta.ts suggests from these */
    nace_prefixes: z.array(Nace).optional(),
    estimated_minutes: z.number().int().min(1).max(30),
    scale: z.object({
      type: z.literal('likert5'),
      labels: z.array(Text).length(5),
      to_index: z.record(z.string(), z.number()),
    }),
    scoring: z.object({
      factor_index: z.string(),
      risk_bands: z.array(
        z.object({ band: z.string(), min: z.number().optional(), max: z.number().optional() }),
      ),
    }),
    anonymity: z.object({
      min_responses: z.number().int().min(5, 'the minimum is five and cannot be lowered'),
      can_lower: z.literal(false),
      count_items_reported_at: z.literal('organisation_only'),
      segments_require_min: z.number().int().min(5),
      block_differencing: z.literal(true),
    }),
    relation_to_core: z
      .object({
        covered_by_core_factors: z.array(Text),
        core_count_item_reused: z.string().optional(),
        core_count_items_reused: z.array(z.string()).optional(),
        /** core statements the module deliberately does not ask again; each must be the core wording verbatim (tests/unit/modules.test.ts) */
        core_statements_not_repeated: z.array(Text).optional(),
      })
      .optional(),
    /** the module's statements come in wordings; see TextVariants */
    wording: z
      .object({
        modes: z.array(Wording),
        default: Wording,
        /** a NACE prefix suggests a wording: 85.1 a kindergarten, 85.2 a school */
        auto_from_nace: z.record(Nace, z.enum(['barnehage', 'skole'])),
        /** how the file's texts were filled in; kept with the file as its record */
        tokens: z.record(Wording, z.record(z.string(), Text)),
      })
      .optional(),
    factors: z.array(Factor).min(1),
    /** the simplified and the extended set (0089); absent for a module asked one way */
    variants: Variants.optional(),
    count_items: z.array(CountItem),
    segments: z.array(Segment),
    sources: z.array(Source),
    translations: z.object({ en: Translation }).partial().optional(),
  })
  .superRefine((m, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })

    const scale = m.scale.to_index
    const keys = Object.keys(scale).sort()
    if (
      keys.join() !== '1,2,3,4,5' ||
      keys.some((k) => scale[k] !== SCALE_INDEX[k as keyof typeof SCALE_INDEX])
    ) {
      issue(['scale', 'to_index'], 'to_index must map 1..5 to 0/25/50/75/100')
    }

    const codes = new Set<string>()
    const seen = (code: string, path: (string | number)[]) => {
      if (codes.has(code)) issue(path, `duplicate item code ${code}`)
      codes.add(code)
    }
    const factorKeys = new Set<string>()
    const sourceKeys = new Set(m.sources.map((s) => s.key))
    if (sourceKeys.size !== m.sources.length) issue(['sources'], 'duplicate source key')

    m.factors.forEach((f, fi) => {
      if (factorKeys.has(f.id)) issue(['factors', fi, 'id'], `duplicate factor ${f.id}`)
      factorKeys.add(f.id)
      const own = new Set(f.items.map((i) => i.id))
      f.items.forEach((it, ii) => seen(it.id, ['factors', fi, 'items', ii, 'id']))
      // one module prefix per file, and one factor prefix per factor
      const prefixes = new Set(f.items.map((i) => i.id.slice(0, 5)))
      if (prefixes.size !== 1) issue(['factors', fi, 'items'], 'a factor’s items share one code prefix')
      f.action_suggestions.forEach((a, ai) => {
        if (!own.has(a.remeasure_item)) {
          issue(['factors', fi, 'action_suggestions', ai, 'remeasure_item'], `${a.remeasure_item} is not an item of ${f.id}`)
        }
      })
      f.rationale_sources.forEach((k, si) => {
        if (!sourceKeys.has(k)) issue(['factors', fi, 'rationale_sources', si], `unknown source ${k}`)
      })
    })
    m.count_items.forEach((c, ci) => seen(c.id, ['count_items', ci, 'id']))
    const segIds = new Set<string>()
    m.segments.forEach((s, si) => {
      if (segIds.has(s.id)) issue(['segments', si, 'id'], `duplicate segment ${s.id}`)
      segIds.add(s.id)
    })

    for (const [lang, tr] of Object.entries(m.translations ?? {})) {
      if (!tr) continue
      const at = (...p: (string | number)[]) => ['translations', lang, ...p]
      m.factors.forEach((f) => {
        const t = tr.factors[f.id]
        if (!t) return issue(at('factors', f.id), `${lang}: factor ${f.id} is not translated`)
        if (t.legal_basis.length !== f.legal_basis.length) issue(at('factors', f.id, 'legal_basis'), `${lang}: legal basis count differs`)
        if (t.action_suggestions.length !== f.action_suggestions.length) issue(at('factors', f.id, 'action_suggestions'), `${lang}: suggestion count differs`)
        f.items.forEach((i) => {
          if (!t.items[i.id]) issue(at('factors', f.id, 'items', i.id), `${lang}: ${i.id} is not translated`)
        })
        for (const code of Object.keys(t.items)) if (!f.items.some((i) => i.id === code)) issue(at('factors', f.id, 'items', code), `${lang}: ${code} is not an item of ${f.id}`)
      })
      for (const k of Object.keys(tr.factors)) if (!m.factors.some((f) => f.id === k)) issue(at('factors', k), `${lang}: no factor ${k}`)
      m.count_items.forEach((c) => {
        if (!tr.count_items[c.id]) issue(at('count_items', c.id), `${lang}: ${c.id} is not translated`)
      })
      m.segments.forEach((sg) => {
        const t = tr.segments[sg.id]
        if (!t) issue(at('segments', sg.id), `${lang}: segment ${sg.id} is not translated`)
        else if (t.options.length !== sg.options.length) issue(at('segments', sg.id, 'options'), `${lang}: option count differs`)
      })
      if ((tr.covered_by_core_factors?.length ?? 0) !== (m.relation_to_core?.covered_by_core_factors.length ?? 0)) {
        issue(at('covered_by_core_factors'), `${lang}: covered factors differ`)
      }
    }

    if (!m.variants) {
      m.factors.forEach((f, fi) => {
        if (f.items.length !== 3) issue(['factors', fi, 'items'], 'a factor has exactly three statements')
        f.items.forEach((it, ii) => {
          if (!/-[1-3]$/.test(it.id)) issue(['factors', fi, 'items', ii, 'id'], 'factor item code, e.g. BA-SF-1')
          if (it.core_indicator !== undefined) issue(['factors', fi, 'items', ii, 'core_indicator'], 'core_indicator without variants')
        })
        for (const k of ['code', 'optional', 'extended_only'] as const) {
          if (f[k] !== undefined) issue(['factors', fi, k], `${k} without variants`)
        }
      })
      m.count_items.forEach((c, ci) => {
        if (c.variants) issue(['count_items', ci, 'variants'], 'variants without variants')
      })
    } else {
      const [simple, ext] = m.variants
      const all = new Map(m.factors.flatMap((f) => f.items.map((i) => [i.id, i] as const)))
      const core = [...all.values()].filter((i) => i.core_indicator).map((i) => i.id).sort()
      const inSimple = simple.factors.flatMap((f) => f.items)
      const simpleKeys = new Set<string>()
      simple.factors.forEach((f, fi) => {
        const at = (...p: (string | number)[]) => ['variants', 0, 'factors', fi, ...p]
        if (factorKeys.has(f.id) || simpleKeys.has(f.id)) issue(at('id'), `duplicate factor ${f.id}`)
        simpleKeys.add(f.id)
        f.items.forEach((code, ii) => {
          const it = all.get(code)
          if (!it) issue(at('items', ii), `${code} is not a statement of the module`)
          else if (!it.core_indicator) issue(at('items', ii), `${code} is in the simplified set but not a core statement`)
        })
        f.built_from.forEach((k, bi) => {
          if (!factorKeys.has(k)) issue(at('built_from', bi), `unknown factor ${k}`)
        })
        f.action_suggestions.forEach((a, ai) => {
          if (!f.items.includes(a.remeasure_item)) issue(at('action_suggestions', ai, 'remeasure_item'), `${a.remeasure_item} is not an item of ${f.id}`)
        })
      })
      if (new Set(inSimple).size !== inSimple.length) issue(['variants', 0, 'factors'], 'a core statement is in two simplified factors')
      if ([...inSimple].sort().join() !== core.join()) issue(['variants', 0, 'factors'], 'the simplified set is exactly the core statements')
      if ([...ext.locked_items].sort().join() !== core.join()) issue(['variants', 1, 'locked_items'], 'the locked statements are exactly the core statements')
      if (ext.min_factors > m.factors.length) issue(['variants', 1, 'min_factors'], 'more factors required than there are')
      ext.default_off.forEach((k, i) => {
        if (!factorKeys.has(k)) issue(['variants', 1, 'default_off', i], `unknown factor ${k}`)
      })
      if (m.factors.length - ext.default_off.length < ext.min_factors) issue(['variants', 1, 'default_off'], 'the default leaves fewer factors than the minimum')
      const countIds = new Set(m.count_items.map((c) => c.id))
      const segIds = new Set(m.segments.map((s) => s.id))
      m.variants.forEach((v, vi) => {
        v.count_items.forEach((c, i) => {
          if (!countIds.has(c)) issue(['variants', vi, 'count_items', i], `unknown count item ${c}`)
        })
        v.segments.forEach((sg, i) => {
          if (!segIds.has(sg)) issue(['variants', vi, 'segments', i], `unknown segment ${sg}`)
        })
      })
      m.count_items.forEach((c, ci) => {
        const listed = m.variants!.filter((v) => v.count_items.includes(c.id)).map((v) => v.key).sort().join()
        if (!c.variants) issue(['count_items', ci, 'variants'], 'a module in variants names the variants of each count question')
        else if ([...c.variants].sort().join() !== listed) issue(['count_items', ci, 'variants'], `the variants list ${c.id} as ${listed || 'none'}`)
      })
      if (m.wording) issue(['wording'], 'a module in variants has no wordings yet')
      if (m.translations?.en) issue(['translations', 'en'], 'a module in variants has no English translation yet')
    }

    const modulePrefix = new Set([...codes].map((c) => c.slice(0, 2)))
    if (modulePrefix.size > 1) issue(['factors'], 'every item code shares one module prefix')

    // wording: all three or none, every text filled in
    const worded: { path: (string | number)[]; text: string; text_variants?: { barnehage: string; skole: string } }[] = [
      ...m.factors.flatMap((f, fi) => f.items.map((it, ii) => ({ ...it, path: ['factors', fi, 'items', ii] }))),
      ...m.count_items.map((c, ci) => ({ ...c, path: ['count_items', ci] })),
    ]
    if (m.wording) {
      if ([...m.wording.modes].sort().join() !== [...WORDINGS].sort().join()) issue(['wording', 'modes'], 'modes are barnehage, skole and begge')
      m.factors.forEach((f, fi) => {
        for (const t of [f.name, f.name_variants?.barnehage ?? '', f.name_variants?.skole ?? '']) {
          if (/[{}]/.test(t)) issue(['factors', fi, 'name'], `an unfilled token: ${t}`)
        }
      })
      for (const w of worded) {
        if (!w.text_variants) issue([...w.path, 'text_variants'], 'a worded module gives every statement and count question both variants')
        for (const t of [w.text, w.text_variants?.barnehage ?? '', w.text_variants?.skole ?? '']) {
          if (/[{}]/.test(t)) issue(w.path, `an unfilled token: ${t}`)
        }
      }
      // an English translation would need its own wordings, which the file has no place for yet
      if (m.translations?.en) issue(['translations', 'en'], 'a worded module has no English translation yet')
    } else {
      for (const w of worded) if (w.text_variants) issue([...w.path, 'text_variants'], 'text_variants without wording')
      m.factors.forEach((f, fi) => {
        if (f.name_variants) issue(['factors', fi, 'name_variants'], 'name_variants without wording')
      })
    }
  })

export type ModuleFile = z.infer<typeof ModuleFile>

/** A statement's or count question's text in a wording; «begge», and every module without wording, is `text`. */
export const inWording = (x: { text: string; text_variants?: { barnehage: string; skole: string } }, w: WordingKey | null | undefined) =>
  pickWording(x.text, x.text_variants, w)

/** Parse or throw, with every issue listed; for scripts and the build. */
export function parseModule(json: unknown, label = 'module'): ModuleFile {
  const r = ModuleFile.safeParse(json)
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(`${label} is not a valid module file:\n${lines.join('\n')}`)
  }
  return r.data
}

/** JSON with keys sorted at every depth, so the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, walk((v as Record<string, unknown>)[k])]),
      )
    }
    return v
  }
  return JSON.stringify(walk(value))
}

export const contentHash = (m: ModuleFile) => createHash('sha256').update(canonicalJson(m)).digest('hex')

/** The code a module's segment question is stored under: `BA-S-arbeidssted`. */
export const segmentCode = (m: ModuleFile, segmentId: string) => `${modulePrefix(m)}-S-${segmentId}`

/** The two letters every code in a module starts with: `BA`. */
export const modulePrefix = (m: ModuleFile) => m.factors[0]?.items[0]?.id.slice(0, 2) ?? ''

/** 1..5 to the 0–100 index, as the core instrument scores it. */
export const toIndex = (value: number) => (value - 1) * 25

/** A factor's index: the mean of its items' indices, rounded as the core results round it. */
export const factorIndex = (values: number[]) =>
  Math.round(values.reduce((s, v) => s + toIndex(v), 0) / values.length)

export type RiskBand = 'lav' | 'middels' | 'hoy'

/** ≥65 low, 50–64 medium, below 50 high: the bands the core results use. */
export const riskBand = (index: number): RiskBand => (index >= 65 ? 'lav' : index >= 50 ? 'middels' : 'hoy')

export type VariantKey = 'forenklet' | 'utvidet'

/**
 * The extended factors an organisation asks when it has not chosen (0089): all but those the
 * file turns off by default.
 */
export const defaultExtendedFactors = (m: ModuleFile): string[] => {
  const off = new Set(m.variants?.[1].default_off ?? [])
  return m.factors.map((f) => f.id).filter((k) => !off.has(k))
}

/**
 * The statements a variant asks, by code (0089): the simplified set is the core statements; the
 * extended set is the core statements, whatever is chosen, and every statement of the chosen
 * factors. A module without variants asks every statement.
 */
export function askedCodes(m: ModuleFile, variant: VariantKey | null, factors?: string[]): string[] {
  const all = m.factors.flatMap((f) => f.items.map((i) => i.id))
  if (!m.variants || !variant) return all
  if (variant === 'forenklet') return m.variants[0].factors.flatMap((f) => f.items)
  const chosen = new Set(factors ?? defaultExtendedFactors(m))
  const locked = new Set(m.variants[1].locked_items)
  return m.factors.flatMap((f) => f.items.filter((i) => chosen.has(f.id) || locked.has(i.id)).map((i) => i.id))
}
