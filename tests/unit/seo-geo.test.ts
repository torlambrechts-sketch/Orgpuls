import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ARTICLES, LANDING_ARTICLES, LANDING_PAGES, LANDING_RELATED } from '@/lib/marketing/site'
import { ORGNR, organization } from '@/lib/marketing/schema'
import { EMPVIBE_PAGES, SE_PAGES } from '@/lib/hosts'
import { K_DEFAULT, K_FLOOR } from '@/lib/org/threshold'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * The search and AI-answer strategy's keyword map (docs/marketing/seo-geo-strategy.md § 4, D-281), held as
 * a test: each query cluster has one target page, and that page carries the cluster's words where search
 * engines and AI answers read them first – the title, and for new pages the H1 and the lead. A rename that
 * drops the words fails here instead of quietly undoing the work.
 */
type Words = { title: string; description: string; h1: string; lead: string }
const article = (lang: typeof no | typeof en, key: string) => (lang.seo.articles as unknown as Record<string, Words>)[key]!
const lp = (lang: typeof no | typeof en, key: string) => (lang.seo.lp as unknown as Record<string, Words & { faq: { q: string; a: string }[] }>)[key]!

describe('the keyword map: one target page per cluster, its words in the title', () => {
  const MAP: [string, () => string, RegExp][] = [
    ['anonym medarbeiderundersøkelse', () => article(no, 'anonym').title, /^Anonym medarbeiderundersøkelse/],
    ['medarbeiderundersøkelse lovpålagt', () => article(no, 'lovpalagt').title, /^Er medarbeiderundersøkelse lovpålagt\?/],
    ['arbeidsmiljøkartlegging', () => article(no, 'arbeidsmiljokartlegging').title, /^Arbeidsmiljøkartlegging/],
    ['verneombud psykososialt arbeidsmiljø', () => article(no, 'verneombud').title, /^Verneombudets rolle i det psykososiale arbeidsmiljøet/],
    ['verneombud rettigheter og plikter', () => lp(no, 'verneombud').title, /rettigheter og plikter/],
    ['verktøy for medarbeiderundersøkelse', () => lp(no, 'verktoyForMedarbeiderundersokelse').title, /^Verktøy for anonym medarbeiderundersøkelse/],
    ['medarbeidertilfredshetsundersøkelse', () => article(no, 'trivselsundersokelse').description, /medarbeidertilfredshetsundersøkelse/],
  ]
  for (const [query, words, expected] of MAP) it(query, () => expect(words()).toMatch(expected))

  it('keeps every title within what a result page shows', () => {
    for (const k of ['anonym', 'lovpalagt', 'arbeidsmiljokartlegging', 'verneombud']) {
      expect(article(no, k).title.length, k).toBeLessThanOrEqual(65)
      expect(article(no, k).description.length, k).toBeLessThanOrEqual(155)
    }
    expect(lp(no, 'verktoyForMedarbeiderundersokelse').title.length).toBeLessThanOrEqual(65)
  })
})

describe('the two new articles (D-281)', () => {
  const NEW = ['er-medarbeiderundersokelse-lovpalagt', 'arbeidsmiljokartlegging']

  it('are in the registry, in both languages, with sources', () => {
    for (const slug of NEW) {
      const a = ARTICLES.find((x) => x.slug === slug)
      expect(a, slug).toBeDefined()
      for (const lang of [no, en]) {
        const w = article(lang, a!.key) as Words & { sources: unknown[]; blocks: unknown[] }
        expect(w.h1 && w.lead && w.blocks.length, slug).toBeTruthy()
        expect(w.sources.length, slug).toBeGreaterThanOrEqual(5)
      }
    }
  })

  it('answer their question in the lead’s first words, the way an AI answer quotes it', () => {
    expect(article(no, 'lovpalagt').lead).toMatch(/^Nei, ikke som egen plikt\./)
    expect(article(en, 'lovpalagt').lead).toMatch(/^No, not as a duty of its own\./)
    expect(article(no, 'arbeidsmiljokartlegging').lead).toMatch(/^En arbeidsmiljøkartlegging er /)
  })

  it('are linked from the text of the articles next to them, not only from cards', () => {
    const linking = (slug: string) =>
      Object.entries(no.seo.articles).filter(([, w]) => JSON.stringify((w as { blocks: unknown }).blocks).includes(`](/artikler/${slug})`)).map(([k]) => k)
    expect(linking('er-medarbeiderundersokelse-lovpalagt')).toEqual(expect.arrayContaining(['medarbeiderundersokelse', 'anonym', 'arbeidsmiljokartlegging']))
    expect(linking('arbeidsmiljokartlegging')).toEqual(expect.arrayContaining(['kravKartlegging', 'lovpalagt']))
  })
})

describe('the «which tool» page (D-281)', () => {
  const SLUG = 'verktoy-for-medarbeiderundersokelse'

  it('is a landing page with a route, a public path, two articles and two neighbours', () => {
    expect(LANDING_PAGES).toContain(SLUG)
    expect(LANDING_ARTICLES[SLUG]).toEqual(['anonym-medarbeiderundersokelse', 'er-medarbeiderundersokelse-lovpalagt'])
    expect(LANDING_RELATED[SLUG]).toEqual(['smaa-bedrifter', 'lovkrav'])
    // Norway's small-business page points to it; a site of its own, which does not serve it, keeps its two cards
    const shown = (served: readonly string[]) => LANDING_RELATED['smaa-bedrifter'].filter((r) => served.includes(`/${r}`)).slice(0, 2)
    expect(shown(LANDING_PAGES.map((p) => `/${p}`))).toEqual(['lovkrav', SLUG])
    for (const served of [SE_PAGES, EMPVIBE_PAGES]) expect(shown(served)).toEqual(['lovkrav', 'verneombud'])
    expect(readFileSync(`app/(marketing)/${SLUG}/page.tsx`, 'utf8')).toContain(`slug="${SLUG}"`)
    expect(readFileSync('lib/supabase/middleware.ts', 'utf8')).toContain(`'/${SLUG}',`)
  })

  it('says what Orgpuls is in its first sentence', () => {
    expect(lp(no, 'verktoyForMedarbeiderundersokelse').lead).toMatch(/^Orgpuls er et norsk verktøy for anonym medarbeiderundersøkelse/)
    expect(lp(en, 'verktoyForMedarbeiderundersokelse').lead).toMatch(/^Orgpuls is a Norwegian tool for anonymous employee/)
  })

  it('states the threshold the database enforces, and no other', () => {
    // the k the page promises is the product's: default K_DEFAULT, never below K_FLOOR (app.k_min, app.k_floor)
    for (const lang of [no, en]) {
      const page = JSON.stringify(lp(lang, 'verktoyForMedarbeiderundersokelse'))
      const promised = [...page.matchAll(/(?:minst|at least|før|until) (\d+)/g)].map((m) => Number(m[1]))
      expect(promised.length).toBeGreaterThan(0)
      for (const k of promised) expect(k).toBe(K_DEFAULT)
      expect(page).toMatch(new RegExp(`(under|below) ${K_FLOOR}`))
    }
  })
})

describe('the Organization entity', () => {
  it('names the registered company by its number and its Brønnøysund entry', () => {
    const o = organization() as Record<string, unknown>
    expect(o.identifier).toEqual({ '@type': 'PropertyValue', propertyID: 'NO:ORGNR', value: ORGNR })
    expect(o.sameAs).toEqual([`https://virksomhet.brreg.no/nb/oppslag/enheter/${ORGNR}`])
  })

  it('uses the number the site prints', () => {
    // the footer and /vilkar group it in threes with no-break spaces
    const printed = ORGNR.replace(/(\d{3})(\d{3})(\d{3})/, '$1\u00a0$2\u00a0$3')
    expect(JSON.stringify(no)).toContain(`org.nr.\u00a0${printed}`)
  })
})
