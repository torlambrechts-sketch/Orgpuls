import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseModule } from '@/lib/modules/schema'
import { RegistryFile } from '@/lib/modules/registry-file'
import { INDUSTRY_META } from '@/content/industries/meta'
import { MODULE_KEYS } from '@/content/industries/modules'
import no from '@/messages/no.json'

/**
 * «Arbetstid och återhämtning» (SE-D, D-263): the first module written for a market other than Norway,
 * on AFS 2023:2 2 kap. 9 §. What would go wrong silently:
 *
 *  - the module offered in Norway: a key with no market row is Norway's (0220);
 *  - a respondent language taken out of the survey because one text is missing (X-089, D-133);
 *  - a statement scored backwards: every statement is worded so that agreeing is the better answer,
 *    so none is marked `reverse` (which module_results applies since 0223, D-266);
 *  - a help line shown in bokmål to a Swedish respondent: help lines have no registry id (D-263);
 *  - the module in Norway's industry pages and legal review, which state Norwegian law.
 */
const KEY = 'arbetstid-och-aterhamtning'
const m = parseModule(JSON.parse(readFileSync(`modules/${KEY}/v1.json`, 'utf8')), KEY)
const LANGS = ['sv', 'pl', 'uk', 'lt', 'da'] as const
const registry = (lang: string) => RegistryFile.parse(JSON.parse(readFileSync(`modules/${KEY}/registry/${lang}.json`, 'utf8')))

describe('arbetstid-och-aterhamtning v1', () => {
  it('parses: five factors of three statements, two count questions, provisional, asked one way', () => {
    expect(m.factors).toHaveLength(5)
    expect(m.factors.every((f) => f.items.length === 3)).toBe(true)
    expect(m.count_items.map((c) => c.id)).toEqual(['AA-T-1', 'AA-T-2'])
    expect(m.validation_status).toBe('provisional')
    expect(m.variants).toBeUndefined()
  })

  it('is grounded in AFS 2023:2 2 kap. 9 §, cited as the Swedish source record says', () => {
    for (const f of m.factors) expect(f.legal_basis.some((l) => l.startsWith('AFS 2023:2 2 kap. 9 §')), f.id).toBe(true)
    // never Norwegian law
    expect(JSON.stringify(m)).not.toMatch(/arbeidsmiljøloven|\baml\. §|Arbeidstilsynet/)
  })

  it('reverses no statement and carries no help line', () => {
    for (const f of m.factors) for (const i of f.items) {
      expect(i.reverse, i.id).toBe(false)
      expect(i.help, i.id).toBeUndefined()
    }
  })

  it('names the core instrument word for word', () => {
    const factor = (no as unknown as { factor: Record<string, Record<string, string>> }).factor
    const labels = new Set(Object.values(factor).map((f) => f.label))
    const statements = new Set(Object.values(factor).flatMap((f) => ['s1', 's2', 's3'].map((s) => f[s])))
    for (const n of m.relation_to_core?.covered_by_core_factors ?? []) expect(labels.has(n), n).toBe(true)
    for (const s of m.relation_to_core?.core_statements_not_repeated ?? []) expect(statements.has(s), s).toBe(true)
  })

  it('is complete in English', () => {
    const en = m.translations?.en
    expect(en).toBeDefined()
    for (const f of m.factors) {
      expect(Object.keys(en!.factors[f.id]!.items).sort()).toEqual(f.items.map((i) => i.id).sort())
      expect(en!.factors[f.id]!.action_suggestions).toHaveLength(f.action_suggestions.length)
    }
    expect(Object.keys(en!.count_items).sort()).toEqual(m.count_items.map((c) => c.id).sort())
  })
})

describe('its survey translations (modules/arbetstid-och-aterhamtning/registry)', () => {
  it('ship in every survey language, and in no other', () => {
    const files = readdirSync(`modules/${KEY}/registry`).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
    expect(files).toEqual([...LANGS].sort())
  })

  it.each(LANGS)('in %s, translate every statement, factor name and count question with its options', (lang) => {
    const r = registry(lang)
    expect(r.locale).toBe(lang)
    expect(Object.keys(r.factors).sort()).toEqual(m.factors.map((f) => f.id).sort())
    expect(Object.keys(r.items).sort()).toEqual(m.factors.flatMap((f) => f.items.map((i) => i.id)).sort())
    expect(Object.keys(r.counts).sort()).toEqual(m.count_items.map((c) => c.id).sort())
    for (const c of m.count_items) expect(r.counts[c.id]!.options, c.id).toHaveLength(c.options.length)
    // a translation, not the source: never the bokmål or the English text
    const nb = new Set(m.factors.flatMap((f) => [f.name, ...f.items.map((i) => i.text)]))
    for (const t of [...Object.values(r.factors), ...Object.values(r.items)]) expect(nb.has(t), t).toBe(false)
  })
})

describe('its market', () => {
  it('is Sweden, set by a migration before the module exists anywhere (0220)', () => {
    const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))
    const rows = migrations.filter((f) => /insert into app\.module_markets[^;]*'arbetstid-och-aterhamtning', 'se'/s.test(readFileSync(`supabase/migrations/${f}`, 'utf8')))
    expect(rows).toEqual(['0221_module_arbetstid_market.sql'])
  })

  it('keeps it out of Norway’s industry pages and their legal review', () => {
    expect(INDUSTRY_META.some((i) => i.moduleKey === KEY)).toBe(false)
    expect(MODULE_KEYS).not.toContain(KEY)
    expect(existsSync(`content/industries/${KEY}`)).toBe(false)
  })
})
