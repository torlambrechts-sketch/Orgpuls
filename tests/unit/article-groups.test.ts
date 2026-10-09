import { describe, expect, it } from 'vitest'
import { LANDINGS } from '@/content/industries/landing'
import { ARTICLE_GROUPS, ARTICLES } from '@/lib/marketing/site'
import { FOOTERS, SITE_NAV } from '@/lib/site/nav'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * Where the articles are reached from (D-250): every article in one section of the index, the
 * article for the word people search most in the header's Ressurser panel and on the industry pages,
 * and the three D-249 articles linked from the text of other articles, not only from cards.
 */
describe('the article index sections', () => {
  it('puts every article in a section, and leaves no section empty', () => {
    for (const a of ARTICLES) expect(ARTICLE_GROUPS, a.slug).toContain(a.group)
    for (const g of ARTICLE_GROUPS) expect(ARTICLES.some((a) => a.group === g), g).toBe(true)
  })

  it('names every section in both languages', () => {
    for (const g of ARTICLE_GROUPS) {
      expect(no.seo.index.groups[g].title, g).toBeTruthy()
      expect(en.seo.index.groups[g].title, g).toBeTruthy()
    }
  })
})

describe('the ways in', () => {
  it('the header’s Ressurser panel opens the employee survey article', () => {
    const ressurser = SITE_NAV.find((i) => i.key === 'ressurser')
    expect(ressurser?.children?.map((c) => c.href)).toContain('/artikler/medarbeiderundersokelse')
    expect(no.site.chrome.nav.medarbeiderundersokelse).toBe('Medarbeiderundersøkelse')
  })

  it('every industry page shows it among its articles', () => {
    for (const l of LANDINGS) expect(l.articles, l.slug).toContain('medarbeiderundersokelse')
  })

  it('every footer’s pulse link opens the pulse article', () => {
    const pulse = Object.values(FOOTERS)
      .flatMap((cols) => cols.flatMap((c) => c.links))
      .filter((l) => l.key === 'puls' || l.key === 'pulsmalinger')
    expect(pulse.length).toBeGreaterThan(0)
    for (const l of pulse) expect(l.href).toBe('/artikler/pulsundersokelse')
  })

  it('the three articles are linked from the text of others', () => {
    for (const lang of [no, en]) {
      const text = (slug: string) =>
        ARTICLES.filter((a) => a.slug !== slug && JSON.stringify(lang.seo.articles[a.key as keyof typeof lang.seo.articles].blocks).includes(`](/artikler/${slug})`)).length
      expect(text('medarbeiderundersokelse')).toBeGreaterThanOrEqual(6)
      expect(text('trivselsundersokelse')).toBeGreaterThanOrEqual(3)
      expect(text('pulsundersokelse')).toBeGreaterThanOrEqual(3)
    }
  })
})
