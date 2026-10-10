import type { Locale } from '@/lib/i18n/locales'
import { DEFAULT_MARKET, MARKET_LANGS, type Market } from '@/lib/markets'

/**
 * The production hosts (D-90, D-98). Edge-safe: read by the middleware as well as the server.
 *
 *   www.orgpuls.com    the product and the Norwegian public site
 *   en.orgpuls.com     the same, in English: the host decides the language (lib/i18n/request)
 *   se.orgpuls.com     the Swedish market (X-109): sign-up and product in Swedish; its public site
 *                      is SE-F, so until then its public pages are not served there (D-256).
 *                      SE_HOST overrides it, like EN_HOST
 *   de.orgpuls.com,    reserved for Germany and for Empvibe (X-110): every address goes to the
 *   empvibe.com        English site until the market or the brand opens (RESERVED_HOSTS, D-258)
 *
 * `EN_HOST` overrides the default, e.g. for a staging domain. Local and preview builds match
 * none of these, so the language switch works there on one host. The platform admin is no
 * longer here (D-230).
 */
export const MAIN_HOST = 'www.orgpuls.com'
export const EN_HOST = process.env.EN_HOST?.trim().toLowerCase() || 'en.orgpuls.com'

export const MAIN_URL = `https://${MAIN_HOST}`
export const EN_URL = `https://${EN_HOST}`

/**
 * What each production host is (D-251): the brand it shows, the market a sign-up there joins, the
 * language it opens in and whether the host decides the language (`pinned`: en.orgpuls.com is the
 * English site whatever the cookie says) or the visitor's choice does. `url` is the canonical
 * address a link made there carries (outboundBase). A new country or brand is a row here, a market
 * in app.markets and its texts, never a branch in a component.
 */
export type Site = {
  host: string
  url: string
  brand: 'orgpuls'
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

export const SITES: readonly Site[] = [
  { host: MAIN_HOST, url: MAIN_URL, brand: 'orgpuls', market: 'no', lang: 'no', pinned: false, langs: NORWAY_LANGS, publicSite: true },
  { host: 'orgpuls.com', url: MAIN_URL, brand: 'orgpuls', market: 'no', lang: 'no', pinned: false, langs: NORWAY_LANGS, publicSite: true },
  { host: EN_HOST, url: EN_URL, brand: 'orgpuls', market: 'no', lang: 'en', pinned: true, langs: NORWAY_LANGS, publicSite: true },
  // the Swedish public site is SE-F; until it is built, the host serves the sign-up and the product
  { host: SE_HOST, url: SE_URL, brand: 'orgpuls', market: 'se', lang: 'sv', pinned: false, langs: MARKET_LANGS.se, publicSite: false },
]

/**
 * Addresses registered for a market or a brand that is not open yet: routed to the app (DNS, the
 * Vercel domain) but no site of their own (X-110):
 *
 *   de.orgpuls.com              Germany, whose market waits on the instrument and roles decisions
 *                               (docs/markets/PLAN.md phase 3); DE_HOST overrides it
 *   empvibe.com, www.empvibe.com  Empvibe, the English-speaking brand, which waits on the brand layer
 *                               (phase 4)
 *
 * Nothing is served there, not even the sign-up: no market or brand exists to join, and the
 * Norwegian site would otherwise be indexed a second time under another name and sign a German or
 * British firm up as a Norwegian one. Every request goes to the same address on the English site,
 * the one of the existing sites their visitors can read, and temporarily (307), so the day the
 * market or brand opens, its own site takes over (hostGate, D-258).
 */
export const RESERVED_HOSTS: Readonly<Record<string, string>> = {
  [process.env.DE_HOST?.trim().toLowerCase() || 'de.orgpuls.com']: EN_URL,
  'empvibe.com': EN_URL,
  'www.empvibe.com': EN_URL,
}

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
 * site is sent to the sign-up, and nothing on the host is indexed. On a reserved host (Germany,
 * Empvibe, D-258): nothing; every address goes to the same one on the English site, an absolute
 * URL. `publicPath` is the middleware's own test of whether the path is the public site's
 * (lib/supabase/middleware.ts isPublic).
 */
export function hostGate(
  host: string | null | undefined,
  path: string,
  publicPath: boolean,
): { noindex: boolean; redirect: string | null } {
  const reserved = RESERVED_HOSTS[hostOf(host)]
  if (reserved) return { noindex: true, redirect: `${reserved}${path}` }
  const site = siteOf(host)
  if (!site || site.publicSite) return { noindex: false, redirect: null }
  const served = WITHOUT_SITE.some((p) => path === p || path.startsWith(`${p}/`))
  return { noindex: true, redirect: publicPath && !served ? '/registrer' : null }
}
