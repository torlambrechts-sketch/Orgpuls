import { describe, expect, it } from 'vitest'
import { citeOrder, splitCites } from '@/content/industries/cites'
import { INDUSTRIES } from '@/content/industries'
import { moduleFile } from '@/content/industries/modules'
import { assertIndustries, problemsOf } from '@/content/industries/validate'
import { byggOgAnlegg } from '@/content/industries/bygg-og-anlegg'

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
})
