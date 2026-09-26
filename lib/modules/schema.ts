import { createHash } from 'node:crypto'
import { z } from 'zod'

/**
 * An industry module file (`modules/<key>/v<major>.json`), parsed.
 *
 * The file is the single source of truth for a module's wording: the seed script writes it
 * into the registry (app.question_modules and its children), and the industry pages read
 * their statements from it by item code. Anything this schema lets through reaches both, so
 * the rules that protect a respondent are checked here and again in the database:
 *
 *   - three statements per factor, because a factor's index is the mean of three and the
 *     release rule decides a factor only where every statement of it is released;
 *   - a minimum of five responses that cannot be lowered, the product's k (app.k_min());
 *   - codes of a fixed shape, so a statement is addressed the same way everywhere.
 */

const SCALE_INDEX = { '1': 0, '2': 25, '3': 50, '4': 75, '5': 100 } as const

const Kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case')
const Semver = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'semver')
const Text = z.string().trim().min(1)

const Item = z.object({
  id: z.string().regex(/^[A-Z]{2}-[A-Z]{2}-[1-3]$/, 'factor item code, e.g. BA-SF-1'),
  text: Text,
  reverse: z.boolean(),
  pulse_eligible: z.boolean(),
})

const ActionSuggestion = z.object({
  type: z.enum(['workshop', 'rutine', 'lederpraksis']),
  title: Text,
  description: Text,
  remeasure_item: z.string(),
})

const Factor = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/, 'snake_case factor key'),
  name: Text,
  summary: Text,
  rationale: Text,
  rationale_sources: z.array(z.string()),
  legal_basis: z.array(Text),
  items: z.array(Item).length(3, 'a factor has exactly three statements'),
  action_suggestions: z.array(ActionSuggestion).min(1),
})

const CountItem = z.object({
  id: z.string().regex(/^[A-Z]{2}-T-[0-9]+$/, 'count item code, e.g. BA-T-1'),
  text: Text,
  options: z.array(Text).length(3),
  why: Text.optional(),
})

const Segment = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  text: Text,
  options: z.array(Text).min(2).max(9),
})

const Source = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]*$/), title: Text, url: z.url() })

export const ModuleFile = z
  .object({
    module_id: Kebab,
    version: Semver,
    locale: z.literal('nb-NO'),
    name: Text,
    description: Text,
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
      })
      .optional(),
    factors: z.array(Factor).min(1),
    count_items: z.array(CountItem),
    segments: z.array(Segment),
    sources: z.array(Source),
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

    const modulePrefix = new Set([...codes].map((c) => c.slice(0, 2)))
    if (modulePrefix.size > 1) issue(['factors'], 'every item code shares one module prefix')
  })

export type ModuleFile = z.infer<typeof ModuleFile>

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
