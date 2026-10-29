import 'server-only'
import { cache } from 'react'
import { DEFAULT_MARKET, type Market } from '@/lib/markets'
import { getOrgMarket } from '@/lib/org/market'
import { requestSite } from '@/lib/site/host'

/** A page that knows its organisation's market without a session (a token page), for this request */
const pinned = cache((): { market: Market | null } => ({ market: null }))

/**
 * Before the page's first translation: the market of the organisation a page shows without a
 * session, such as the employees' results page (/r), whose organisation the link names. As
 * next-intl's setRequestLocale, it holds for the rest of the request.
 */
export function setRequestMarket(market: Market): void {
  pinned().market = market
}

/**
 * Whose law the texts of this request state (lib/i18n/market-overlay.ts, D-257): the market a page
 * named, then the signed-in caller's organisation's, then the host's (a visitor signing up on the
 * Swedish site reads Sweden's), then Norway's.
 */
export async function requestMarket(): Promise<Market> {
  return pinned().market ?? (await getOrgMarket()) ?? (await requestSite())?.market ?? DEFAULT_MARKET
}

/**
 * Whose public site this request shows: the host's site's market, whoever reads it (D-276), else the
 * request's market (a preview, a local build). The site's words follow it (lib/i18n/request.ts
 * SITE_WORDS), so a public page's numbers, prices among them, follow it too: a signed-in member of a
 * Norwegian organisation on Empvibe's /pricing reads the UK's list in pounds, never Norway's amounts
 * under the pound sign.
 */
export async function siteMarket(): Promise<Market> {
  return (await requestSite())?.market ?? (await requestMarket())
}
