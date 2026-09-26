import { describe, expect, it } from 'vitest'
import { citeOrder, splitCites } from '@/content/industries/cites'
import { INDUSTRIES } from '@/content/industries'
import { moduleFile } from '@/content/industries/modules'
import { assertIndustries, problemsOf, twinProblems } from '@/content/industries/validate'
import { byggOgAnlegg } from '@/content/industries/bygg-og-anlegg'
import { byggOgAnleggEn } from '@/content/industries/bygg-og-anlegg.en'
import { helseOgOmsorg } from '@/content/industries/helse-og-omsorg'
import { helseOgOmsorgEn } from '@/content/industries/helse-og-omsorg.en'
import no from '@/messages/no.json'
import { listOf } from '@/content/industries/modules'

describe('industry pages', () => {
  it('every page is valid: statements, cites, examples', () => {
    expect(() => assertIndustries()).not.toThrow()
  })
  it('refuses a missing item code, a missing cite and an unreviewed launch', () => {
    const broken = structuredClone(byggOgAnlegg)
    broken.challenges[0]!.measuredBy = { kind: 'module', itemCode: 'BA-XX-1' }
    broken.challenges[1]!.body += '{{cite:finnes_ikke}}'
    broken.launched = true
    broken.law.items[0]!.reviewed = false
    const p = problemsOf(broken)
    expect(p.some((x) => x.includes('BA-XX-1'))).toBe(true)
    expect(p.some((x) => x.includes('finnes_ikke'))).toBe(true)
    expect(p.some((x) => x.includes('not reviewed'))).toBe(true)
  })
  it('refuses a core statement the instrument does not have', () => {
    const broken = structuredClone(byggOgAnlegg)
    broken.challenges[7]!.measuredBy = { kind: 'core', factorKey: 'integritet', ordinal: 9 }
    expect(problemsOf(broken).some((x) => x.includes('integritet.s9'))).toBe(true)
  })
  it('quotes the module file verbatim', () => {
    const m = moduleFile('bygg-og-anlegg', '1.0.0')
    const codes = new Map(m.factors.flatMap((f) => f.items.map((i) => [i.id, i.text] as const)))
    for (const c of byggOgAnlegg.challenges) {
      if (c.measuredBy.kind === 'module') expect(codes.get(c.measuredBy.itemCode)).toBeTruthy()
    }
  })
  it('numbers cites in reading order and groups adjacent ones', () => {
    expect(citeOrder(['a{{cite:x}} b{{cite:y}}{{cite:x}}', 'c{{cite:z}}'])).toEqual(['x', 'y', 'z'])
    expect(splitCites('Tekst.{{cite:a}}{{cite:b}} Mer.')).toEqual([{ text: 'Tekst.' }, { cites: ['a', 'b'] }, { text: ' Mer.' }])
  })
  it('has one registry entry per slug', () => {
    expect(new Set(INDUSTRIES.map((i) => i.slug)).size).toBe(INDUSTRIES.length)
  })

  it('the English page quotes the English survey, and is held back until its law is reviewed (D-120)', () => {
    expect(problemsOf(byggOgAnleggEn, 'en')).toEqual([])
    const en = moduleFile('bygg-og-anlegg', '1.0.0', 'en')
    const no = moduleFile('bygg-og-anlegg', '1.0.0')
    expect(en.factors.map((f) => f.id)).toEqual(no.factors.map((f) => f.id))
    expect(en.factors[0]!.items.map((i) => i.text)).not.toEqual(no.factors[0]!.items.map((i) => i.text))
    expect(en.scale.labels).toHaveLength(5)
    expect(en.count_items[0]!.options).toEqual(['Yes', 'No', "Don't know"])
    expect(byggOgAnleggEn.law.items.every((l) => !l.reviewed)).toBe(true)
    const launched = { ...structuredClone(byggOgAnleggEn), launched: true }
    expect(problemsOf(launched, 'en').some((x) => x.includes('not reviewed'))).toBe(true)
  })
  it('refuses an English twin that quotes other statements or figures', () => {
    expect(twinProblems(byggOgAnlegg, byggOgAnleggEn)).toEqual([])
    const off = structuredClone(byggOgAnleggEn)
    off.challenges[0]!.measuredBy = { kind: 'module', itemCode: 'BA-SF-1' }
    off.hero.preview!.rows[0]!.values[0] = 99
    const p = twinProblems(byggOgAnlegg, off)
    expect(p).toContain('English page quotes other statements')
    expect(p).toContain('English preview has other figures')
  })
  it('checks an English core statement against the English messages', () => {
    const broken = structuredClone(byggOgAnleggEn)
    broken.challenges[7]!.measuredBy = { kind: 'core', factorKey: 'integritet', ordinal: 9 }
    expect(problemsOf(broken, 'en').some((x) => x.includes('integritet.s9'))).toBe(true)
  })
  it('joins a list in the page language', () => {
    expect(listOf(['a', 'b', 'c'], 'no')).toBe('a, b og c')
    expect(listOf(['a', 'b', 'c'], 'en')).toBe('a, b and c')
  })

  it('the health module names the core instrument word for word (D-122)', () => {
    const m = moduleFile('helse-og-omsorg', '1.0.0')
    const factor = (no as unknown as { factor: Record<string, Record<string, string>> }).factor
    const labels = new Set(Object.values(factor).map((f) => f.label))
    const statements = new Set(Object.values(factor).flatMap((f) => ['s1', 's2', 's3'].map((s) => f[s])))
    for (const n of m.relation_to_core?.covered_by_core_factors ?? []) expect(labels.has(n), n).toBe(true)
    for (const s of m.relation_to_core?.core_statements_not_repeated ?? []) expect(statements.has(s), s).toBe(true)
    const b = moduleFile('bygg-og-anlegg', '1.0.0')
    for (const n of b.relation_to_core?.covered_by_core_factors ?? []) expect(labels.has(n), n).toBe(true)
  })
  it('the health page is valid, held at preview, and its core challenge names statements that exist', () => {
    expect(problemsOf(helseOgOmsorg)).toEqual([])
    expect(helseOgOmsorg.launched).toBe(false)
    const broken = structuredClone(helseOgOmsorg)
    const last = broken.challenges.at(-1)!
    last.measuredBy = { kind: 'core', factorKey: 'emosjon', ordinal: 1, alongside: [2, 7] }
    expect(problemsOf(broken).some((x) => x.includes('emosjon.s7'))).toBe(true)
    expect(problemsOf(helseOgOmsorgEn, 'en')).toEqual([])
    expect(twinProblems(helseOgOmsorg, helseOgOmsorgEn)).toEqual([])
  })
})
