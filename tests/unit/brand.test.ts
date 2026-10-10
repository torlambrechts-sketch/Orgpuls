import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRANDS, brandOf, DEFAULT_BRAND, MARKET_BRAND, rebrand } from '@/lib/brand'
import { SITES } from '@/lib/hosts'
import { MARKETS } from '@/lib/markets'

/**
 * The brand axis (X-111): one product, a name per brand. What would go wrong silently:
 *
 *  - Orgpuls's texts changed by the brand layer, which the pixel gate would catch only on the
 *    screens it shoots;
 *  - a text left naming Orgpuls under another brand, or an address rewritten that has no mailbox;
 *  - a site whose brand is not its market's, so the public pages and the product behind them
 *    disagree about the name.
 */
type Tree = { [k: string]: unknown }
const read = (lang: string) => JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')) as Tree
const strings = (tree: unknown, out: string[] = []): string[] => {
  if (typeof tree === 'string') out.push(tree)
  else if (Array.isArray(tree)) tree.forEach((v) => strings(v, out))
  else if (tree && typeof tree === 'object') Object.values(tree).forEach((v) => strings(v, out))
  return out
}

describe('the brands', () => {
  it('give every market a brand, and Norway and Sweden Orgpuls', () => {
    for (const m of MARKETS) expect(BRANDS[brandOf(m)], m).toBeDefined()
    expect(MARKET_BRAND.no).toBe('orgpuls')
    expect(MARKET_BRAND.se).toBe('orgpuls')
    expect(DEFAULT_BRAND).toBe('orgpuls')
  })

  it('give every site its market’s brand', () => {
    for (const s of SITES) expect(s.brand, s.host).toBe(brandOf(s.market))
  })

  it('name the product in each language’s catalogue', () => {
    expect((read('no').brand as Tree).name).toBe('Orgpuls')
    expect((read('en').brand as Tree).name).toBe('Orgpuls')
  })
})

describe('the texts under a brand', () => {
  it('are the catalogue itself for Orgpuls', () => {
    const en = read('en')
    expect(rebrand(en, 'orgpuls', 'en')).toBe(en)
  })

  it('name Empvibe wherever a text named Orgpuls, in every language', () => {
    for (const lang of ['no', 'en', 'sv']) {
      const shown = strings(rebrand(read(lang), 'empvibe', lang))
      expect(shown.filter((s) => s.includes('Orgpuls')), lang).toEqual([])
      expect(shown.some((s) => s.includes('Empvibe')), lang).toBe(true)
    }
  })

  it('leave addresses as they are, since the mailboxes stay on orgpuls (X-111)', () => {
    expect(rebrand({ a: 'Write to hjelp@orgpuls.no or visit orgpuls.com' }, 'empvibe', 'en')).toEqual({
      a: 'Write to hjelp@orgpuls.no or visit orgpuls.com',
    })
    const before = strings(read('en')).join('\n').match(/[\w.-]*orgpuls\.(com|no)/g) ?? []
    const after = strings(rebrand(read('en'), 'empvibe', 'en')).join('\n').match(/[\w.-]*orgpuls\.(com|no)/g) ?? []
    expect(after).toEqual(before)
  })

  it('form the possessive in the language', () => {
    expect(rebrand({ a: "Orgpuls' role", b: 'Orgpuls’s terms', c: 'Orgpuls stores' }, 'empvibe', 'en')).toEqual({
      a: "Empvibe's role",
      b: "Empvibe's terms",
      c: 'Empvibe stores',
    })
    expect(rebrand({ a: "Orgpuls' rolle" }, 'empvibe', 'no')).toEqual({ a: 'Empvibes rolle' })
  })

  it('keep the shape: arrays, numbers and nesting', () => {
    expect(rebrand({ a: ['Orgpuls', 2, { b: 'Orgpuls' }] }, 'empvibe', 'en')).toEqual({ a: ['Empvibe', 2, { b: 'Empvibe' }] })
  })
})
