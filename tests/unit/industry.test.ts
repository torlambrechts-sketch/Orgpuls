import { describe, expect, it } from 'vitest'
import { citeOrder, splitCites } from '@/content/industries/cites'
import { INDUSTRIES, liveQuestionPages, pageIn } from '@/content/industries'
import { LANDINGS } from '@/content/industries/landing'
import { listOf, moduleFile } from '@/content/industries/modules'
import { assertIndustries, problemsOf, twinProblems } from '@/content/industries/validate'
import { byggOgAnlegg } from '@/content/industries/bygg-og-anlegg'
import { byggOgAnleggEn } from '@/content/industries/bygg-og-anlegg.en'
import no from '@/messages/no.json'

/**
 * What an industry entry still is (D-213): the menu name, the launch per language, the module and the
 * question page. The page at the address is the landing template (tests/unit/industry-landing).
 */
describe('industry entries', () => {
  it('are valid: a module file each, English only on a translated module, launched as the landing page is', () => {
    expect(() => assertIndustries()).not.toThrow()
  })
  it('has one registry entry per slug, and one landing page for each', () => {
    expect(new Set(INDUSTRIES.map((i) => i.slug)).size).toBe(INDUSTRIES.length)
    expect(LANDINGS.map((l) => l.slug).sort()).toEqual(INDUSTRIES.map((i) => i.slug).sort())
  })
  it('launches each language as its landing page does, so the menu, the sitemap and the question page follow the page', () => {
    for (const l of LANDINGS) {
      const entry = INDUSTRIES.find((i) => i.slug === l.slug) ?? null
      for (const lang of ['no', 'en'] as const) expect(!!pageIn(entry, lang)?.launched, `${l.slug} ${lang}`).toBe(l.live[lang])
    }
    const off = { ...byggOgAnleggEn, launched: false }
    expect(problemsOf(off, 'en')).toContain('launched false but the landing page is live true')
  })
  it('refuses a module the files do not have, a question page without a module and a twin on another module', () => {
    const untranslated = { ...byggOgAnleggEn, module: { key: 'finnes-ikke' } }
    expect(problemsOf(untranslated, 'en')).toContain('no module file for finnes-ikke')
    const noModule = { ...byggOgAnlegg, module: undefined }
    expect(problemsOf(noModule)).toContain('a question page without a module')
    expect(twinProblems(byggOgAnlegg, { ...byggOgAnleggEn, module: { key: 'handel' } })).toContain('English page is on another module')
  })
  it('a question page is live where its landing page is, an English one on a module with its English translation', () => {
    for (const lang of ['no', 'en'] as const) {
      expect(liveQuestionPages(lang).sort(), lang).toEqual(LANDINGS.filter((l) => l.live[lang]).map((l) => l.slug).sort())
    }
    for (const slug of liveQuestionPages('en')) expect(moduleFile(slug).translations?.en, slug).toBeDefined()
  })
  it('keeps the older template only as the legal record: no entry carries its words (D-213)', () => {
    const retired = ['seo', 'hero', 'challengesIntro', 'challenges', 'moduleOverview', 'loop', 'faq', 'cta', 'related', 'extraSources', 'sourcesFromFactors']
    for (const i of INDUSTRIES) for (const p of [i.page, i.pageEn]) for (const k of retired) expect(Object.keys(p ?? {}), `${i.slug} ${k}`).not.toContain(k)
  })
  it('numbers cites in reading order and groups adjacent ones', () => {
    expect(citeOrder(['a{{cite:x}} b{{cite:y}}{{cite:x}}', 'c{{cite:z}}'])).toEqual(['x', 'y', 'z'])
    expect(splitCites('Tekst.{{cite:a}}{{cite:b}} Mer.')).toEqual([{ text: 'Tekst.' }, { cites: ['a', 'b'] }, { text: ' Mer.' }])
  })
  it('joins a list in the page language', () => {
    expect(listOf(['a', 'b', 'c'], 'no')).toBe('a, b og c')
    expect(listOf(['a', 'b', 'c'], 'en')).toBe('a, b and c')
  })
  it('the English module file is the survey in English, factor for factor (D-120)', () => {
    const en = moduleFile('bygg-og-anlegg', 'en')
    const nb = moduleFile('bygg-og-anlegg')
    expect(en.factors.map((f) => f.id)).toEqual(nb.factors.map((f) => f.id))
    expect(en.factors[0]!.items.map((i) => i.text)).not.toEqual(nb.factors[0]!.items.map((i) => i.text))
    expect(en.scale.labels).toHaveLength(5)
    expect(en.count_items[0]!.options).toEqual(['Yes', 'No', "Don't know"])
  })
  it('the modules name the core instrument word for word (D-122)', () => {
    const factor = (no as unknown as { factor: Record<string, Record<string, string>> }).factor
    const labels = new Set(Object.values(factor).map((f) => f.label))
    const statements = new Set(Object.values(factor).flatMap((f) => ['s1', 's2', 's3'].map((s) => f[s])))
    for (const key of ['helse-og-omsorg', 'bygg-og-anlegg', 'handel', 'barnehage-og-skole', 'kunnskap-og-kontor']) {
      const m = moduleFile(key)
      for (const n of m.relation_to_core?.covered_by_core_factors ?? []) expect(labels.has(n), `${key}: ${n}`).toBe(true)
      for (const s of m.relation_to_core?.core_statements_not_repeated ?? []) expect(statements.has(s), `${key}: ${s}`).toBe(true)
    }
  })
})
