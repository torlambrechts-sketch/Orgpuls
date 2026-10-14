import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ARTICLES, LANDING_ARTICLES, LANDING_PAGES, LANDING_RELATED } from '@/lib/marketing/site'
import { ORGNR, organization } from '@/lib/marketing/schema'
import { INDUSTRIES, pageIn } from '@/content/industries'
import { LANDINGS } from '@/content/industries/landing'
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

/**
 * The content audit's rules (scripts/seo/content-audit.ts, D-282): a section is a passage a search engine or an AI
 * answer lifts on its own, so it asks what the reader asked and answers in its first sentence; a title fits a
 * result page; an article cites its sources; the «which tool» page is reached from the pages whose readers choose.
 */
type Heading = { t: string; text?: string }
const ASKS_NO = /\?$|^(hva|hvordan|hvilke[nt]?|når|er|hvor|hvem|hvorfor|må|kan|bør|trenger|finnes)\b/i
const ASKS_EN = /\?$|^(what|how|when|is|are|where|who|why|must|can|should|do|does|which)\b/i
const asks = (s: string, re: RegExp) => re.test(s.replace(/­/g, '').trim())
const headings = (lang: typeof no | typeof en, key: string) =>
  (lang.seo.articles as unknown as Record<string, { blocks: Heading[] }>)[key]!.blocks.filter((b) => b.t === 'h2' || b.t === 'h3').map((b) => b.text ?? '')

describe('the sections ask what readers ask (D-282)', () => {
  it('at least half of every article’s sections are questions, in both languages', () => {
    for (const a of ARTICLES) {
      for (const [lang, m, re] of [
        ['no', no, ASKS_NO],
        ['en', en, ASKS_EN],
      ] as const) {
        const hs = headings(m, a.key)
        const q = hs.filter((h) => asks(h, re)).length
        expect(q / hs.length, `${a.slug} ${lang}: ${q}/${hs.length}`).toBeGreaterThanOrEqual(0.5)
      }
    }
  })

  it('every article’s H1 asks, and every article cites at least three sources', () => {
    for (const a of ARTICLES) {
      expect(asks(article(no, a.key).h1, ASKS_NO), a.slug).toBe(true)
      expect((article(no, a.key) as unknown as { sources: unknown[] }).sources.length, a.slug).toBeGreaterThanOrEqual(3)
    }
  })

  it('answers the questions Search Console showed in the section’s first sentence', () => {
    const pulse = no.seo.articles.pulsundersokelse.blocks as Heading[]
    const i = pulse.findIndex((b) => b.text === 'Hvordan øker man svarprosenten i en pulsundersøkelse?')
    expect(i).toBeGreaterThan(0)
    expect(pulse[i + 1]!.text).toMatch(/^Svarprosenten holder seg oppe når de ansatte ser at svarene blir brukt/)
    const anon = no.seo.articles.anonym.blocks as Heading[]
    const j = anon.findIndex((b) => b.text === '2. Gruppen er for liten: hvor mange svar må til?')
    expect(j).toBeGreaterThan(0)
    expect(anon[j + 1]!.text).toMatch(/^Minst fem svar/)
    expect((no.seo.articles.faktorMotstrid.blocks as Heading[])[0]!.text).toBe('Hva betyr motstridende krav?')
  })
})

describe('every page title fits a result page (D-282)', () => {
  it('is at most 65 characters on Norway’s site', () => {
    const titles: [string, string][] = []
    const walk = (v: unknown, path: string) => {
      if (typeof v === 'string') {
        if (/^seo\.(home|index|articles\.[^.]+|lp\.[^.]+|pages\.[^.]+|maler\.[^.]+)\.title$|^site\.hvorfor\.seoTitle$|^site\.bransje\.[^.]+\.seo\.title$|^demo\.metaTitle$/.test(path)) titles.push([path, v])
      } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k)
    }
    walk(no, '')
    for (const i of INDUSTRIES) {
      const q = pageIn(i, 'no')?.questionPage
      if (q) titles.push([`${i.slug}/sporsmal`, q.metaTitle])
    }
    expect(titles.length).toBeGreaterThan(50)
    for (const [key, t] of titles) expect([...t].length, `${key}: ${t}`).toBeLessThanOrEqual(65)
  })
})

describe('the «which tool» page is reached from the pages whose readers choose (D-282)', () => {
  it('is in every industry page’s «Les videre» and in the security page’s text', () => {
    for (const l of LANDINGS) {
      expect(l.related.map((r) => r.href), l.slug).toContain('/verktoy-for-medarbeiderundersokelse')
      expect((no.site.bransje as unknown as Record<string, { related: Record<string, string> }>)[l.msg]!.related.verktoy, l.msg).toBeTruthy()
    }
    expect(JSON.stringify(no.seo.pages.sikkerhet.blocks)).toContain('](/verktoy-for-medarbeiderundersokelse)')
    expect(JSON.stringify(no.seo.lp.verktoyForMedarbeiderundersokelse.blocks)).toContain('](/plattform)')
  })

  it('the Organization carries the register’s founding date and the footer’s address', () => {
    const o = organization() as Record<string, unknown>
    expect(o.foundingDate).toBe('2019-04-03')
    expect(o.address).toEqual({ '@type': 'PostalAddress', streetAddress: 'Øvre Prinsdals vei 36L', postalCode: '1266', addressLocality: 'Oslo', addressCountry: 'NO' })
    expect(JSON.stringify(no)).toContain('Øvre Prinsdals vei 36L')
  })
})
