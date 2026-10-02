import { describe, expect, it } from 'vitest'
import { INDUSTRIES } from '@/content/industries'
import { INDUSTRY_META } from '@/content/industries/meta'
import { MODULE_KEYS, moduleFacts, moduleFile } from '@/content/industries/modules'
import { FOOTERS } from '@/lib/site/nav'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * The Bransjer hub (D-190): its module cards print what the module files say, every industry in the
 * registry has its card words and an anchor, and the footer's /bransjer#… links land on a card.
 */
describe('/bransjer module cards', () => {
  it('reads factors, statements and minutes from the file; a module in variants is a range (claims R7)', () => {
    expect(moduleFacts(moduleFile('handel'))).toEqual({ factors: '8', statements: '24', minutes: '3' })
    expect(moduleFacts(moduleFile('kunnskap-og-kontor'))).toEqual({ factors: '8–15', statements: '24–62', minutes: '3–7' })
    for (const key of MODULE_KEYS) {
      const m = moduleFile(key)
      const f = moduleFacts(m)
      if (!m.variants) expect(f.statements).toBe(String(m.factors.reduce((n, x) => n + x.items.length, 0)))
    }
  })

  it('has card words in both languages and an anchor for every industry in the registry', () => {
    for (const i of INDUSTRIES) {
      for (const cat of [no, en]) {
        const card = cat.site.bransjer.cards.find((c) => c.slug === i.slug)
        expect(card, `${i.slug} card`).toBeDefined()
        expect(card!.topics.length).toBeGreaterThan(0)
      }
      expect(INDUSTRY_META.find((m) => m.slug === i.slug)?.anchor).toBeTruthy()
    }
  })

  it('gives every footer link into /bransjer a card with that id', () => {
    const anchors = new Set(INDUSTRY_META.map((m) => m.anchor))
    const hrefs = Object.values(FOOTERS)
      .flat()
      .flatMap((c) => c.links.map((l) => l.href ?? ''))
      .filter((h) => h.startsWith('/bransjer#'))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const h of hrefs) expect(anchors.has(h.slice('/bransjer#'.length)), h).toBe(true)
  })
})
