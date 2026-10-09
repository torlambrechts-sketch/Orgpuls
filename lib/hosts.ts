import type { Locale } from '@/lib/i18n/locales'
import { DEFAULT_MARKET, type Market } from '@/lib/markets'

/**
 * The production hosts (D-90, D-98). Edge-safe: read by the middleware as well as the server.
 *
 *   www.orgpuls.com    the product and the Norwegian public site
 *   en.orgpuls.com     the same, in English: the host decides the language (lib/i18n/request)
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
}

/** what the Norwegian site offers, and every host that is not a site (local, a preview) */
const NORWAY_LANGS: readonly Locale[] = ['no', 'en']

export const SITES: readonly Site[] = [
  { host: MAIN_HOST, url: MAIN_URL, brand: 'orgpuls', market: 'no', lang: 'no', pinned: false, langs: NORWAY_LANGS },
  { host: 'orgpuls.com', url: MAIN_URL, brand: 'orgpuls', market: 'no', lang: 'no', pinned: false, langs: NORWAY_LANGS },
  { host: EN_HOST, url: EN_URL, brand: 'orgpuls', market: 'no', lang: 'en', pinned: true, langs: NORWAY_LANGS },
]

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
