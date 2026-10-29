import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mergeMessages } from '@/lib/i18n/merge'
import { OWN_FOOTERS, OWN_NAV } from '@/lib/site/nav'

// the German site was behind DE_SITE until DE-G opened it (X-116, D-293); it is served with no switch now
const { DE_PAGES, siteOf } = await import('@/lib/hosts')

/**
 * Germany's site in words (DE-F2, D-291): every page it serves reads German over English with
 * Germany's pack laid over both (messages/market/de/de.json, lib/i18n/market-overlay.ts), as a German
 * organisation does. What would go wrong silently, and is held here:
 *
 *  - a text on one of its pages that still says something only true in Norway (its law, its bodies,
 *    its register, its prices), or is still in Norwegian, read by a German employer as theirs;
 *  - a claim Germany's law does not allow: that a survey is required, that anyone approved the product,
 *    that it fulfils the law, that anything is filed with the authority, that the statute sets an
 *    interval, or that a firm must have a works council (docs/markets/de-legal.md);
 *  - a price, «kostenlos» or a trial, which Germany has none of until its own (DE-E);
 *  - an anonymity threshold under Germany's floor of five;
 *  - a claim that the survey is in German, which is not switched on (locale_de, DE-A2);
 *  - a menu or footer entry with no words, or an array a page counts changed in length.
 */
type Tree = { [k: string]: unknown }
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Tree
const isTree = (v: unknown): v is Tree => !!v && typeof v === 'object' && !Array.isArray(v)
/** the request config's own merge (lib/i18n/merge.ts): b over a, key by key, a list of the same length item by item */
const merge = (a: Tree, b: Tree): Tree => mergeMessages(a, b)
const flat = (tree: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> => {
  if (typeof tree === 'string') out[prefix] = tree
  else if (Array.isArray(tree)) tree.forEach((v, i) => flat(v, `${prefix}.${i}`, out))
  else if (isTree(tree)) for (const [k, v] of Object.entries(tree)) flat(v, prefix ? `${prefix}.${k}` : k, out)
  return out
}
const at = (tree: unknown, key: string): unknown => key.split('.').reduce<unknown>((o, p) => (o as Tree | undefined)?.[p], tree)

const no = read('messages/no.json')
const de = read('messages/market/de/de.json')
/** what a reader of the German site reads: German over English (lib/i18n/locales.ts fallback), Germany's pack last */
const shown = merge(merge(read('messages/en.json'), read('messages/de.json')), de)
const map = read('lib/i18n/site-pages.json') as { pages: { path: string; keys: string[]; states?: string[] }[]; shared: string[] }

/** The instrument's own words and the brand's name: from the registry and the catalogue, not the site's pack */
const SHARED = /^(respond|factor|brand)\./
/** Its privacy notice states facts about the company that provides Orgpuls, a Norwegian one (D-276) */
const isPrivacy = (key: string) => key.startsWith('seo.pages.personvernerklaering.')
/** Its law page states the fine the statute names (§ 25 ArbSchG), which is not a price */
const isLaw = (key: string) => key.startsWith('seo.lp.lovkrav.')

/** What is only true in Norway, or written in Norwegian (æ, ø and å are not German letters) */
const NORWAY =
  /Arbeidstilsynet|arbeidsmiljøloven|\baml\b|\bAMU\b|arbeidsmiljøutvalg|verneombud|bedriftshelse|Brønnøysund|Datatilsynet|Lovdata|kapittel 1A|kap\. 1A|§ 4-3|norske virksomheter|Norwegen|norwegisch|Norge|norsk|Nordvik|Demobedriften|[æøåÆØÅ]/
/** Where Norway is named because it is true: the company's own line under every page */
const NORWAY_TRUE = new Set(['site.chrome.footer.bottom'])
/**
 * What the privacy notice says of Norway because it is true: the company, its address and number, the
 * accounting law it keeps its books by, the Norwegian register it writes to Norwegian organisations from,
 * and the Norwegian authority it answers to beside the German ones. Norway's sign-up lookup is not among
 * them: a German organisation types its own facts (no lookup in Germany, REGISTRY_LOOKUP.de)
 */
const NORWAY_IN_PRIVACY =
  /norwegische Org\.-Nr\. 922 698 422|Øvre Prinsdals vei 36L, 1266 Oslo, Norwegen|an eine Organisation in Norwegen schreiben|dem norwegischen Einheitsregister \(Enhetsregisteret\)|das norwegische Rechnungslegungsgesetz \(regnskapsloven\)|\[Datatilsynet\]\(https:\/\/www\.datatilsynet\.no\) in Norwegen|daglig leder/g
/** What Germany's law does not allow a product to say (docs/markets/de-legal.md, the brief in D-291) */
const MISLEADING =
  /zertifiziert|zugelassen von|genehmigt von|von der (Arbeitsschutzbehörde|Berufsgenossenschaft|GDA|BAuA) empfohlen|erfüllt (alle|die|sämtliche) (gesetzlichen )?(Anforderungen|Pflichten)|gesetzlich vorgeschriebene (Befragung|Mitarbeiterbefragung|Umfrage)|Pflichtbefragung|(bei|an) (der|die) (Behörde|Arbeitsschutzbehörde|Berufsgenossenschaft) eingereicht|nach der GDA|GDA-Leitlinie|laut (GDA|BAuA|BAG)|Bundesarbeitsgericht/i
/** An interval the statute does not set (de-legal.md § 1: never «jährlich» as if the ArbSchG said so) */
const INTERVAL_BY_LAW = /(das Gesetz|ArbSchG|gesetzlich)[^.]{0,80}(jährlich|einmal im Jahr)|(jährlich|einmal im Jahr)[^.]{0,80}(vorgeschrieben|verlangt das Gesetz|gesetzliche Pflicht)/i
/** A duty to have a works council, which the BetrVG does not impose (de-legal.md § 5) */
const COUNCIL_DUTY = /(Sie|Arbeitgeber|Unternehmen|Betriebe?) (müssen|muss) einen Betriebsrat|Betriebsrat ist (Pflicht|vorgeschrieben)|verpflichtet, einen Betriebsrat/i
/** A price, a currency, «kostenlos» or a trial: Germany has no prices until its own (DE-E) */
const PRICE = /(?<!\p{L})(gratis|kostenlos|kostenfrei|kr|sek|nok|eur|euro|testphase|probemonat|kreditkarte|kartendaten)(?!\p{L})|€|\$|£|ohne Karte|\d+ Tage (gratis|kostenlos)/iu
/** The fine the law page states (§ 25 Abs. 2 ArbSchG): the statute's figure, not a price */
const FINE = /Geldbuße (kann )?bis zu 30\.000 Euro/g
/** A threshold under Germany's floor of five (MARKET_K_FLOOR.de, 0236) */
const UNDER_FLOOR = /auf (drei|vier|3|4) (herunter|senken|gesenkt)|(drei|vier|3|4) Antworten reichen|Grenze (kann )?(auf|bis auf) (drei|vier|3|4)|vier oder drei/i
/** The survey's language: not German until it is switched on (locale_de, DE-A2) */
const SURVEY_IN_GERMAN = /auf Deutsch/i

const pageKeys = (path: string) => {
  const page = map.pages.find((p) => p.path === path)
  return page ? [...page.keys, ...(page.states ?? [])] : []
}
const served = [...DE_PAGES] as string[]
/** A text the Norwegian page map lists that Germany's site never draws: the articles, templates, demo, and Norway's menu entries */
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
  const fromPack = Object.entries(flat({ site: de.site, seo: de.seo, start: de.start })).filter(([k]) => drawn(k))
  // what a reader reads: a link's route is the site's own address (its route's Norwegian name is never shown, D-270)
  const words = (v: string) => v.replace(/\]\(\/[^)]*\)/g, ']')
  return [...new Map([...fromMap, ...fromPack]).entries()].filter(([k]) => !k.endsWith('.href')).map(([k, v]) => [k, words(v)] as [string, string])
}

describe('Germany’s site in words (DE-F2, D-291)', () => {
  it('serves pages the page map knows, its privacy policy among them and its terms not yet', () => {
    for (const path of DE_PAGES) expect(map.pages.some((p) => p.path === path), path).toBe(true)
    expect(DE_PAGES as readonly string[]).toContain('/personvernerklaering')
    expect(DE_PAGES as readonly string[]).not.toContain('/vilkar')
    // the footer's bottom line links the privacy policy, and the terms only where a site serves them
    expect(String(at(shown, 'site.chrome.footer.bottom'))).toMatch(/<privacy>Datenschutz<\/privacy><terms>[^<]*<\/terms>$/)
    expect(siteOf('de.orgpuls.com')?.own?.pages).toBe(DE_PAGES)
  })

  it('writes every page it serves in Germany’s pack, in German', () => {
    // each page's own namespace is the pack's, not the Norwegian or English catalogue's
    for (const key of ['site.home', 'site.plattform', 'site.bruksomrader', 'site.hvorfor', 'site.contact', 'seo.lp.lovkrav', 'seo.lp.verneombud', 'seo.lp.smaaBedrifter', 'seo.pages.sikkerhet', 'seo.pages.kontakt', 'seo.pages.personvernerklaering'])
      expect(at(de, key), key).toEqual(expect.anything())
    // every string Norway has under those namespaces, the pack has too, with arrays as long
    const lacking = Object.keys(flat({ site: at(no, 'site') })).filter((k) => /^site\.(home|plattform|bruksomrader|hvorfor|contact|story|chrome)\./.test(k) && !(k in flat({ site: de.site })))
    expect(lacking).toEqual([])
  })

  it('says nothing that is only true in Norway, and nothing in Norwegian', () => {
    const found = texts()
      .map(([k, v]) => [k, isPrivacy(k) ? v.replace(NORWAY_IN_PRIVACY, '') : v] as const)
      .filter(([k, v]) => !NORWAY_TRUE.has(k) && NORWAY.test(v))
    expect(found.map(([k, v]) => `${k}: ${v.match(NORWAY)?.[0]}`)).toEqual([])
  })

  it('names Norway only as the home of the company that provides it', () => {
    for (const k of NORWAY_TRUE) expect(at(shown, k), k).toMatch(/Pundit Invest AS[^·]*Norwegen/)
  })

  it('makes no claim Germany’s law does not allow', () => {
    expect(texts().filter(([, v]) => MISLEADING.test(v)).map(([k, v]) => `${k}: ${v.match(MISLEADING)?.[0]}`)).toEqual([])
    expect(texts().filter(([, v]) => INTERVAL_BY_LAW.test(v)).map(([k, v]) => `${k}: ${v.match(INTERVAL_BY_LAW)?.[0]}`)).toEqual([])
    expect(texts().filter(([, v]) => COUNCIL_DUTY.test(v)).map(([k, v]) => `${k}: ${v.match(COUNCIL_DUTY)?.[0]}`)).toEqual([])
  })

  it('states no price, «kostenlos» or trial, which Germany has none of yet (DE-E)', () => {
    const priced = texts()
      .map(([k, v]) => [k, isLaw(k) ? v.replace(FINE, '') : v] as const)
      .filter(([, v]) => PRICE.test(v))
    expect(priced.map(([k, v]) => `${k}: ${v.match(PRICE)?.[0]}`)).toEqual([])
  })

  it('offers no SMS: it names it only in its privacy policy, as what a processor does where it is switched on', () => {
    expect(texts().filter(([k, v]) => !isPrivacy(k) && /(?<!\p{L})sms(?!\p{L})/iu.test(v)).map(([k]) => k)).toEqual([])
  })

  it('offers no threshold under Germany’s floor of five, and says the survey is in no particular language', () => {
    expect(texts().filter(([, v]) => UNDER_FLOOR.test(v)).map(([k, v]) => `${k}: ${v.match(UNDER_FLOOR)?.[0]}`)).toEqual([])
    expect(texts().filter(([, v]) => SURVEY_IN_GERMAN.test(v)).map(([k]) => k)).toEqual([])
  })

  it('cites the law the way docs/markets/de-legal.md does, and never Norway’s', () => {
    const law = JSON.stringify(at(de, 'seo.lp.lovkrav'))
    for (const ref of ['§ 5 Abs. 3 Nr. 6 ArbSchG', '§ 3 Abs. 1', '§ 6 ArbSchG', '§ 87 Abs. 1 Nr. 7 BetrVG', '§ 21 Abs. 1a', '§ 22', '§ 25', 'Arbeitsschutzbehörde']) expect(law, ref).toContain(ref)
    const council = JSON.stringify(at(de, 'seo.lp.verneombud'))
    for (const ref of ['§ 1 BetrVG', '§ 80 Abs. 2', '§ 87 Abs. 1 Nr. 7', '§ 89 Abs. 2', '§ 37 Abs. 6', '§ 22 SGB VII']) expect(council, ref).toContain(ref)
    // the third role is the works council, named as the law names it
    expect(at(de, 'seo.lp.verneombud.card.title')).toBe('Betriebsrat')
  })

  it('rests the processing on the statutory duty, never on consent, and says where a person in Germany complains', () => {
    const security = JSON.stringify(at(de, 'seo.pages.sikkerhet'))
    for (const ref of ['Art. 6 Abs. 1 lit. c DSGVO', '§ 26 Abs. 1 BDSG', '§ 26 Abs. 2 BDSG', '§ 26 Abs. 4 BDSG', 'Art. 28 DSGVO']) expect(security, ref).toContain(ref)
    const privacy = JSON.stringify(at(de, 'seo.pages.personvernerklaering'))
    expect(privacy).toContain('Datenschutzaufsichtsbehörde')
    expect(privacy).toContain('bfdi.bund.de')
    expect(privacy).toContain('datatilsynet.no')
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
    // in English too, for a sign-in or sign-up page read in English on the German site
    const en = merge(read('messages/en.json'), read('messages/market/de/en.json'))
    for (const item of OWN_NAV) expect(at(en, `site.chrome.nav.${item.key}`), item.key).toEqual(expect.any(String))
    for (const column of OWN_FOOTERS.home) for (const l of column.links) expect(at(en, `site.chrome.footer.link.${l.key}`), l.key).toEqual(expect.any(String))
  })

  it('shows its pages in German only, as the i18n gate expects of the pack', () => {
    // scripts/verify/i18n.mjs asks the pack's page words in the site's language alone: true only while
    // the site is German and its pages are pinned to it (lib/i18n/request.ts, PAGE_LANG_HEADER)
    expect(siteOf('de.orgpuls.com')?.lang).toBe('de')
    expect(readFileSync('scripts/verify/i18n.mjs', 'utf8')).toMatch(/const PAGES_IN_SITE_LANG = \{[^}]*\bde: 'de'[^}]*\}/)
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
    const changed = lengths({ site: de.site, seo: de.seo }, '')
      .map(([k, n]) => [k.slice(1), n, at(no, k.slice(1))] as const)
      .filter(([, n, source]) => Array.isArray(source) && source.length !== n)
      .map(([k, n, source]) => `${k}: ${n} for ${(source as unknown[]).length}`)
    expect(changed).toEqual([])
  })
})

describe('Germany’s pictures (DE-F3, D-291)', () => {
  it('has its own picture for every product picture the site can show', () => {
    const ids = readFileSync('lib/marketing/shot-ids.ts', 'utf8').match(/'([a-z]+)'/g)!.map((s) => s.slice(1, -1))
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(existsSync(`assets/produkt/de/${id}.webp`), id).toBe(true)
    expect(readFileSync('lib/marketing/shots.ts', 'utf8')).toMatch(/SITE_SHOTS[^=]*=\s*\{[^}]*\bde: DE_SHOTS/)
  })

  it('has its own card for every page it serves with a card of its own, and a default for the rest', () => {
    expect(existsSync('public/og/de/default.png')).toBe(true)
    for (const route of DE_PAGES) {
      const file = `app/(marketing)${route === '/' ? '' : route}/page.tsx`
      const card = existsSync(file) ? readFileSync(file, 'utf8').match(/image: '\/og\/([a-z0-9-]+\.png)'/)?.[1] : undefined
      if (card) expect(existsSync(`public/og/de/${card}`), `${route}: ${card}`).toBe(true)
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

  it('tells the same scenario as a German firm: the fixture replaces every Norwegian text and keeps the figures', () => {
    const src = readFileSync('scripts/seed/design-fixture.de.mjs', 'utf8')
    expect(src).toMatch(/market: 'de'/)
    expect(src).toMatch(/lang: 'de'/)
    expect(src).toMatch(/timezone: 'Europe\/Berlin'/)
    // a USt-IdNr. in the shape the market's number rule checks (0236): DE and nine digits
    expect(src).toMatch(/number: 'DE\d{9}'/)
    // its own id space, apart from Norway's, the United Kingdom's and Sweden's
    expect(src).toMatch(/ID_TO = '00000000-0000-4000-8049-'/)
    expect(readFileSync('scripts/seed/design-fixture.gb.mjs', 'utf8')).not.toContain('8049')
    expect(readFileSync('scripts/seed/design-fixture.se.mjs', 'utf8')).not.toContain('8049')
    // the QA stack seeds it beside the others, and the local account signs in to it
    expect(readFileSync('scripts/qa/up.sh', 'utf8')).toContain('design-fixture.mjs --market de')
    expect(readFileSync('supabase/tests/local_account.sql', 'utf8')).toContain('00000000-0000-4000-8049-000000000001')
  })
})
