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
