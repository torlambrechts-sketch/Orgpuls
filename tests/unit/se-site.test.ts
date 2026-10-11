import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SE_PAGES, siteOf } from '@/lib/hosts'
import { OWN_FOOTERS, OWN_NAV } from '@/lib/site/nav'

/**
 * Sweden's site in words (SE-F2, D-276): every page it serves reads Swedish over English with Sweden's
 * pack laid over both (messages/market/se/sv.json, lib/i18n/market-overlay.ts), as a Swedish
 * organisation does. What would go wrong silently, and is held here:
 *
 *  - a text on one of its pages that still says something only true in Norway (its law, its bodies,
 *    its register, its prices), or is still in Norwegian, read by a Swedish employer as theirs;
 *  - a claim Sweden's law does not allow: that a survey is required, that anyone approved the product,
 *    that it fulfils the law, or that anything is filed with Arbetsmiljöverket
 *    (docs/markets/se-legal.md);
 *  - a price, «gratis» or a trial, which Sweden has none of until its own (SE-E);
 *  - an anonymity threshold under Sweden's floor of five;
 *  - a claim that the survey is in Swedish, which the owner has not switched on (locale_sv, X-109);
 *  - a menu or footer entry with no words, or an array a page counts changed in length.
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

const no = read('messages/no.json')
const se = read('messages/market/se/sv.json')
/** what a reader of the Swedish site reads: Swedish over English (lib/i18n/locales.ts fallback), Sweden's pack last */
const shown = merge(merge(read('messages/en.json'), read('messages/sv.json')), se)
const map = read('lib/i18n/site-pages.json') as { pages: { path: string; keys: string[]; states?: string[] }[]; shared: string[] }

/** The instrument's own words and the brand's name: from the registry and the catalogue, not the site's pack */
const SHARED = /^(respond|factor|brand)\./
/** Its privacy notice states facts about the company that provides Orgpuls, a Norwegian one (D-276) */
const isPrivacy = (key: string) => key.startsWith('seo.pages.personvernerklaering.')

/** What is only true in Norway, or written in Norwegian (æ and ø are not Swedish letters) */
const NORWAY =
  /Arbeidstilsynet|arbeidsmiljøloven|\baml\b|\bAMU\b|arbeidsmiljøutvalg|verneombud|bedriftshelse|Brønnøysund|Datatilsynet|Lovdata|kapittel 1A|kap\. 1A|§ 4-3|norske virksomheter|Norge|norsk|Nordvik|Demobedriften|[æøÆØ]/
/** Where Norway is named because it is true: the company's own line under every page */
const NORWAY_TRUE = new Set(['site.chrome.footer.bottom'])
/**
 * What the privacy notice says of Norway because it is true: the company, its address and number, the
 * accounting law it keeps its books by, the Norwegian register it writes to Norwegian organisations from,
 * and the Norwegian authority it answers to beside IMY. Norway's sign-up lookup is not among them: a
 * Swedish organisation types its own facts (no lookup in Sweden)
 */
const NORWAY_IN_PRIVACY =
  /norskt org\.nr 922 698 422|Øvre Prinsdals vei 36L, 1266 Oslo, Norge|skriver till en organisation i Norge|det norska Enhetsregisteret|den norska redovisningslagen \(regnskapsloven\)|\[Datatilsynet\]\(https:\/\/www\.datatilsynet\.no\) i Norge|daglig leder/g
/** What Sweden's law does not allow a product to say (docs/markets/se-legal.md, the brief in D-276) */
const MISLEADING =
  /godkänd av|godkänt av|certifier|rekommenderad av Arbetsmiljöverket|uppfyller (alla|lagens) krav|lagstadgad (enkät|undersökning|medarbetarundersökning)|lagkrav på (en )?enkät|skickas (in )?till Arbetsmiljöverket|rapporter(as|a) till Arbetsmiljöverket|lämnas in till Arbetsmiljöverket/i
/** A price, a currency, «gratis» or a trial: Sweden has no prices until its own (SE-E) */
const PRICE = /(?<!\p{L})(gratis|kr|sek|nok|kronor|provperiod|betalkort|kortuppgifter)(?!\p{L})|€|\$|£|inget kort|utan kort|\d+ dagar gratis/iu
/** A threshold under Sweden's floor of five (MARKET_K_FLOOR.se, 0218) */
const UNDER_FLOOR = /ned till (tre|fyra|3|4)|(tre|fyra|3|4) svar räcker|gränsen (kan )?(sänkas|sättas) till (tre|fyra|3|4)|fyra eller tre/i
/** The survey's language: not Swedish until the owner switches it on (locale_sv, X-109) */
const SURVEY_IN_SWEDISH = /på svenska/i

const pageKeys = (path: string) => {
  const page = map.pages.find((p) => p.path === path)
  return page ? [...page.keys, ...(page.states ?? [])] : []
}
const served = [...SE_PAGES] as string[]
/** A text the Norwegian page map lists that Sweden's site never draws: the articles, templates, demo, and Norway's menu entries */
const navKeys = new Set(OWN_NAV.flatMap((i) => [i.key, ...(i.all ? [i.all] : []), ...(i.children ?? []).map((c) => c.key)]))
const footerLinks = new Set(OWN_FOOTERS.home.flatMap((c) => c.links.map((l) => l.key)))
const footerHeads = new Set(OWN_FOOTERS.home.map((c) => c.head))
const drawn = (key: string) => {
  if (/^seo\.(articles|maler|index)\./.test(key) || key === 'site.chrome.demo' || /^site\.home\.industries\./.test(key)) return false
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
  const fromPack = Object.entries(flat({ site: se.site, seo: se.seo, start: se.start })).filter(([k]) => drawn(k))
  // what a reader reads: a link's route is the site's own address (its route's Norwegian name is never shown, D-270)
  const words = (v: string) => v.replace(/\]\(\/[^)]*\)/g, ']')
  return [...new Map([...fromMap, ...fromPack]).entries()].filter(([k]) => !k.endsWith('.href')).map(([k, v]) => [k, words(v)] as [string, string])
}

describe('Sweden’s site in words (SE-F2, D-276)', () => {
  it('serves pages the page map knows, its privacy policy among them and its terms not yet', () => {
    for (const path of SE_PAGES) expect(map.pages.some((p) => p.path === path), path).toBe(true)
    expect(SE_PAGES as readonly string[]).toContain('/personvernerklaering')
    expect(SE_PAGES as readonly string[]).not.toContain('/vilkar')
    // the footer's bottom line links the privacy policy, and the terms only where a site serves them
    expect(String(at(shown, 'site.chrome.footer.bottom'))).toMatch(/<privacy>Integritetspolicy<\/privacy><terms>[^<]*<\/terms>$/)
    expect(siteOf('se.orgpuls.com')?.own?.pages).toBe(SE_PAGES)
  })

  it('writes every page it serves in Sweden’s pack, in Swedish', () => {
    // each page's own namespace is the pack's, not the Norwegian or English catalogue's
    for (const key of ['site.home', 'site.plattform', 'site.bruksomrader', 'site.hvorfor', 'site.contact', 'seo.lp.lovkrav', 'seo.lp.verneombud', 'seo.lp.smaaBedrifter', 'seo.pages.sikkerhet', 'seo.pages.kontakt', 'seo.pages.personvernerklaering'])
      expect(at(se, key), key).toEqual(expect.anything())
    // every string Norway has under those namespaces, the pack has too, with arrays as long
    const lacking = Object.keys(flat({ site: at(no, 'site') })).filter((k) => /^site\.(home|plattform|bruksomrader|hvorfor|contact|story|chrome)\./.test(k) && !(k in flat({ site: se.site })))
    expect(lacking).toEqual([])
  })

  it('says nothing that is only true in Norway, and nothing in Norwegian', () => {
    const found = texts()
      .map(([k, v]) => [k, isPrivacy(k) ? v.replace(NORWAY_IN_PRIVACY, '') : v] as const)
      .filter(([k, v]) => !NORWAY_TRUE.has(k) && NORWAY.test(v))
    expect(found.map(([k, v]) => `${k}: ${v.match(NORWAY)?.[0]}`)).toEqual([])
  })

  it('names Norway only as the home of the company that provides it', () => {
    for (const k of NORWAY_TRUE) expect(at(shown, k), k).toMatch(/Pundit Invest AS[^·]*Norge/)
  })

  it('makes no claim Sweden’s law does not allow', () => {
    expect(texts().filter(([, v]) => MISLEADING.test(v)).map(([k, v]) => `${k}: ${v.match(MISLEADING)?.[0]}`)).toEqual([])
  })

  it('states no price, «gratis» or trial, which Sweden has none of yet (SE-E)', () => {
    expect(texts().filter(([, v]) => PRICE.test(v)).map(([k, v]) => `${k}: ${v.match(PRICE)?.[0]}`)).toEqual([])
  })

  it('offers no SMS: it names it only in its privacy policy, as what a processor does where it is switched on', () => {
    expect(texts().filter(([k, v]) => !isPrivacy(k) && /(?<!\p{L})sms(?!\p{L})/iu.test(v)).map(([k]) => k)).toEqual([])
  })

  it('offers no threshold under Sweden’s floor of five, and says the survey is in no particular language', () => {
    expect(texts().filter(([, v]) => UNDER_FLOOR.test(v)).map(([k, v]) => `${k}: ${v.match(UNDER_FLOOR)?.[0]}`)).toEqual([])
    expect(texts().filter(([, v]) => SURVEY_IN_SWEDISH.test(v)).map(([k]) => k)).toEqual([])
  })

  it('cites the law the way docs/markets/se-legal.md does, and never Norway’s', () => {
    const law = JSON.stringify(at(se, 'seo.lp.lovkrav'))
    for (const ref of ['3 kap. 2 a §', 'AFS 2023:1', 'AFS 2023:2', 'AFS 2015:4', 'Arbetsmiljöverket']) expect(law, ref).toContain(ref)
    const rep = JSON.stringify(at(se, 'seo.lp.verneombud'))
    for (const ref of ['6 kap. 2 §', '6 kap. 4 §', '6 kap. 6 a §']) expect(rep, ref).toContain(ref)
  })

  it('says, in its privacy policy, where a person in Sweden complains', () => {
    const text = JSON.stringify(at(se, 'seo.pages.personvernerklaering'))
    expect(text).toContain('Integritetsskyddsmyndigheten')
    expect(text).toContain('imy.se')
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
    // in English too, for a sign-in or sign-up page read in English on the Swedish site
    const en = merge(read('messages/en.json'), read('messages/market/se/en.json'))
    for (const item of OWN_NAV) expect(at(en, `site.chrome.nav.${item.key}`), item.key).toEqual(expect.any(String))
  })

  it('shows its pages in Swedish only, as the i18n gate expects of the pack', () => {
    // scripts/verify/i18n.mjs asks the pack's page words in the site's language alone: true only while
    // the site is Swedish and its pages are pinned to it (lib/i18n/request.ts, PAGE_LANG_HEADER)
    expect(siteOf('se.orgpuls.com')?.lang).toBe('sv')
    expect(readFileSync('scripts/verify/i18n.mjs', 'utf8')).toContain("const PAGES_IN_SITE_LANG = { se: 'sv' }")
    expect(readFileSync('lib/i18n/request.ts', 'utf8')).toMatch(/head\.get\(PAGE_LANG_HEADER\) === site\.lang/)
  })

  it('keeps the length of every array the site’s pages count', () => {
    const lengths = (tree: unknown, prefix: string, out: [string, number][] = []): [string, number][] => {
      if (Array.isArray(tree)) {
        out.push([prefix, tree.length])
        tree.forEach((v, i) => lengths(v, `${prefix}.${i}`, out))
      } else if (isTree(tree)) for (const [k, v] of Object.entries(tree)) lengths(v, `${prefix}.${k}`, out)
      return out
    }
    const changed = lengths({ site: se.site, seo: se.seo }, '')
      .map(([k, n]) => [k.slice(1), n, at(no, k.slice(1))] as const)
      .filter(([, n, source]) => Array.isArray(source) && source.length !== n)
      .map(([k, n, source]) => `${k}: ${n} for ${(source as unknown[]).length}`)
    expect(changed).toEqual([])
  })
})

describe('Sweden’s pictures (SE-F3, D-276)', () => {
  it('has its own picture for every product picture the site can show', () => {
    const ids = readFileSync('lib/marketing/shot-ids.ts', 'utf8').match(/'([a-z]+)'/g)!.map((s) => s.slice(1, -1))
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(existsSync(`assets/produkt/se/${id}.webp`), id).toBe(true)
    expect(readFileSync('lib/marketing/shots.ts', 'utf8')).toMatch(/SITE_SHOTS[^=]*=\s*\{[^}]*\bse: SE_SHOTS/)
  })

  it('has its own card for every page it serves with a card of its own, and a default for the rest', () => {
    expect(existsSync('public/og/se/default.png')).toBe(true)
    for (const route of SE_PAGES) {
      const file = `app/(marketing)${route === '/' ? '' : route}/page.tsx`
      const card = existsSync(file) ? readFileSync(file, 'utf8').match(/image: '\/og\/([a-z0-9-]+\.png)'/)?.[1] : undefined
      if (card) expect(existsSync(`public/og/se/${card}`), `${route}: ${card}`).toBe(true)
    }
  })

  it('makes no claim on its cards that the site may not make', () => {
    const pills = at(shown, 'seo.og.pills') as string[]
    expect(pills).toHaveLength(3)
    for (const pill of pills) {
      expect(pill).not.toMatch(NORWAY)
      expect(pill).not.toMatch(MISLEADING)
      expect(pill).not.toMatch(PRICE)
    }
  })
})
