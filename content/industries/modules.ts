import barnehageV1 from '@/modules/barnehage-og-skole/v1.json'
import byggV1 from '@/modules/bygg-og-anlegg/v1.json'
import helseV1 from '@/modules/helse-og-omsorg/v1.json'
import kontorV1 from '@/modules/kunnskap-og-kontor/v1.json'
import { parseModule, type ModuleFile } from '@/lib/modules/schema'

/**
 * The module files the public pages read, parsed with the same schema the seed script uses.
 * A page's statements come from here by code, so the site and the survey cannot word them
 * differently. A new version is a new entry.
 *
 * `lang: 'en'` returns the same file with its `translations.en` laid over the Norwegian (D-120):
 * the English page quotes exactly what an English respondent is asked. A file without a
 * translation stays Norwegian, and validate.ts refuses an English page on such a module.
 *
 * modules/<key>/v<major>.json is the version the seed script writes next. A version still
 * published when its file moves on is kept, byte for byte, under modules/<key>/archive/, so a
 * page can go on quoting what respondents are asked until its successor is published.
 */
const FILES: Record<string, unknown> = {
  'bygg-og-anlegg@1.0.0': byggV1,
  // 1.0.1 corrects 1.0.0's legal basis (kap. 23A → 3A, kap. 14 → 23); 1.0.0 was retired on
  // 2026-09-27 and is kept at modules/helse-og-omsorg/archive/ only for its pinned hash
  'helse-og-omsorg@1.0.1': helseV1,
  'barnehage-og-skole@1.0.0': barnehageV1,
  'kunnskap-og-kontor@1.0.0': kontorV1,
}

export type PageLang = 'no' | 'en'

/** Every module version with a file here, as `key@version` (the legal review lists their legal basis) */
export const MODULE_VERSIONS = Object.keys(FILES)

/** Where a version's file is, for the legal review's «source» (a version kept under archive/ has no page) */
export const moduleSource = (key: string, version: string) => `modules/${key}/v${version.split('.')[0]}.json`

export function moduleFile(key: string, version: string, lang: PageLang = 'no'): ModuleFile {
  const raw = FILES[`${key}@${version}`]
  if (!raw) throw new Error(`no module file for ${key}@${version}`)
  const m = parseModule(raw, `${key}@${version}`)
  const tr = lang === 'en' ? m.translations?.en : undefined
  if (!tr) return m
  return {
    ...m,
    name: tr.name,
    description: tr.description,
    scale: { ...m.scale, labels: tr.scale_labels },
    relation_to_core: m.relation_to_core && {
      ...m.relation_to_core,
      covered_by_core_factors: tr.covered_by_core_factors ?? m.relation_to_core.covered_by_core_factors,
    },
    factors: m.factors.map((f) => {
      const t = tr.factors[f.id]
      if (!t) return f
      return {
        ...f,
        name: t.name,
        summary: t.summary,
        rationale: t.rationale,
        legal_basis: t.legal_basis,
        items: f.items.map((i) => ({ ...i, text: t.items[i.id] ?? i.text })),
        action_suggestions: f.action_suggestions.map((a, n) => ({ ...a, ...(t.action_suggestions[n] ?? {}) })),
      }
    }),
    count_items: m.count_items.map((c) => {
      const t = tr.count_items[c.id]
      return t ? { ...c, text: t.text, options: t.options, why: t.why ?? c.why } : c
    }),
    segments: m.segments.map((s) => {
      const t = tr.segments[s.id]
      return t ? { ...s, text: t.text, options: t.options } : s
    }),
  }
}

/** "a, b and c" in the page's language */
export const listOf = (xs: string[], lang: PageLang) =>
  new Intl.ListFormat(lang === 'en' ? 'en-GB' : 'nb-NO', { style: 'long', type: 'conjunction' }).format(xs)

/** A factor as the pages draw it: the module file's own, or a simplified one with its statements resolved (0089) */
export type PageFactor = ModuleFile['factors'][number]

/**
 * The simplified factors of a module in variants (F1–F8), shaped as the pages draw a factor: the
 * statements in full from the extended factors they come from. No rationale or legal basis of
 * their own; those are the extended factors'. Empty for a module asked one way.
 */
export function simplifiedFactors(m: ModuleFile): PageFactor[] {
  const simple = m.variants?.[0]
  if (!simple) return []
  const items = new Map(m.factors.flatMap((f) => f.items.map((i) => [i.id, i] as const)))
  return simple.factors.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    summary: f.summary,
    rationale: '',
    rationale_sources: [],
    legal_basis: [],
    items: f.items.flatMap((c) => {
      const i = items.get(c)
      return i ? [i] : []
    }),
    action_suggestions: f.action_suggestions,
  }))
}

/** The factors a page shows by default: the page's variant's, or all of a module asked one way */
export const pageFactors = (m: ModuleFile, variant?: 'forenklet' | 'utvidet'): PageFactor[] =>
  variant === 'forenklet' && m.variants ? simplifiedFactors(m) : m.factors
