import type { Locale } from '@/lib/i18n/locales'
import type { Brand } from '@/lib/brand'
import { DEFAULT_MARKET, MARKET_CONFIG, MARKET_LANGS, type Market } from '@/lib/markets'
import { EMPVIBE_ARTICLES } from '@/lib/marketing/articles-empvibe'

/**
 * The production hosts (D-90, D-98). Edge-safe: read by the middleware as well as the server.
 *
 *   www.orgpuls.com    the product and the Norwegian public site
 *   en.orgpuls.com     moved (UK-G, D-275): the English edition of Norway's site until Empvibe opened.
 *                      Its pages go to Empvibe's where Empvibe has them, everything else to
 *                      www.orgpuls.com in English (MOVED_HOSTS); EN_HOST overrides it
 *   se.orgpuls.com     the Swedish market (X-109): the product in Swedish, and since SE-F a site of
 *                      its own, in Swedish, for Sweden's law (D-276). SE_HOST overrides it, like
 *                      EN_HOST
 *   de.orgpuls.com     Germany's site of its own, in German (DE-F, D-291), open since DE-G (X-116, D-293)
 *   www.empvibe.com    Empvibe, the English-speaking brand, the United Kingdom's site (X-111, UK-E,
 *                      D-270), open since the move (UK-G, D-275). EMPVIBE_HOST overrides it, like
 *                      EN_HOST
 *
 * `EN_HOST` overrides the default, e.g. for a staging domain. Local and preview builds match
 * none of these, so the language switch works there on one host. The platform admin is no
 * longer here (D-230).
 */
export const MAIN_HOST = 'www.orgpuls.com'

/** A market's own site's host as the market registry names it (lib/markets.ts MarketConfig.site) */
const registryHost = (market: Market): string => new URL(MARKET_CONFIG[market].site!.url).host
export const EN_HOST = process.env.EN_HOST?.trim().toLowerCase() || 'en.orgpuls.com'

export const MAIN_URL = `https://${MAIN_HOST}`

/**
 * What each production host is (D-251): the brand it shows, the market a sign-up there joins, the
 * language it opens in and whether the host decides the language (`pinned`: Empvibe's site is in
 * English whatever the cookie says) or the visitor's choice does. `url` is the canonical
 * address a link made there carries (outboundBase). A new country or brand is a row here, a market
 * in app.markets and its texts, never a branch in a component.
 */
export type Site = {
  host: string
  url: string
  /** the name the site shows (lib/brand.ts): its market's brand, held by tests/unit/brand.test.ts */
  brand: Brand
  market: Market
  lang: Locale
  pinned: boolean
  /** the languages its language switch offers (D-252) */
  langs: readonly Locale[]
  /**
   * A site of its own (D-270): its pages are not the Norwegian site's twins, so they name no
   * alternate on Orgpuls's hosts, and only the pages listed in `pages` are served there, under the
   * addresses in `paths`. Norway's hosts have neither: every page, at its route.
   */
  own?: {
    /**
     * the folder its own pictures and share cards are kept under (assets/produkt/<key>,
     * public/og/<key>): the brand's for Empvibe, the market's for a market of Orgpuls's (D-276)
     */
    key: string
    /** the public site's routes this site serves; any other page of the site is a 404 there */
    pages: readonly string[]
    /** a route's address on this site where it differs, e.g. /plattform at /platform */
    paths: Readonly<Record<string, string>>
  }
}

/**
 * A site's language as a search engine and a link preview name it (BCP 47): its language in its
 * market, en-GB on Empvibe's, sv-SE on Sweden's (D-276)
 */
export const siteTag = (site: Pick<Site, 'lang' | 'market'>): string => `${site.lang === 'no' ? 'nb' : site.lang}-${site.market.toUpperCase()}`

/** what the Norwegian site offers, and every host that is not a site (local, a preview) */
const NORWAY_LANGS: readonly Locale[] = MARKET_LANGS.no

/**
 * The Swedish site (D-254): se.orgpuls.com, Tor's choice «så lenge» (X-109); SE_HOST overrides it,
 * as EN_HOST does the English one. The product opens in Swedish and offers English beside it; the
 * site's own pages are Sweden's, in Swedish (SE-F, D-276).
 */
export const SE_HOST = process.env.SE_HOST?.trim().toLowerCase() || registryHost('se')
export const SE_URL = `https://${SE_HOST}`

/**
 * The pages a market of Orgpuls's own outside Norway serves on its own site, by route (SE-F, D-276;
 * DE-F, D-291): the product, the use cases, the argument, the law, the safety representative's role
 * (skyddsombud, the Betriebsrat), small businesses, security, contact and the privacy notice. Not the
 * prices or the terms, which wait on each market's own (SE-E, DE-E), and not the industries, the
 * articles, the templates or the demo, which are written for Norway. One list, so a page added for
 * these markets is added once; a market that serves more names its own, as Empvibe's does.
 */
const COUNTRY_PAGES = [
  '/',
  '/plattform',
  '/bruksomrader',
  '/hvorfor',
  '/lovkrav',
  '/verneombud',
  '/smaa-bedrifter',
  '/sikkerhet',
  '/kontakt',
  '/personvernerklaering',
] as const

/** The pages Sweden's site serves, by route (SE-F, D-276): the country pages, in Swedish for Swedish law */
export const SE_PAGES = COUNTRY_PAGES

/**
 * Their addresses in Swedish, and the sign-in's and sign-up's (D-276). /plattform and /kontakt are
 * Swedish as they are. The law's address is the words a Swedish employer searches for
 * (organisatorisk och social arbetsmiljö, the OSA rules, AFS 2023:2 chapter 2).
 */
const SE_PATHS: Readonly<Record<string, string>> = {
  '/bruksomrader': '/anvandningsomraden',
  '/hvorfor': '/varfor-orgpuls',
  '/lovkrav': '/organisatorisk-och-social-arbetsmiljo',
  '/verneombud': '/skyddsombud',
  '/smaa-bedrifter': '/sma-foretag',
  '/sikkerhet': '/sakerhet',
  '/personvernerklaering': '/integritetspolicy',
  '/logg-inn': '/logga-in',
  '/registrer': '/registrera',
}

/**
 * The German site (X-115, DE-F, D-291): de.orgpuls.com, Tor's choice («lives at de.orgpuls.com»).
 * DE_HOST overrides it, as SE_HOST does Sweden's. The product opens in German and offers English
 * beside it; the site's own pages are Germany's, in German, for German law (docs/markets/de-legal.md).
 *
 * Built behind `DE_SITE=open` with the host reserved (D-258, D-291) until Tor opened it on 2026-10-29
 * («open de.orgpuls.com», X-116, D-293): served since, like Sweden's, with no switch.
 */
export const DE_HOST = process.env.DE_HOST?.trim().toLowerCase() || registryHost('de')
export const DE_URL = `https://${DE_HOST}`

/** The pages Germany's site serves, by route (DE-F, D-291): the country pages, in German for German law */
export const DE_PAGES = COUNTRY_PAGES

/**
 * Their addresses in German, and the sign-in's and sign-up's (D-291). /plattform and /kontakt are
 * German as they are. The law's address is the words a German employer searches for (the
 * Gefährdungsbeurteilung psychischer Belastung, § 5 Abs. 3 Nr. 6 ArbSchG), without umlauts, as the
 * site's own shape wants (ä → ae).
 */
const DE_PATHS: Readonly<Record<string, string>> = {
  '/bruksomrader': '/anwendungsfaelle',
  '/hvorfor': '/warum-orgpuls',
  '/lovkrav': '/gefaehrdungsbeurteilung-psychische-belastung',
  '/verneombud': '/betriebsrat',
  '/smaa-bedrifter': '/kleine-unternehmen',
  '/sikkerhet': '/sicherheit',
  '/personvernerklaering': '/datenschutz',
  '/logg-inn': '/anmelden',
  '/registrer': '/registrieren',
}

/** Germany's site row (D-291, served since D-293); exported for its tests and its pictures */
export const DE_SITE: Site = {
  host: DE_HOST,
  url: DE_URL,
  brand: MARKET_CONFIG.de.brand,
  market: 'de',
  lang: 'de',
  pinned: false,
  langs: MARKET_LANGS.de,
  own: { key: 'de', pages: DE_PAGES, paths: DE_PATHS },
}

/**
 * Empvibe's site, the United Kingdom's (X-111, UK-E, D-270): www.empvibe.com, with the bare domain
 * as its alias. EMPVIBE_HOST overrides the address, as EN_HOST does the English one.
 */
export const EMPVIBE_HOST = process.env.EMPVIBE_HOST?.trim().toLowerCase() || registryHost('gb')
export const EMPVIBE_URL = `https://${EMPVIBE_HOST}`

/**
 * The pages Empvibe's site serves, by route (D-270): the product, the use cases, the argument, the
 * law, safety representatives, small businesses, security, contact, the prices and the documents,
 * and since UK-H its own articles (D-278), written for the United Kingdom. Not the industries,
 * Norway's articles, the templates or the demo, which are written for Norway.
 */
export const EMPVIBE_PAGES: readonly string[] = [
  '/',
  '/plattform',
  '/bruksomrader',
  '/hvorfor',
  '/lovkrav',
  '/verneombud',
  '/smaa-bedrifter',
  '/sikkerhet',
  '/kontakt',
  // the United Kingdom's prices (X-113, UK-G, D-275): the gb pack's words, PLAN_PRICES.gb's amounts
  '/priser',
  // the UK privacy notice and terms (UK-F, D-274): the gb pack's own, not Norway's, which name its law,
  // its regulator, its prices and its register
  '/personvernerklaering',
  '/vilkar',
  // its own articles (UK-H, D-278): the index and each article (lib/marketing/articles-empvibe.ts)
  '/artikler',
  ...EMPVIBE_ARTICLES.map((a) => `/artikler/${a.slug}`),
]

/** Their addresses in English, and the sign-in's and sign-up's, which every page links to (D-270) */
const EMPVIBE_PATHS: Readonly<Record<string, string>> = {
  '/plattform': '/platform',
  '/bruksomrader': '/use-cases',
  '/hvorfor': '/why-empvibe',
  '/lovkrav': '/work-related-stress-law',
  '/verneombud': '/safety-representatives',
  '/smaa-bedrifter': '/small-businesses',
  '/sikkerhet': '/security',
  '/kontakt': '/contact',
  '/personvernerklaering': '/privacy',
  '/vilkar': '/terms',
  '/priser': '/pricing',
  '/logg-inn': '/sign-in',
  '/registrer': '/sign-up',
  '/artikler': '/articles',
  ...Object.fromEntries(EMPVIBE_ARTICLES.map((a) => [`/artikler/${a.slug}`, `/articles/${a.slug}`])),
}

const EMPVIBE_SITES: readonly Site[] = [EMPVIBE_HOST, 'empvibe.com'].map((host) => ({
  host,
  url: EMPVIBE_URL,
  brand: MARKET_CONFIG.gb.brand,
  market: 'gb',
  lang: 'en',
  pinned: true,
  langs: MARKET_LANGS.gb,
  own: { key: 'empvibe', pages: EMPVIBE_PAGES, paths: EMPVIBE_PATHS },
}))

export const SITES: readonly Site[] = [
  { host: MAIN_HOST, url: MAIN_URL, brand: MARKET_CONFIG.no.brand, market: 'no', lang: 'no', pinned: false, langs: NORWAY_LANGS },
  { host: 'orgpuls.com', url: MAIN_URL, brand: MARKET_CONFIG.no.brand, market: 'no', lang: 'no', pinned: false, langs: NORWAY_LANGS },
  // Sweden's site of its own (SE-F, D-276): its pages in Swedish, the product in Swedish or English
  {
    host: SE_HOST,
    url: SE_URL,
    brand: MARKET_CONFIG.se.brand,
    market: 'se',
    lang: 'sv',
    pinned: false,
    langs: MARKET_LANGS.se,
    own: { key: 'se', pages: SE_PAGES, paths: SE_PATHS },
  },
  // Germany's site of its own (DE-F, D-291; open since DE-G, X-116): its pages in German, the product in
  // German or English; served while the market registry says it is open (lib/markets.ts MarketConfig.site)
  ...(MARKET_CONFIG.de.site?.open ? [DE_SITE] : []),
  ...EMPVIBE_SITES,
]

/**
 * Where an English reader goes from a host that no longer has a site of its own (UK-G, D-275):
 *
 *   the brand's pages: the start       the same page on Empvibe's site, at its English address:
 *   page, the platform, the use cases, what the product is and does, which is the same for every
 *   why, contact                       market (X-111: «en.orgpuls.com redirects there»)
 *   every other page: Norway's prices, the same address on www.orgpuls.com, in English: these
 *   terms, privacy notice, law, safety pages state Norway's prices, contract and law, which
 *   representatives, industries,       English-speaking firms in Norway keep (X-111), so a
 *   articles; signing in and up; the   customer's bookmark never opens another market's contract;
 *   product's own screens              and the product's screens open on its sign-in in English
 *   a link that carries its own key    the same address on www.orgpuls.com, with its query: a
 *   or language (survey, entry code,   respondent's link and a poster printed before the move
 *   results page, invitation), the     keep working, in the employee's own language
 *   auth callbacks, the API, the files
 *
 * English is chosen through the switch's own route, for this browser only (`profil=0`): following
 * an old link never changes a signed-in person's saved language. A form posted there (`read` false)
 * goes to the same address, method kept, as nothing else can take it. `publicPath` is the
 * middleware's own test of whether the path is the public site's.
 */
export function toEnglish(path: string, search: string, publicPath: boolean, read = true): string {
  if (read && publicPath && (BRAND_PAGES as readonly string[]).includes(path)) return `${EMPVIBE_URL}${addressOf(EMPVIBE_PATHS, path)}${search}`
  if (!read || within(AS_THEY_ARE, path) || /\.[a-z0-9]+$/i.test(path)) return `${MAIN_URL}${path}${search}`
  // the switch takes a return of at most 300 characters (lib/i18n/switch.ts safeReturn): a longer
  // query is dropped rather than the page
  const til = path.length + search.length <= 300 ? `${path}${search}` : path
  return `${MAIN_URL}/api/sprak?${new URLSearchParams({ l: 'en', til, profil: '0' })}`
}

/** The pages that are the brand's, not a market's: the same product, said by Empvibe for its market */
const BRAND_PAGES = ['/', '/plattform', '/bruksomrader', '/hvorfor', '/kontakt'] as const

/** What a moved host sends on as it is: links with their own key or language, the auth callbacks, the API, the logo */
const AS_THEY_ARE = ['/s', '/inn', '/r', '/bli-med', '/auth', '/api', '/logo']

/** whether the path is one of these or under one */
const within = (list: readonly string[], path: string) => list.some((p) => path === p || path.startsWith(`${p}/`))

/**
 * A host whose site moved (UK-G, D-275): en.orgpuls.com, the English edition of Norway's site, whose
 * English-speaking audience is Empvibe's now (X-111: «then one change opens empvibe.com, and
 * en.orgpuls.com redirects there»). Every address goes where `toEnglish` says, permanently (308, so a
 * form posted there keeps its method). Nothing is served on the host any more.
 */
export const MOVED_HOSTS: readonly string[] = [EN_HOST]

/**
 * Addresses registered for a market that is not open yet: routed to the app (DNS, the Vercel domain)
 * but no site of their own (X-110). Nothing is served there, not even the sign-up: no market exists to
 * join, and the Norwegian site would otherwise be indexed a second time under another name and sign a
 * firm up as a Norwegian one. Every request goes where an English reader goes from en.orgpuls.com
 * (`toEnglish`), temporarily (307), so the day the market opens, its own site takes over (hostGate,
 * D-258). de.orgpuls.com was the one such host, from X-110 until DE-G opened it (D-293); none today.
 */
export const RESERVED_HOSTS: readonly string[] = MARKET_CONFIG.de.site?.open ? [] : [DE_HOST]

/** The production hosts of the product and the public site. */
export const PUBLIC_HOSTS: readonly string[] = SITES.map((s) => s.host)

export const hostOf = (value: string | null | undefined) => (value ?? '').split(':')[0]?.toLowerCase() ?? ''

/** The site a host is, or null for a local, preview or unknown host. */
export function siteOf(host: string | null | undefined): Site | null {
  const name = hostOf(host)
  return SITES.find((s) => s.host === name) ?? null
}

/**
 * The market a sign-up on this host joins: the site's, and Norway on any other host (local, a
 * preview). A spoofed Host header can only name a market that exists, and the database gives the
 * organisation that market's floor, which is never lower than the platform's (0214).
 */
export const marketOfHost = (host: string | null | undefined): Market => siteOf(host)?.market ?? DEFAULT_MARKET

/** The languages the public site's switch offers on this host: the site's, Norway's elsewhere (D-252). */
export const siteLangs = (host: string | null | undefined): readonly Locale[] => siteOf(host)?.langs ?? NORWAY_LANGS

/**
 * A link's address on this site (D-270): a route the site serves under another address gets that
 * one, with its query and fragment kept; anything else is the link as written. On Norway's hosts,
 * and any host that is not a site, every link is its route.
 */
export function addressOf(paths: Readonly<Record<string, string>> | undefined, href: string): string {
  if (!paths || !href.startsWith('/')) return href
  const at = href.search(/[?#]/)
  const path = at < 0 ? href : href.slice(0, at)
  const alias = paths[path]
  return alias ? `${alias}${at < 0 ? '' : href.slice(at)}` : href
}

/** The route an address on this site shows: the alias's route, or the address itself */
export function routeOf(paths: Readonly<Record<string, string>> | undefined, path: string): string {
  if (!paths) return path
  for (const [route, alias] of Object.entries(paths)) if (alias === path) return route
  return path
}

/**
 * Whether a link leaves the pages a site writes in its one language for a route in the reader's own
 * choice, or the reverse (D-276): on Sweden's site, from a page to signing in or up, or back. The
 * language then changes, and the layout around both is not drawn again on a client-side navigation,
 * so such a link is a page load. `pages` are the routes in the site's language; none on a site whose
 * every route is in one language (Empvibe's) or that has no pages of its own (Norway's).
 */
export function changesLanguage(pages: readonly string[] | undefined, from: string, href: string): boolean {
  if (!pages || !href.startsWith('/')) return false
  const to = href.split(/[?#]/)[0]!
  return pages.includes(from) !== pages.includes(to)
}

/** a page of the public site that no route answers: a request for a page this site does not serve is shown it (D-270) */
export const NOT_SERVED_PATH = '/_ikke/her'

const LOOPBACK = new Set(['localhost', '127.0.0.1'])

/**
 * The base of a link that leaves the browser — printed on a poster, mailed, texted, handed to
 * someone else — from the request's host (x-forwarded-host, then host). Such a link has to work
 * for whoever receives it, wherever it was made:
 *
 *   a production host (SITES)         its site's url, over https; bare orgpuls.com becomes MAIN_URL
 *   a loopback host                   itself, with its port and protocol: local and QA only,
 *                                     where nothing is sent to anyone
 *   anything else                     MAIN_URL — a Vercel preview, a proxy, or a spoofed Host
 *                                     header never ends up on a poster or in someone's inbox
 */
export function outboundBase(host: string | null | undefined, proto: string | null | undefined): string {
  const raw = (host ?? '').split(',')[0]?.trim().toLowerCase() ?? ''
  const name = hostOf(raw)
  const site = siteOf(name)
  if (site) return site.url
  if (LOOPBACK.has(name) || raw.startsWith('[::1]')) return `${proto === 'https' ? 'https' : 'http'}://${raw}`
  return MAIN_URL
}

/**
 * The addresses every site serves whatever its pages (D-256): signing in and up, the auth callbacks,
 * the respondent's survey and pages, an invitation and a new password, the logo, the API (the
 * language switch among it) and robots.txt. The product's own screens need a session and are not
 * public, so they pass as everywhere.
 */
const WITHOUT_SITE = ['/logg-inn', '/registrer', '/auth', '/s', '/inn', '/r', '/logo', '/bli-med', '/nytt-passord', '/api', '/robots.txt']

/**
 * What a request to this host may see. On Norway's hosts and any host that is not a site: everything,
 * indexed as before. On a site of its own (Empvibe's, Sweden's): its pages at its own addresses, and a
 * 404 for the rest of the public site (`ownSite`). On a moved host (en.orgpuls.com, D-275) and a
 * reserved one (Germany, D-258): nothing; every address goes where an English reader is sent
 * (`toEnglish`), an absolute URL with its query, permanently from the moved host. `publicPath` is the
 * middleware's own test of whether the path is the public site's (lib/supabase/middleware.ts
 * isPublic), `search` the request's query, `read` whether it is a page load (GET or HEAD).
 *
 * A market's host before its own site (D-256: the Norwegian pages sent to the sign-up, nothing
 * indexed) ended with Sweden's site (SE-F, D-276), the only host it served.
 */
export function hostGate(
  host: string | null | undefined,
  path: string,
  publicPath: boolean,
  search = '',
  read = true,
): { noindex: boolean; redirect: string | null; rewrite?: string; canonical?: true; permanent?: true; lang?: Locale } {
  const name = hostOf(host)
  if (MOVED_HOSTS.includes(name)) return { noindex: true, redirect: toEnglish(path, search, publicPath, read), permanent: true }
  if (RESERVED_HOSTS.includes(name)) return { noindex: true, redirect: toEnglish(path, search, publicPath, read) }
  const site = siteOf(host)
  if (site?.own) return ownSite(site as Site & { own: NonNullable<Site['own']> }, path, publicPath)
  return { noindex: false, redirect: null }
}

/**
 * A site of its own (Empvibe's, D-270; Sweden's, D-276): an address in its language shows its route
 * in place; the route itself, asked for by its Norwegian address, goes to the site's own address
 * (`canonical`: a permanent redirect that keeps the query, for a page load only), so each page has
 * one address; a page of the public site it does not serve is a 404. What is not the public site
 * (the product, the survey, sign-in links, the API, robots.txt and the sitemap) passes as it does
 * everywhere.
 *
 * Its own pages are written in its language only (`lang`): the middleware tells the request config
 * (PAGE_LANG_HEADER), so a visitor who chose English for the product still reads Sweden's pages in
 * Swedish rather than Norway's in English. The product, the sign-in and the survey keep the choice.
 */
function ownSite(site: Site & { own: NonNullable<Site['own']> }, path: string, publicPath: boolean) {
  const own = site.own
  const page = (route: string) => (own.pages as readonly string[]).includes(route)
  const serves = (route: string) =>
    page(route) || WITHOUT_SITE.some((p) => route === p || route.startsWith(`${p}/`)) || SITE_FILES.includes(route) || INDEXNOW_KEY.test(route)
  const notServed = { noindex: true, redirect: null, rewrite: NOT_SERVED_PATH }
  const route = routeOf(own.paths, path)
  const lang = page(route) ? { lang: site.lang } : {}
  if (route !== path) return serves(route) ? { noindex: false, redirect: null, rewrite: route, ...lang } : notServed
  const alias = own.paths[path]
  if (alias && serves(path)) return { noindex: false, redirect: alias, canonical: true as const, ...lang }
  return publicPath && !serves(path) ? notServed : { noindex: false, redirect: null, ...lang }
}

/**
 * The request header the middleware names the host a request is answered as (lib/site/host.ts
 * `requestHost`): the host itself, or on a host that is not a site, the site a preview chose
 * (`effectiveHost`). Set on every request the middleware passes on and deleted from what the visitor
 * sent, so a page reads one host, the one the gate decided on, never a value from outside.
 */
export const SITE_HOST_HEADER = 'x-orgpuls-site-host'

/** The cookie a preview's or a local build's choice of site is kept in (`?site=se`, `?site=off`) */
export const PREVIEW_SITE_COOKIE = 'orgpuls-site'

/**
 * The host a request is answered as. A production host is always itself: a site, a moved host or a
 * reserved one never takes a choice from the visitor. A host that is none of these (a Vercel preview,
 * localhost, the CI stack) shows Norway's site, as before, unless the request chose another site by
 * its market (`?site=se`, kept in PREVIEW_SITE_COOKIE): then it is answered as that site's host, so a
 * preview, an end-to-end run or a screenshot can show Sweden's, Germany's or
 * Empvibe's site without its domain. Off on a production deployment whatever the host.
 */
export function effectiveHost(
  host: string | null | undefined,
  choice: string | null | undefined,
  production = process.env.VERCEL_ENV === 'production',
): string | null {
  const name = hostOf(host)
  if (!choice || production || siteOf(name) || MOVED_HOSTS.includes(name) || RESERVED_HOSTS.includes(name)) return host ?? null
  return SITES.find((s) => s.market === choice)?.host ?? host ?? null
}

/**
 * The request header a site of its own's page carries its language in (hostGate `lang`), set by the
 * middleware and read by the request config (lib/i18n/request.ts), which takes it only where it names
 * the site's own language, so a header sent by anyone else can only ask for what the page is anyway
 */
export const PAGE_LANG_HEADER = 'x-orgpuls-page-lang'

/** the files a site of its own answers for itself (app/sitemap.ts, app/llms.txt) */
const SITE_FILES = ['/sitemap.xml', '/llms.txt']

/** the IndexNow key (public/<32 hex>.txt, D-234), which the engines fetch on each host it submits for */
const INDEXNOW_KEY = /^\/[0-9a-f]{32}\.txt$/
