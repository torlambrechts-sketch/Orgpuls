import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ModuleFile, canonicalJson, contentHash, factorIndex, parseModule, riskBand } from '@/lib/modules/schema'

const raw = () => JSON.parse(readFileSync('modules/bygg-og-anlegg/v1.json', 'utf8'))
const fails = (mutate: (m: any) => void) => {
  const m = raw()
  mutate(m)
  return !ModuleFile.safeParse(m).success
}

describe('module file', () => {
  it('bygg-og-anlegg v1 parses', () => {
    const m = parseModule(raw())
    expect(m.factors).toHaveLength(8)
    expect(m.factors.flatMap((f) => f.items)).toHaveLength(24)
    expect(m.factors.flatMap((f) => f.action_suggestions)).toHaveLength(24)
  })
  it('refuses a factor with two statements', () => expect(fails((m) => m.factors[0].items.pop())).toBe(true))
  it('refuses a duplicate code', () => expect(fails((m) => (m.factors[1].items[0].id = 'BA-SF-1'))).toBe(true))
  it('refuses a re-measure item from another factor', () =>
    expect(fails((m) => (m.factors[0].action_suggestions[0].remeasure_item = 'BA-SL-1'))).toBe(true))
  it('refuses a minimum of four', () => expect(fails((m) => (m.anonymity.min_responses = 4))).toBe(true))
  it('refuses a minimum that can be lowered', () => expect(fails((m) => (m.anonymity.can_lower = true))).toBe(true))
  it('refuses an unknown source', () => expect(fails((m) => m.factors[0].rationale_sources.push('nope'))).toBe(true))
  it('refuses a scale that does not map to 0/25/50/75/100', () => expect(fails((m) => (m.scale.to_index['3'] = 60))).toBe(true))
  it('refuses a malformed count code', () => expect(fails((m) => (m.count_items[0].id = 'BA-X-1'))).toBe(true))

  it('hashes canonically, whatever the key order', () => {
    const m = parseModule(raw())
    const reordered = Object.fromEntries(Object.entries(m).reverse())
    expect(canonicalJson(reordered)).toBe(canonicalJson(m))
    expect(contentHash(m)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('scoring', () => {
  it('scores the mean of the item indices', () => {
    expect(factorIndex([5, 4, 3])).toBe(75)
    expect(factorIndex([1, 1, 2])).toBe(8) // 8.33, rounded as the core results round
  })
  it('bands at 65 and 50', () => {
    expect(riskBand(65)).toBe('lav')
    expect(riskBand(64)).toBe('middels')
    expect(riskBand(50)).toBe('middels')
    expect(riskBand(49)).toBe('hoy')
  })
})

describe('segment filter', () => {
  it('needs k in the segment and k in the rest of the group', async () => {
    const { segmentCellOk } = await import('@/lib/modules/segments')
    expect(segmentCellOk(5, 5, 10)).toBe(true)
    expect(segmentCellOk(5, 6, 10)).toBe(false) // the complement is 4
    expect(segmentCellOk(5, 4, 12)).toBe(false)
    expect(segmentCellOk(3, 5, 10)).toBe(true)
    // the floor is three since 0150 (D-198): a round at k 3 shows 3 against 3, and nothing goes lower
    expect(segmentCellOk(3, 3, 6)).toBe(true)
    expect(segmentCellOk(3, 3, 5)).toBe(false) // the complement is 2
    expect(segmentCellOk(2, 2, 6)).toBe(false) // never below three
    expect(segmentCellOk(1, 2, 4)).toBe(false)
    expect(segmentCellOk(7, 6, 14)).toBe(false)
  })
})

describe('translations', () => {
  it('refuses an English translation that misses a statement', () => {
    expect(fails((m) => delete m.translations.en.factors.sikkerhet_foran_fremdrift.items['BA-SF-2'])).toBe(true)
  })
  it('refuses a missing suggestion or count question', () => {
    expect(fails((m) => m.translations.en.factors.nye_og_unge.action_suggestions.pop())).toBe(true)
    expect(fails((m) => delete m.translations.en.count_items['BA-T-1'])).toBe(true)
  })

  // a module in variants (0089) translates its variants and simplified factors, its help lines and its
  // four-option count questions (D-214)
  const kontor = () => JSON.parse(readFileSync('modules/kunnskap-og-kontor/v1.json', 'utf8'))
  const kontorFails = (mutate: (m: any) => void) => {
    const m = kontor()
    mutate(m)
    return ModuleFile.safeParse(m).error?.issues.map((i) => i.message) ?? []
  }
  it('parses the office module in English, both variants', () => {
    const m = parseModule(kontor())
    expect(Object.keys(m.translations?.en?.variants?.forenklet.factors ?? {})).toEqual(m.variants?.[0].factors.map((f) => f.id))
  })
  it('refuses a variants module whose translation lacks its variants, a simplified factor, a help line or an option', () => {
    expect(kontorFails((m) => delete m.translations.en.variants)).toContain('en: the variants differ')
    expect(kontorFails((m) => delete m.translations.en.variants.forenklet.factors.f_hybrid)).toContain('en: simplified factor f_hybrid is not translated')
    expect(kontorFails((m) => delete m.translations.en.factors.tilgjengelighet.item_help)).toContain('en: help line of KK-TG-1 is not translated')
    expect(kontorFails((m) => m.translations.en.count_items['KK-T-2'].options.pop())).toContain('en: option count differs')
  })
  it('lays the English variants over the Norwegian for the English pages', async () => {
    const { moduleFile, simplifiedFactors } = await import('@/content/industries/modules')
    const en = moduleFile('kunnskap-og-kontor', 'en')
    expect(en.variants?.map((v) => v.name)).toEqual(['Simplified', 'Extended'])
    expect(simplifiedFactors(en)[0]?.name).toBe(parseModule(kontor()).translations?.en?.variants?.forenklet.factors.f_konsentrasjon?.name)
    expect(en.factors.flatMap((f) => f.items).find((i) => i.id === 'KK-TG-1')?.help).toBe('Does not cover agreed on-call duty or standby.')
  })
})
