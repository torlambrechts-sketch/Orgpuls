import { describe, expect, it } from 'vitest'
import { canonical, legalUnits, LEGAL_SECTIONS, MESSAGE_SPECS } from '@/lib/legal/registry'

/**
 * The legal review's registry (D-130): every unit resolves, every key is one 0082 accepts and
 * appears once, and the hash follows the text, so an edit can never keep an old approval.
 */
const factors = [
  { key: 'ytring', lawRef: 'aml. § 4-3 · § 2A' },
  { key: 'medvirk', lawRef: 'aml. § 4-2' },
]
const units = legalUnits(factors)
const KEY = /^[A-Za-z0-9][A-Za-z0-9:._/@[\]-]*$/

describe('the legal review registry', () => {
  it('resolves every path it names, in both languages', () => {
    const broken = units.filter((u) => u.missing?.length).map((u) => `${u.key}: ${u.missing?.join(', ')}`)
    expect(broken).toEqual([])
  })

  it('gives every unit a key the database accepts, once, and some text', () => {
    const keys = units.map((u) => u.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const u of units) {
      expect(u.key).toMatch(KEY)
      expect(u.key.length).toBeLessThanOrEqual(200)
      expect(u.hash).toMatch(/^[0-9a-f]{64}$/)
      expect(u.lines.length, u.key).toBeGreaterThan(0)
    }
  })

  it('covers every section, both languages of each message spec, and each industry law item', () => {
    for (const s of LEGAL_SECTIONS) expect(units.some((u) => u.section === s), s).toBe(true)
    for (const s of MESSAGE_SPECS) {
      expect(units.some((u) => u.key === `msg:no:${s.id}`)).toBe(true)
      expect(units.some((u) => u.key === `msg:en:${s.id}`)).toBe(true)
    }
    expect(units.filter((u) => /^industry:bygg-og-anlegg:no:law:/.test(u.key))).toHaveLength(6)
    expect(units.filter((u) => /^industry:helse-og-omsorg:no:law:/.test(u.key))).toHaveLength(7)
    expect(units.find((u) => u.key === 'doc:terms-draft:no')?.lines.length).toBeGreaterThan(10)
  })

  it('hashes the text it shows, so a changed word is a changed hash', () => {
    const u = units.find((x) => x.key === 'db:no:factors.law_ref')!
    const again = legalUnits([{ ...factors[0]!, lawRef: 'aml. § 4-3' }, factors[1]!]).find((x) => x.key === u.key)!
    expect(again.hash).not.toBe(u.hash)
    expect(canonical([{ path: 'a', text: 'b' }])).toBe('a\nb')
  })

  it('marks what is published: the launched Norwegian industry pages, not the English ones', () => {
    expect(units.find((u) => u.key.startsWith('industry:helse-og-omsorg:no:law:'))?.live).toBe(true)
    expect(units.find((u) => u.key.startsWith('industry:helse-og-omsorg:en:law:'))?.live).toBe(false)
    // the landing page is what the address shows only where the industry page is not launched
    expect(units.find((u) => u.key === 'msg:no:lp.helseOgOmsorg')?.live).toBe(false)
    expect(units.find((u) => u.key === 'msg:en:lp.helseOgOmsorg')?.live).toBe(true)
  })
})
