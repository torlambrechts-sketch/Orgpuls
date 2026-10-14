import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Blocks, FaqItems } from '@/lib/marketing/blocks'
import { ARTICLES, INFORMATIONAL_PAGES, LANDING_ARTICLES, LANDING_PAGES, LANDING_RELATED } from '@/lib/marketing/site'
import { TEMPLATES } from '@/lib/marketing/templates'
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

/**
 * The vernerunde article and its checklist, the «psykososialt arbeidsmiljø» hub, and the two sections the data asked
 * for (D-284): each page is in its registry with its route and card, says what it must in both languages, and is
 * reached from the text of the pages whose readers need it.
 */
describe('the vernerunde article, its checklist and the hub (D-284)', () => {
  type Page = { h1: string; lead: string; blocks: unknown; faq?: unknown }
  const page = (lang: typeof no | typeof en, ns: 'articles' | 'lp', key: string) => (lang.seo[ns] as unknown as Record<string, Page>)[key]!
  const blocksOf = (lang: typeof no | typeof en, ns: 'articles' | 'lp', key: string) => Blocks.parse(page(lang, ns, key).blocks)
  const HUB = 'psykososialt-arbeidsmiljo'
  const VR = 'vernerunde-psykososialt-arbeidsmiljo'
  const factors = ARTICLES.filter((a) => a.group === 'faktorer')

  it('the hub is an informational landing page with its route, public path, card, two articles and two neighbours', () => {
    expect(LANDING_PAGES).toContain(HUB)
    expect(INFORMATIONAL_PAGES).toContain(HUB)
    expect(LANDING_ARTICLES[HUB]).toEqual(['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'arbeidsmiljokartlegging'])
    expect(LANDING_RELATED[HUB]).toEqual(['lovkrav', 'verneombud'])
    expect(readFileSync(`app/(marketing)/${HUB}/page.tsx`, 'utf8')).toContain(`slug="${HUB}"`)
    expect(readFileSync('lib/supabase/middleware.ts', 'utf8')).toContain(`'/${HUB}',`)
    expect(existsSync(`public/og/${HUB}.png`)).toBe(true)
  })

  it('the hub asks in its H1, defines in its first words, lists the eleven factor articles and chapter 1A, and carries FAQ data', () => {
    expect(page(no, 'lp', 'psykososialtArbeidsmiljo').lead).toMatch(/^Psykososialt arbeidsmiljø er /)
    expect(page(en, 'lp', 'psykososialtArbeidsmiljo').lead).toMatch(/^The psychosocial working environment is /)
    for (const lang of [no, en]) {
      expect(page(lang, 'lp', 'psykososialtArbeidsmiljo').h1).toMatch(/\?$/)
      const blocks = blocksOf(lang, 'lp', 'psykososialtArbeidsmiljo')
      const links = blocks.find((b) => b.t === 'links')
      expect(links?.items.map((i) => i.href).sort()).toEqual(factors.map((a) => `/artikler/${a.slug}`).sort())
      // the regulation's chapter, paragraph by paragraph: the same block /lovkrav carries
      const law = blocks.find((b) => b.t === 'law')
      const lovkrav = blocksOf(lang, 'lp', 'lovkrav').find((b) => b.t === 'law' && /1A-1/.test(b.items[0]!.ref))
      expect(law).toEqual(lovkrav)
      expect(FaqItems.parse(page(lang, 'lp', 'psykososialtArbeidsmiljo').faq).length).toBeGreaterThanOrEqual(5)
      for (const b of blocks) if (b.t === 'h2' && !/^(Kilder|Sources)$/.test(b.text)) expect(b.text).toMatch(/\?$/)
    }
  })

  it('the hub is linked from the text of every factor article, /lovkrav and the kartlegging article, in both languages', () => {
    for (const lang of [no, en]) {
      for (const a of factors) expect(JSON.stringify(page(lang, 'articles', a.key).blocks), a.slug).toContain(`](/${HUB})`)
      expect(JSON.stringify(page(lang, 'lp', 'lovkrav').blocks)).toContain(`](/${HUB})`)
      expect(JSON.stringify(page(lang, 'articles', 'arbeidsmiljokartlegging').blocks)).toContain(`](/${HUB})`)
    }
  })

  it('the vernerunde article is in the registry with its checklist template, asks, and is linked from its neighbours and the hub', () => {
    const a = ARTICLES.find((x) => x.slug === VR)
    expect(a?.template).toBe('vernerunde-sjekkliste')
    expect(a?.related).toContain('verneombudets-rolle-i-kartleggingen')
    expect(ARTICLES.find((x) => x.key === 'verneombud')?.related).toContain(VR)
    expect(TEMPLATES.map((t) => t.slug)).toContain('vernerunde-sjekkliste')
    expect(existsSync(`public/og/artikler/${VR}.png`)).toBe(true)
    for (const lang of [no, en]) {
      expect(page(lang, 'articles', 'vernerunde').h1).toMatch(/\?$/)
      for (const key of ['verneombud', 'arbeidsmiljokartlegging']) expect(JSON.stringify(page(lang, 'articles', key).blocks), key).toContain(`](/artikler/${VR})`)
      expect(JSON.stringify(page(lang, 'lp', 'verneombud').blocks)).toContain(`](/artikler/${VR})`)
      expect(JSON.stringify(page(lang, 'lp', 'psykososialtArbeidsmiljo').blocks)).toContain(`](/artikler/${VR})`)
      // the checklist the Word file is built from (scripts/maler/build.py): three parts under the «Sjekkliste» heading
      const blocks = blocksOf(lang, 'articles', 'vernerunde')
      const at = blocks.findIndex((b) => b.t === 'h2' && /^(Sjekkliste|Checklist)/.test(b.text))
      expect(at).toBeGreaterThan(0)
      expect(blocks.slice(at + 1).filter((b) => b.t === 'h3')).toHaveLength(3)
      expect(blocks.slice(at + 1).filter((b) => b.t === 'ul')).toHaveLength(3)
    }
  })

  it('/lovkrav answers whether there is a deadline, right after what changed in 2026', () => {
    const q = lp(no, 'lovkrav').faq.map((f) => f.q)
    expect(q[q.indexOf('Hva endret seg 1. januar 2026?') + 1]).toBe('Er det en frist for å kartlegge etter de nye reglene?')
    expect(lp(en, 'lovkrav').faq).toHaveLength(lp(no, 'lovkrav').faq.length)
  })

  it('the bygg question page answers the language requirement in a section of its own, with an anchor, in both languages', () => {
    const bygg = INDUSTRIES.find((i) => i.slug === 'bygg-og-anlegg')!
    for (const lang of ['no', 'en'] as const) {
      const s = pageIn(bygg, lang)?.questionPage?.sections?.find((x) => x.id === 'sprakkrav')
      expect(s?.title, lang).toMatch(/\?$/)
      expect(s?.paragraphs.join(' '), lang).toMatch(/19a/)
      expect(s?.source?.url, lang).toContain('lovdata.no')
    }
  })
})
