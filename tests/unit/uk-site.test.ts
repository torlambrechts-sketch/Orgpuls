import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EMPVIBE_PAGES } from '@/lib/hosts'
import { OWN_FOOTERS, OWN_NAV } from '@/lib/site/nav'

/**
 * Empvibe's site in words (UK-E2, D-271): every page it serves reads the English catalogue with the
 * United Kingdom's pack laid over it (messages/market/gb/en.json, lib/i18n/market-overlay.ts), as an
 * organisation in the market does. What would go wrong silently, and is held here:
 *
 *  - a text on one of its pages that still says something only true in Norway (the law, its bodies,
 *    its register, its prices, its SMS), read by a British employer as though it were theirs;
 *  - a claim the United Kingdom's law or HSE's licence does not allow (docs/markets/uk-legal.md § 9);
 *  - a price, «free» or a trial, before the United Kingdom has prices (UK-F);
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

/** The pages whose words are another step's, and why */
const NOT_YET: Record<string, string> = {
  '/personvernerklaering': 'the UK privacy notice is UK-F, with the Article 27 representative and the ICO fee',
  '/vilkar': 'the UK terms are UK-F, with GBP prices and reverse-charge invoicing',
}
/** The instrument's own words and the brand's name: the same English in every market, or replaced at render (lib/brand.ts) */
const SHARED = /^(respond|factor|brand)\./

/** What is only true in Norway */
const NORWAY =
  /Arbeidstilsynet|Labour Inspection|Working Environment Act|arbeidsmiljø|§|\bNOK\b|\bkr\b|Brønnøysund|verneombud|\bAMU\b|working environment committee|occupational health service|Norw(ay|egian)|Datatilsynet|organisation number|\bSMS\b|Lovdata|chapter 1A|ch\. 1A|performance of work|Demobedriften|Nordvik/i
/** Where Norway is named because it is true: the company that provides Empvibe, and its address */
const NORWAY_TRUE = new Set(['site.chrome.footer.bottom'])
/** What the United Kingdom's law and HSE's licence do not allow (docs/markets/uk-legal.md § 9) */
const MISLEADING =
  /HSE[- ](approved|endorsed|compliant|accredited)|(meets|complies with) (the )?(HSE('s)? )?Management Standards|statutory (report|factors|survey)|report(s|ed)? to HSE|Information Commissioner\b|required by law to (run|carry out) (a|this|the) survey/i
/** No prices before the United Kingdom has its own (UK-F) */
const PRICE = /£|€|\bNOK\b|\bfree\b(?![- ]text)|\btrial\b|\bper month\b|\/month/i

const pageKeys = (path: string) => {
  const page = map.pages.find((p) => p.path === path)
  return page ? [...page.keys, ...(page.states ?? [])] : []
}
const served = (EMPVIBE_PAGES as readonly string[]).filter((p) => !(p in NOT_YET))
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
  it('serves pages the page map knows, every one but the documents of UK-F', () => {
    for (const path of EMPVIBE_PAGES) expect(map.pages.some((p) => p.path === path), path).toBe(true)
    expect(served.length).toBe(EMPVIBE_PAGES.length - Object.keys(NOT_YET).length)
  })

  it('says nothing that is only true in Norway', () => {
    const found = texts().filter(([k, v]) => !NORWAY_TRUE.has(k) && NORWAY.test(v))
    expect(found.map(([k, v]) => `${k}: ${v.match(NORWAY)?.[0]}`)).toEqual([])
  })

  it('names Norway only as the home of the company that provides it', () => {
    for (const k of NORWAY_TRUE) expect(at(shown, k), k).toMatch(/Pundit Invest AS[^·]*Norway/)
  })

  it('makes no claim the law or HSE’s licence does not allow', () => {
    expect(texts().filter(([, v]) => MISLEADING.test(v)).map(([k, v]) => `${k}: ${v.match(MISLEADING)?.[0]}`)).toEqual([])
  })

  it('states no price, «free» or trial before the United Kingdom has prices (UK-F)', () => {
    expect(texts().filter(([, v]) => PRICE.test(v)).map(([k, v]) => `${k}: ${v.match(PRICE)?.[0]}`)).toEqual([])
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
