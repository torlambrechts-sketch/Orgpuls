import 'server-only'
import { headers } from 'next/headers'
import { cache } from 'react'
import { siteOf } from '@/lib/hosts'
import { DEFAULT_MARKET, type Market } from '@/lib/markets'
import { getOrgMarket } from '@/lib/org/market'

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
  return pinned().market ?? (await getOrgMarket()) ?? siteOf((await headers()).get('host'))?.market ?? DEFAULT_MARKET
}
