import type { Locale } from '@/lib/i18n/locales'
import type { Brand } from '@/lib/brand'
import { DEFAULT_MARKET, MARKET_LANGS, type Market } from '@/lib/markets'

/**
 * The production hosts (D-90, D-98). Edge-safe: read by the middleware as well as the server.
 *
 *   www.orgpuls.com    the product and the Norwegian public site
 *   en.orgpuls.com     moved (UK-G, D-275): the English edition of Norway's site until Empvibe opened.
 *                      Its pages go to Empvibe's where Empvibe has them, everything else to
 *                      www.orgpuls.com in English (MOVED_HOSTS); EN_HOST overrides it
 *   se.orgpuls.com     the Swedish market (X-109): sign-up and product in Swedish; its public site
 *                      is SE-F, so until then its public pages are not served there (D-256).
 *                      SE_HOST overrides it, like EN_HOST
 *   de.orgpuls.com     reserved for Germany (X-110): every address goes where an English reader is
 *                      sent from en.orgpuls.com, until the market opens (RESERVED_HOSTS, D-258)
 *   www.empvibe.com    Empvibe, the English-speaking brand, the United Kingdom's site (X-111, UK-E,
 *                      D-270), open since the move (UK-G, D-275). EMPVIBE_HOST overrides it, like
 *                      EN_HOST
 *
 * `EN_HOST` overrides the default, e.g. for a staging domain. Local and preview builds match
 * none of these, so the language switch works there on one host. The platform admin is no
 * longer here (D-230).
 */
export const MAIN_HOST = 'www.orgpuls.com'
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
   * Whether the host serves the public site (D-256). Norway's do. A new market's host does not until
   * its own pages exist: the public site is written for Norwegian law, so there a visitor is taken
   * to the sign-up and nothing is indexed (hostGate).
   */
  publicSite: boolean
  /**
   * A site of its own (D-270): its pages are not the Norwegian site's twins, so they name no
   * alternate on Orgpuls's hosts, and only the pages listed in `pages` are served there, under the
   * addresses in `paths`. Norway's hosts have neither: every page, at its route.
   */
  own?: {
    /** the public site's routes this site serves; any other page of the site is a 404 there */
    pages: readonly string[]
    /** a route's address on this site where it differs, e.g. /plattform at /platform */
    paths: Readonly<Record<string, string>>
  }
}

/** what the Norwegian site offers, and every host that is not a site (local, a preview) */
const NORWAY_LANGS: readonly Locale[] = MARKET_LANGS.no

/**
 * The Swedish site (D-254): se.orgpuls.com, Tor's choice «så lenge» (X-109); SE_HOST overrides it,
 * as EN_HOST does the English one. It opens in Swedish and offers English beside it. Nobody reaches
 * it before the address is routed to the app (DNS and the Vercel domain, docs/markets/PLAN.md SE-F).
 */
export const SE_HOST = process.env.SE_HOST?.trim().toLowerCase() || 'se.orgpuls.com'
export const SE_URL = `https://${SE_HOST}`

/**
 * Empvibe's site, the United Kingdom's (X-111, UK-E, D-270): www.empvibe.com, with the bare domain
 * as its alias. EMPVIBE_HOST overrides the address, as EN_HOST does the English one.
 */
export const EMPVIBE_HOST = process.env.EMPVIBE_HOST?.trim().toLowerCase() || 'www.empvibe.com'
export const EMPVIBE_URL = `https://${EMPVIBE_HOST}`

/**
 * The pages Empvibe's site serves, by route (D-270): the product, the use cases, the argument, the
 * law, safety representatives, small businesses, security, contact, the prices and the documents.
 * Not the industries, the articles, the templates or the demo, which are written for Norway.
 */
export const EMPVIBE_PAGES = [
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
] as const

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
}

const EMPVIBE_SITES: readonly Site[] = [EMPVIBE_HOST, 'empvibe.com'].map((host) => ({
  host,
  url: EMPVIBE_URL,
  brand: 'empvibe',
  market: 'gb',
  lang: 'en',
  pinned: true,
  langs: MARKET_LANGS.gb,
  publicSite: true,
  own: { pages: EMPVIBE_PAGES, paths: EMPVIBE_PATHS },
}))

export const SITES: readonly Site[] = [
  { host: MAIN_HOST, url: MAIN_URL, brand: 'orgpuls', market: 'no', lang: 'no', pinned: false, langs: NORWAY_LANGS, publicSite: true },
  { host: 'orgpuls.com', url: MAIN_URL, brand: 'orgpuls', market: 'no', lang: 'no', pinned: false, langs: NORWAY_LANGS, publicSite: true },
  // the Swedish public site is SE-F; until it is built, the host serves the sign-up and the product
  { host: SE_HOST, url: SE_URL, brand: 'orgpuls', market: 'se', lang: 'sv', pinned: false, langs: MARKET_LANGS.se, publicSite: false },
  ...EMPVIBE_SITES,
]

/**
 * Where an English reader goes from a host that no longer has a site of its own (UK-G, D-275):
 *
 *   a public page Empvibe serves      the same page on Empvibe's site, at its English address
 *   any other page of the public site the same page on www.orgpuls.com, in English: Norway's site
 *   and signing in or up               in English is where English-speaking firms in Norway are
 *                                      (X-111), and its industries, articles and templates exist
 *                                      only there
 *   the product, the survey and its    the same address on www.orgpuls.com, with its query: an
 *   links, the API, the auth callbacks organisation's own screens, a respondent's link and a
 *                                      poster printed before the move keep working, in the language
 *                                      the person or the employee has
 *
 * `publicPath` is the middleware's own test of whether the path is the public site's.
 */
export function toEnglish(path: string, search: string, publicPath: boolean): string {
  if (publicPath && (EMPVIBE_PAGES as readonly string[]).includes(path)) return `${EMPVIBE_URL}${addressOf(EMPVIBE_PATHS, path)}${search}`
  // a page of the public site, not a file (robots.txt, the sitemap, llms.txt) and not a link that
  // carries its own key (a survey, an entry code, an invitation), which has its own language
  const sitePage = publicPath && !/\.[a-z0-9]+$/i.test(path) && !within(WITHOUT_SITE, path)
  if (sitePage || within(IN_ENGLISH, path)) return switchTo(MAIN_URL, 'en', `${path}${search}`)
  return `${MAIN_URL}${path}${search}`
}

/** the steps an English reader takes in English on www.orgpuls.com: signing in and up, a new password */
const IN_ENGLISH = ['/logg-inn', '/registrer', '/nytt-passord']

/** whether the path is one of these or under one */
const within = (list: readonly string[], path: string) => list.some((p) => path === p || path.startsWith(`${p}/`))

/** the language switch's own route on a site (lib/i18n/switch.ts switchUrl, which this file cannot import) */
const switchTo = (base: string, locale: string, path: string) => `${base}/api/sprak?${new URLSearchParams({ l: locale, til: path })}`

/**
 * A host whose site moved (UK-G, D-275): en.orgpuls.com, the English edition of Norway's site, whose
 * English-speaking audience is Empvibe's now (X-111: «then one change opens empvibe.com, and
 * en.orgpuls.com redirects there»). Every address goes where `toEnglish` says, permanently (308, so a
 * form posted there keeps its method). Nothing is served on the host any more.
 */
export const MOVED_HOSTS: readonly string[] = [EN_HOST]

/**
 * Addresses registered for a market that is not open yet: routed to the app (DNS, the Vercel domain)
 * but no site of their own (X-110):
 *
 *   de.orgpuls.com              Germany, whose market waits on the instrument and roles decisions
 *                               (docs/markets/PLAN.md phase 3); DE_HOST overrides it
 *
 * Nothing is served there, not even the sign-up: no market exists to join, and the Norwegian site
 * would otherwise be indexed a second time under another name and sign a German firm up as a
 * Norwegian one. Every request goes where an English reader goes from en.orgpuls.com (`toEnglish`),
 * temporarily (307), so the day the market opens, its own site takes over (hostGate, D-258).
 */
export const RESERVED_HOSTS: readonly string[] = [process.env.DE_HOST?.trim().toLowerCase() || 'de.orgpuls.com']

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
 * The addresses a host without its own public site still serves (D-256): signing in and up, the
 * auth callbacks, the respondent's survey and pages, an invitation and a new password, the logo, the
 * API (the language switch among it) and robots.txt. The product's own screens need a session and
 * are not public, so they pass as everywhere.
 */
const WITHOUT_SITE = ['/logg-inn', '/registrer', '/auth', '/s', '/inn', '/r', '/logo', '/bli-med', '/nytt-passord', '/api', '/robots.txt']

/**
 * What a request to this host may see (D-256). On a host that serves the public site: everything,
 * indexed as before. On one that does not yet (Sweden until SE-F): a public page of the Norwegian
 * site is sent to the sign-up, and nothing on the host is indexed. On a moved host (en.orgpuls.com,
 * D-275) and a reserved one (Germany, D-258): nothing; every address goes where an English reader is
 * sent (`toEnglish`), an absolute URL with its query, permanently from the moved host. `publicPath` is
 * the middleware's own test of whether the path is the public site's (lib/supabase/middleware.ts
 * isPublic), `search` the request's query.
 */
export function hostGate(
  host: string | null | undefined,
  path: string,
  publicPath: boolean,
  search = '',
): { noindex: boolean; redirect: string | null; rewrite?: string; canonical?: true; permanent?: true } {
  const name = hostOf(host)
  if (MOVED_HOSTS.includes(name)) return { noindex: true, redirect: toEnglish(path, search, publicPath), permanent: true }
  if (RESERVED_HOSTS.includes(name)) return { noindex: true, redirect: toEnglish(path, search, publicPath) }
  const site = siteOf(host)
  if (site?.own) return ownSite(site.own, path, publicPath)
  if (!site || site.publicSite) return { noindex: false, redirect: null }
  const served = WITHOUT_SITE.some((p) => path === p || path.startsWith(`${p}/`))
  return { noindex: true, redirect: publicPath && !served ? '/registrer' : null }
}

/**
 * A site of its own (Empvibe's, D-270): an address in its language shows its route in place; the
 * route itself, asked for by its Norwegian address, goes to the site's own address (`canonical`: a
 * permanent redirect that keeps the query, for a page load only), so each page has one address; a
 * page of the public site it does not serve is a 404. What is not the public site (the product,
 * the survey, sign-in links, the API, robots.txt and the sitemap) passes as it does everywhere.
 */
function ownSite(own: NonNullable<Site['own']>, path: string, publicPath: boolean) {
  const serves = (route: string) =>
    (own.pages as readonly string[]).includes(route) ||
    WITHOUT_SITE.some((p) => route === p || route.startsWith(`${p}/`)) ||
    SITE_FILES.includes(route) ||
    INDEXNOW_KEY.test(route)
  const notServed = { noindex: true, redirect: null, rewrite: NOT_SERVED_PATH }
  const route = routeOf(own.paths, path)
  if (route !== path) return serves(route) ? { noindex: false, redirect: null, rewrite: route } : notServed
  const alias = own.paths[path]
  if (alias && serves(path)) return { noindex: false, redirect: alias, canonical: true as const }
  return publicPath && !serves(path) ? notServed : { noindex: false, redirect: null }
}

/** the files a site of its own answers for itself (app/sitemap.ts, app/llms.txt) */
const SITE_FILES = ['/sitemap.xml', '/llms.txt']

/** the IndexNow key (public/<32 hex>.txt, D-234), which the engines fetch on each host it submits for */
const INDEXNOW_KEY = /^\/[0-9a-f]{32}\.txt$/
