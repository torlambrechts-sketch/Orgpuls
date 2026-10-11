import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addressOf, EMPVIBE_PAGES, siteOf } from '@/lib/hosts'
import { EMPVIBE_ARTICLE_GROUPS, EMPVIBE_ARTICLES, EMPVIBE_LANDING_ARTICLES, EMPVIBE_QUESTIONS_ARTICLE } from '@/lib/marketing/articles-empvibe'
import { Blocks, plain, Sources, type Block } from '@/lib/marketing/blocks'
import { ARTICLES } from '@/lib/marketing/site'
import { articleIn, articlesOf, NORWAY_ARTICLES } from '@/lib/marketing/site-articles'

/**
 * Empvibe's articles (UK-H, D-278): written for the United Kingdom, in its words (messages/market/gb),
 * served only on its site, and held to what the UK's law and HSE's licence allow. What would go wrong
 * silently, and is held here:
 *
 *  - an article listed, linked or put in the sitemap whose words are missing, or whose blocks fail to
 *    parse, which would fail that page's render;
 *  - a link to a page Empvibe's site does not serve (a Norwegian article, the templates), which is a
 *    404 there, or to one that sells: an article is informational (D-235) and links only to other
 *    articles and the two pages that explain the law;
 *  - a source that is not the law or a regulator's own page, or a claim docs/markets/uk-legal.md
 *    records as unverified or misleading (its § 9 and its UNVERIFIED list); the words Norway's law
 *    alone uses are held by tests/unit/uk-site.test.ts, which reads every text in the gb pack;
 *  - an article of one site shown on another's;
 *  - a share card missing for an article.
 */
type Tree = { [k: string]: unknown }
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Tree
const at = (tree: unknown, key: string): unknown => key.split('.').reduce<unknown>((o, p) => (o as Tree | undefined)?.[p], tree)
const gb = read('messages/market/gb/en.json')
const words = (key: string) => at(gb, `seo.articles.${key}`) as Tree

/** The pages a UK article may cite: the law and the bodies that state it, never a commentator */
const SOURCE_HOSTS = new Set([
  'www.legislation.gov.uk',
  'www.hse.gov.uk',
  'books.hse.gov.uk',
  'www.hseni.gov.uk',
  'ico.org.uk',
  'www.gov.uk',
  'assets.publishing.service.gov.uk',
  'www.acas.org.uk',
  'www.nationalarchives.gov.uk',
  'workright.campaign.gov.uk',
])
/**
 * What docs/markets/uk-legal.md records as not said by its source, or as not the law (its § 9 and its
 * UNVERIFIED list): a paraphrase put in the ICO's mouth, HSE's plain-English «workers» as the legal
 * threshold, a representative every employer must have or appoints, a committee by headcount, a
 * survey as a duty, the regulator's old title, and the Norwegian section mark
 */
const UNSUPPORTED =
  /consent is rarely appropriate|five or more workers|more than (five|5) employees|(must|required to) (have|appoint) an? (health and )?safety representative|\bemployers? (must |should |will )?appoints? (a|the|its|their) (health and )?safety rep|(working environment|safety) committee (is )?required (from|for|once|when you have) \d|(law|legally) requires? (you |employers )?to (run|carry out|conduct) an? (staff |employee )?survey|Information Commissioner\b|HSE[- ](approved|endorsed|compliant|accredited)|statutory (report|survey|factors)|report(s|ed)? to HSE|§/i
const ART_KINDS = new Set(['law', 'rep', 'risk', 'board', 'meeting', 'survey', 'wheel', 'anon'])

/** every string a reader reads in an article's blocks */
const blockText = (blocks: Block[]): string[] =>
  blocks.flatMap((b): string[] => {
    switch (b.t) {
      case 'ul':
      case 'ol':
        return b.items
      case 'quote':
        return [b.text, b.cite]
      case 'law':
        return b.items.flatMap((i) => [i.ref, i.text])
      case 'box':
        return [b.title, b.text]
      case 'cards':
      case 'links':
        return b.items.flatMap((i) => [i.title, i.text])
      case 'table':
        return [...b.head, ...b.rows.flat()]
      case 'cycle':
        return [b.center, ...b.items.flatMap((i) => [i.title, i.ref ?? '', i.text])]
      case 'hub':
        return [b.center.title, b.center.text, ...b.items.flatMap((i) => [i.title, i.text])]
      case 'ladder':
        return b.items.flatMap((i) => [i.title, i.ref ?? '', i.text])
      case 'timeline':
        return b.items.flatMap((i) => [i.date, i.title, i.text ?? ''])
      case 'plans':
      case 'shot':
        return []
      default:
        return [b.text]
    }
  })
/** every link in an article's text and link cards */
const links = (blocks: Block[]): string[] => [
  ...blockText(blocks).flatMap((s) => [...s.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!)),
  ...blocks.flatMap((b) => (b.t === 'links' ? b.items.map((i) => i.href) : [])),
]
/**
 * Where an article may send a reader (D-235): another of the site's articles, or one of the two pages
 * that explain the law (the informational pages, D-236); never a page that sells
 */
const INFORMATIONAL = ['/lovkrav', '/verneombud']
const linkable = (href: string) => {
  const path = href.split(/[?#]/)[0]!
  return (EMPVIBE_PAGES as readonly string[]).includes(path) && (path.startsWith('/artikler/') || INFORMATIONAL.includes(path))
}

describe('Empvibe’s articles: the registry (UK-H, D-278)', () => {
  const slugs = EMPVIBE_ARTICLES.map((a) => a.slug)

  it('publishes its own set, each once, at an English address of its own', () => {
    expect(EMPVIBE_ARTICLES.length).toBeGreaterThanOrEqual(8)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(EMPVIBE_ARTICLES.map((a) => a.key)).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    // no address it shares with one of Norway's articles, which would be the other site's page there
    for (const s of slugs) expect(ARTICLES.map((a) => a.slug), s).not.toContain(s)
    // nor a message key: Norway's articles' words are the catalogue's, and the gb pack lays over it
    for (const a of EMPVIBE_ARTICLES) expect(ARTICLES.map((x) => x.key), a.key).not.toContain(a.key)
    const paths = siteOf('www.empvibe.com')!.own!.paths
    expect(addressOf(paths, '/artikler')).toBe('/articles')
    for (const s of slugs) {
      expect(EMPVIBE_PAGES as readonly string[]).toContain(`/artikler/${s}`)
      expect(addressOf(paths, `/artikler/${s}`)).toBe(`/articles/${s}`)
    }
  })

  it('files every article in a section the index shows, and leaves no section empty', () => {
    for (const a of EMPVIBE_ARTICLES) expect(EMPVIBE_ARTICLE_GROUPS, a.slug).toContain(a.group)
    for (const g of EMPVIBE_ARTICLE_GROUPS) expect(EMPVIBE_ARTICLES.some((a) => a.group === g), g).toBe(true)
  })

  it('points each article, landing page and survey link only at its own articles', () => {
    for (const a of EMPVIBE_ARTICLES) {
      expect(new Set(a.related).size, a.slug).toBe(2)
      for (const r of a.related) {
        expect(r, a.slug).not.toBe(a.slug)
        expect(slugs, `${a.slug} → ${r}`).toContain(r)
      }
    }
    for (const [page, pair] of Object.entries(EMPVIBE_LANDING_ARTICLES)) {
      expect(EMPVIBE_PAGES as readonly string[], page).toContain(`/${page}`)
      for (const s of pair ?? []) expect(slugs, `${page} → ${s}`).toContain(s)
    }
    expect(EMPVIBE_QUESTIONS_ARTICLE && slugs).toContain(EMPVIBE_QUESTIONS_ARTICLE)
  })

  it('dates each article, newest first, and draws its picture from the drawings it has', () => {
    const day = /^\d{4}-\d{2}-\d{2}$/
    for (const a of EMPVIBE_ARTICLES) {
      expect(a.published, a.slug).toMatch(day)
      expect(a.modified, a.slug).toMatch(day)
      expect(a.modified >= a.published, a.slug).toBe(true)
      expect(ART_KINDS.has(a.art), `${a.slug}: ${a.art}`).toBe(true)
      // the templates are Norway's (/maler is not served on Empvibe's site)
      expect(a.template, a.slug).toBeUndefined()
    }
    const published = EMPVIBE_ARTICLES.map((a) => a.published)
    expect(published).toEqual([...published].sort().reverse())
  })

  it('is each site’s own: Norway’s on Norway’s hosts, Empvibe’s on Empvibe’s, none on Sweden’s', () => {
    expect(articlesOf(undefined)).toBe(NORWAY_ARTICLES)
    expect(articlesOf('empvibe').articles).toBe(EMPVIBE_ARTICLES)
    expect(articlesOf('se').articles).toEqual([])
    for (const s of slugs) expect(articleIn(NORWAY_ARTICLES, s), s).toBeNull()
    for (const a of ARTICLES) expect(articleIn(articlesOf('empvibe'), a.slug), a.slug).toBeNull()
  })
})

describe('Empvibe’s articles: the words (UK-H, D-278)', () => {
  it('has every word each article and the index draw', () => {
    for (const a of EMPVIBE_ARTICLES) {
      const w = words(a.key)
      for (const field of ['title', 'description', 'h1', 'lead']) expect(w?.[field], `${a.slug} ${field}`).toEqual(expect.any(String))
      expect(String(w.title), a.slug).toMatch(/ \| Empvibe$/)
      // what a search result shows of it: a title and description that fit
      expect(String(w.title).length, `${a.slug} title`).toBeLessThanOrEqual(70)
      expect(String(w.description).length, `${a.slug} description`).toBeLessThanOrEqual(165)
      expect(Blocks.safeParse(w.blocks).success, `${a.slug} blocks`).toBe(true)
      expect(Sources.safeParse(w.sources).success, `${a.slug} sources`).toBe(true)
    }
    for (const field of ['title', 'description', 'crumb', 'eyebrow', 'h1', 'lead']) expect(at(gb, `seo.index.${field}`), field).toEqual(expect.any(String))
    for (const g of EMPVIBE_ARTICLE_GROUPS)
      for (const field of ['title', 'text']) expect(at(gb, `seo.index.groups.${g}.${field}`), `${g} ${field}`).toEqual(expect.any(String))
    // what an article's foot says of its sources: the UK's own law and bodies, not Norway's
    expect(String(at(gb, 'seo.common.disclaimer'))).toMatch(/legislation\.gov\.uk|HSE/)
  })

  it('cites the law and the bodies that state it, at least twice an article', () => {
    for (const a of EMPVIBE_ARTICLES) {
      const sources = Sources.parse(words(a.key).sources)
      expect(sources.length, a.slug).toBeGreaterThanOrEqual(2)
      const external = [...sources.map((s) => s.url), ...links(Blocks.parse(words(a.key).blocks)).filter((h) => /^https?:/.test(h))]
      for (const url of external) {
        expect(url, a.slug).toMatch(/^https:\/\//)
        expect(SOURCE_HOSTS.has(new URL(url).host), `${a.slug}: ${url}`).toBe(true)
      }
    }
  })

  it('links only to its own articles and the pages that explain the law, all served on Empvibe’s site', () => {
    for (const a of EMPVIBE_ARTICLES) {
      const internal = links(Blocks.parse(words(a.key).blocks)).filter((h) => h.startsWith('/'))
      for (const href of internal) expect(linkable(href), `${a.slug}: ${href}`).toBe(true)
    }
  })

  it('makes no claim its legal source record does not support', () => {
    for (const a of EMPVIBE_ARTICLES) {
      const w = words(a.key)
      const text = [w.title, w.description, w.h1, w.lead, ...blockText(Blocks.parse(w.blocks))].map((s) => plain(String(s)))
      expect(text.filter((s) => UNSUPPORTED.test(s)).map((s) => `${a.slug}: ${s.match(UNSUPPORTED)?.[0]}`)).toEqual([])
    }
  })

  it('sells nothing: no product, brand, price or trial in what a reader reads (D-235)', () => {
    for (const a of EMPVIBE_ARTICLES) {
      const w = words(a.key)
      const text = [w.description, w.h1, w.lead, ...blockText(Blocks.parse(w.blocks))].map((s) => plain(String(s)))
      expect(text.filter((s) => /Empvibe|Orgpuls|£|free trial|sign up|book a demo/i.test(s)).map((s) => `${a.slug}: ${s.slice(0, 60)}`)).toEqual([])
    }
  })

  it('cites Great Britain’s law as Great Britain’s, with Northern Ireland named where an article cites it', () => {
    for (const a of EMPVIBE_ARTICLES) {
      const all = JSON.stringify(words(a.key))
      if (/HSWA|MHSWR|Health and Safety at Work etc\. Act|Management of Health and Safety at Work Regulations/.test(all))
        expect(all, a.slug).toMatch(/Northern Ireland|Great Britain/)
    }
  })
})

describe('Empvibe’s articles: their cards (UK-H, D-278)', () => {
  it('has a share card of its own for every article', () => {
    for (const a of EMPVIBE_ARTICLES) expect(existsSync(`public/og/empvibe/artikler/${a.slug}.png`), a.slug).toBe(true)
  })
})
