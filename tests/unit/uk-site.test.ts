import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EMPVIBE_PAGES } from '@/lib/hosts'
import { OWN_FOOTERS, OWN_NAV } from '@/lib/site/nav'
import { ANNUAL_MONTHS, PLAN_PRICES } from '@/lib/site/pricing'

/**
 * Empvibe's site in words (UK-E2, D-271): every page it serves reads the English catalogue with the
 * United Kingdom's pack laid over it (messages/market/gb/en.json, lib/i18n/market-overlay.ts), as an
 * organisation in the market does. What would go wrong silently, and is held here:
 *
 *  - a text on one of its pages that still says something only true in Norway (the law, its bodies,
 *    its register, its prices, its SMS), read by a British employer as though it were theirs;
 *  - a claim the United Kingdom's law or HSE's licence does not allow (docs/markets/uk-legal.md § 9);
 *  - a price that is not the United Kingdom's own (X-113), or one its terms state differently from
 *    the list Oppsett › Betaling charges by (lib/site/pricing.ts);
 *  - a menu or footer entry with no words;
 *  - an array a page counts (zod `.length`) changed in length, which would fail that page's render.
 */
type Tree = { [k: string]: unknown }
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Tree
const isTree = (v: unknown): v is Tree => !!v && typeof v === 'object' && !Array.isArray(v)
/** the request config's own merge (lib/i18n/request.ts): b over a, key by key, an array replaced whole */
const merge = (a: Tree, b: Tree): Tree =>
  Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, isTree(a[k]) && isTree(b[k]) ? merge(a[k], b[k]) : (b[k] ?? a[k])]))
const flat = (tree: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> => {
  if (typeof tree === 'string') out[prefix] = tree
  else if (Array.isArray(tree)) tree.forEach((v, i) => flat(v, `${prefix}.${i}`, out))
  else if (isTree(tree)) for (const [k, v] of Object.entries(tree)) flat(v, prefix ? `${prefix}.${k}` : k, out)
  return out
}
const at = (tree: unknown, key: string): unknown => key.split('.').reduce<unknown>((o, p) => (o as Tree | undefined)?.[p], tree)

const en = read('messages/en.json')
const gb = read('messages/market/gb/en.json')
const shown = merge(en, gb)
const map = read('lib/i18n/site-pages.json') as { pages: { path: string; keys: string[]; states?: string[] }[]; shared: string[] }

/** The UK's own documents (UK-F, D-274): the privacy notice and the terms, written for the United Kingdom */
const DOCUMENTS = ['/personvernerklaering', '/vilkar'] as const
/** The instrument's own words and the brand's name: the same English in every market, or replaced at render (lib/brand.ts) */
const SHARED = /^(respond|factor|brand)\./

/** What is only true in Norway */
const NORWAY =
  /Arbeidstilsynet|Labour Inspection|Working Environment Act|arbeidsmiljø|§|\bNOK\b|\bkr\b|Brønnøysund|verneombud|\bAMU\b|working environment committee|occupational health service|Norw(ay|egian)|Datatilsynet|organisation number|\bSMS\b|Lovdata|chapter 1A|ch\. 1A|performance of work|Demobedriften|Nordvik/i
/** Where Norway is named because it is true: the company that provides Empvibe, and its address */
const NORWAY_TRUE = new Set(['site.chrome.footer.bottom'])
/**
 * What the UK's documents say of Norway because it is true (X-113): the company that provides Empvibe,
 * where it is established and supplies from, the law and the court the contracts chose, the accounting
 * law it keeps its books by, and the EEA, Norway included, that UK law treats as adequate. Anything
 * else about Norway in them is a Norwegian text left behind.
 */
const NORWAY_IN_DOCUMENTS =
  /a company registered in Norway with organisation number 922 698 422|organisation number 922 698 422 \(Norway\)|Oslo, Norway|established in Norway|supplied from Norway|Norway included|Norwegian law|Norwegian courts|Norwegian accounting law|Norwegian Late Payment Interest Act|public holidays in Norway/g
const isDocument = (key: string) => /^seo\.pages\.(personvernerklaering|vilkar)\./.test(key)
/** What the United Kingdom's law and HSE's licence do not allow (docs/markets/uk-legal.md § 9) */
const MISLEADING =
  /HSE[- ](approved|endorsed|compliant|accredited)|(meets|complies with) (the )?(HSE('s)? )?Management Standards|statutory (report|factors|survey)|report(s|ed)? to HSE|Information Commissioner\b|required by law to (run|carry out) (a|this|the) survey/i
/** Another currency than the United Kingdom's */
const FOREIGN_PRICE = /€|\$|\bNOK\b|\bSEK\b|\bkr\b/
/** The United Kingdom's list (X-113): the free plan, each plan a month, and a year at ANNUAL_MONTHS months */
const GB_AMOUNTS = new Set([0, ...[PLAN_PRICES.gb.small, PLAN_PRICES.gb.usual].flatMap((m) => [m, m * ANNUAL_MONTHS])])

const pageKeys = (path: string) => {
  const page = map.pages.find((p) => p.path === path)
  return page ? [...page.keys, ...(page.states ?? [])] : []
}
const served = [...EMPVIBE_PAGES] as string[]
/**
 * A text the Norwegian site's page map lists that Empvibe's site never draws: the articles, the
 * templates and the demo it does not serve, and the menu and footer entries that are Norway's only
 * (its own are OWN_NAV and OWN_FOOTERS).
 */
const navKeys = new Set(OWN_NAV.flatMap((i) => [i.key, ...(i.all ? [i.all] : []), ...(i.children ?? []).map((c) => c.key)]))
const footerLinks = new Set(OWN_FOOTERS.home.flatMap((c) => c.links.map((l) => l.key)))
const footerHeads = new Set(OWN_FOOTERS.home.map((c) => c.head))
const drawn = (key: string) => {
  if (/^seo\.(articles|maler|index)\./.test(key) || key === 'site.chrome.demo') return false
  const [, nav] = key.match(/^site\.chrome\.nav\.(\w+)$/) ?? []
  if (nav) return navKeys.has(nav)
  const [, link] = key.match(/^site\.chrome\.footer\.link\.(\w+)$/) ?? []
  if (link) return footerLinks.has(link)
  const [, head] = key.match(/^site\.chrome\.footer\.head\.(\w+)$/) ?? []
  if (head) return footerHeads.has(head)
  return true
}
/** every text the served pages show by the page map, and every text the pack writes for the public site */
const texts = (): [string, string][] => {
  const keys = new Set([...map.shared, ...served.flatMap(pageKeys)].filter((k) => !SHARED.test(k) && drawn(k)))
  const fromMap = [...keys].map((k) => [k, at(shown, k)] as const).filter((e): e is readonly [string, string] => typeof e[1] === 'string')
  const fromPack = Object.entries(flat({ site: gb.site, seo: gb.seo, start: gb.start })).filter(([k]) => !/^(site|seo|start)$/.test(k))
  // what a reader reads: a link's route is the site's own address (its route's Norwegian name is never shown, D-270)
  const words = (v: string) => v.replace(/\]\(\/[^)]*\)/g, ']')
  return [...new Map([...fromMap, ...fromPack]).entries()].filter(([k]) => !k.endsWith('.href')).map(([k, v]) => [k, words(v)] as [string, string])
}

describe('Empvibe’s site in words (UK-E2, D-271)', () => {
  it('serves pages the page map knows, its own privacy notice and terms among them (UK-F)', () => {
    // its own articles (UK-H, D-277) are the gb pack's alone, held by tests/unit/uk-articles.test.ts: the
    // page map is Norway's site's, crawled on Norway's routes
    for (const path of EMPVIBE_PAGES.filter((p) => !p.startsWith('/artikler/'))) expect(map.pages.some((p) => p.path === path), path).toBe(true)
    for (const path of DOCUMENTS) expect(EMPVIBE_PAGES as readonly string[], path).toContain(path)
    // the footer links to both, in its column and on its bottom line
    const links = OWN_FOOTERS.home.flatMap((c) => c.links.map((l) => l.href))
    for (const path of DOCUMENTS) expect(links, path).toContain(path)
    expect(String(at(shown, 'site.chrome.footer.bottom'))).toMatch(/<\/mail> · <privacy>Privacy<\/privacy> · <terms>Terms<\/terms>$/)
    // the documents are the pack's own, whole: none of Norway's words is read in their place
    for (const path of DOCUMENTS) {
      const key = path === '/vilkar' ? 'vilkar' : 'personvernerklaering'
      expect(at(gb, `seo.pages.${key}.blocks`), path).toEqual(expect.any(Array))
      for (const field of ['title', 'description', 'crumb', 'kicker', 'h1', 'lead']) expect(at(gb, `seo.pages.${key}.${field}`), `${path} ${field}`).toEqual(expect.any(String))
    }
  })

  it('says nothing that is only true in Norway', () => {
    const found = texts()
      .map(([k, v]) => [k, isDocument(k) ? v.replace(NORWAY_IN_DOCUMENTS, '') : v] as const)
      .filter(([k, v]) => !NORWAY_TRUE.has(k) && NORWAY.test(v))
    expect(found.map(([k, v]) => `${k}: ${v.match(NORWAY)?.[0]}`)).toEqual([])
  })

  it('names Norway only as the home of the company that provides it', () => {
    for (const k of NORWAY_TRUE) expect(at(shown, k), k).toMatch(/Pundit Invest AS[^·]*Norway/)
  })

  it('makes no claim the law or HSE’s licence does not allow', () => {
    expect(texts().filter(([, v]) => MISLEADING.test(v)).map(([k, v]) => `${k}: ${v.match(MISLEADING)?.[0]}`)).toEqual([])
  })

  it('states only the United Kingdom’s prices, in pounds, as Oppsett › Betaling charges them (X-113)', () => {
    expect(texts().filter(([, v]) => FOREIGN_PRICE.test(v)).map(([k, v]) => `${k}: ${v.match(FOREIGN_PRICE)?.[0]}`)).toEqual([])
    const amounts = texts().flatMap(([k, v]) => [...v.matchAll(/£(\d+)/g)].map((m) => [k, Number(m[1])] as const))
    expect(amounts.length).toBeGreaterThan(0)
    expect(amounts.filter(([, n]) => !GB_AMOUNTS.has(n)).map(([k, n]) => `${k}: £${n}`)).toEqual([])
    // the terms' table names each plan at the list's monthly price
    const rows = at(shown, 'seo.pages.vilkar.blocks') as { t: string; rows?: string[][] }[]
    const table = rows.find((b) => b.t === 'table')?.rows ?? []
    expect(table.map((r) => r[2])).toEqual([`£${PLAN_PRICES.gb.small} a month`, `£${PLAN_PRICES.gb.usual} a month`, 'by agreement'])
  })

  it('says, in its privacy notice, what the site counts and that a do-not-track browser sends nothing', () => {
    const text = JSON.stringify(at(gb, 'seo.pages.personvernerklaering'))
    expect(text).toContain('Global Privacy Control')
    expect(text).toContain('Visit statistics: 13 months')
    expect(text).toContain('Information Commission (ICO)')
    expect(text).not.toMatch(/Datatilsynet|Brønnøysund|Enhetsregisteret|\bdemo\b|newsletter/i)
  })

  it('has words for every entry of its menu and footer', () => {
    const nav = (key: string) => at(shown, `site.chrome.nav.${key}`)
    for (const item of OWN_NAV) {
      expect(nav(item.key), item.key).toEqual(expect.any(String))
      if (item.all) expect(nav(item.all), item.all).toEqual(expect.any(String))
      for (const c of item.children ?? []) expect(nav(c.key), c.key).toEqual(expect.any(String))
    }
    for (const column of OWN_FOOTERS.home) {
      expect(at(shown, `site.chrome.footer.head.${column.head}`), column.head).toEqual(expect.any(String))
      for (const l of column.links) expect(at(shown, `site.chrome.footer.link.${l.key}`), l.key).toEqual(expect.any(String))
    }
  })

  it('keeps the length of every array the site pages count', () => {
    const lengths = (tree: unknown, prefix: string, out: [string, number][] = []): [string, number][] => {
      if (Array.isArray(tree)) {
        out.push([prefix, tree.length])
        tree.forEach((v, i) => lengths(v, `${prefix}.${i}`, out))
      } else if (isTree(tree)) for (const [k, v] of Object.entries(tree)) lengths(v, `${prefix}.${k}`, out)
      return out
    }
    // lists a page draws whatever their length (components/site/Story.tsx `points`)
    const free = /^site\.hvorfor\.sections\.\d+\.points$/
    const changed = lengths(gb.site, 'site')
      .map(([k, n]) => [k, n, at(en, k)] as const)
      .filter(([k, n, source]) => !free.test(k) && Array.isArray(source) && source.length !== n)
      .map(([k, n, source]) => `${k}: ${n} for ${(source as unknown[]).length}`)
    expect(changed).toEqual([])
  })
})

describe('Empvibe’s pictures (UK-E3, D-272)', () => {
  it('has its own picture for every product picture the site can show', () => {
    const ids = readFileSync('lib/marketing/shot-ids.ts', 'utf8').match(/'([a-z]+)'/g)!.map((s) => s.slice(1, -1))
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(existsSync(`assets/produkt/empvibe/${id}.webp`), id).toBe(true)
  })

  it('has its own card for every page it serves with a card of its own, and a default for the rest', () => {
    expect(existsSync('public/og/empvibe/default.png')).toBe(true)
    for (const route of EMPVIBE_PAGES) {
      const file = `app/(marketing)${route === '/' ? '' : route}/page.tsx`
      const card = existsSync(file) ? readFileSync(file, 'utf8').match(/image: '\/og\/([a-z0-9-]+\.png)'/)?.[1] : undefined
      if (card) expect(existsSync(`public/og/empvibe/${card}`), `${route}: ${card}`).toBe(true)
    }
  })

  it('makes no claim on its cards that the site may not make', () => {
    const pills = at(shown, 'seo.og.pills') as string[]
    expect(pills).toHaveLength(3)
    for (const pill of pills) {
      expect(pill).not.toMatch(NORWAY)
      expect(pill).not.toMatch(MISLEADING)
      expect(pill).not.toMatch(FOREIGN_PRICE)
      expect(pill).not.toMatch(/£/)
    }
  })
})
