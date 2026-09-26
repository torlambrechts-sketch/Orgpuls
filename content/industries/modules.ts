import byggV1 from '@/modules/bygg-og-anlegg/v1.json'
import { parseModule, type ModuleFile } from '@/lib/modules/schema'

/**
 * The module files the public pages read, parsed with the same schema the seed script uses.
 * A page's statements come from here by code, so the site and the survey cannot word them
 * differently. A new version is a new entry.
 *
 * `lang: 'en'` returns the same file with its `translations.en` laid over the Norwegian (D-120):
 * the English page quotes exactly what an English respondent is asked. A file without a
 * translation stays Norwegian, and validate.ts refuses an English page on such a module.
 */
const FILES: Record<string, unknown> = {
  'bygg-og-anlegg@1.0.0': byggV1,
}

export type PageLang = 'no' | 'en'

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
