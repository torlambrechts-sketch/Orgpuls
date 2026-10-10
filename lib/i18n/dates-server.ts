import 'server-only'
import { getLocale } from 'next-intl/server'
import { cache } from 'react'
import { MARKET_TIME_ZONE } from '@/lib/markets'
import { getOrgTimeZone } from '@/lib/org/market'
import { intlLocale, type Dates } from './dates'
import { requestMarket } from './market'

/**
 * The clock of this request (lib/i18n/dates.ts): the signed-in caller's organisation's own time
 * zone, then the market's the page is in (a token page names its organisation's, D-257).
 */
export const requestTimeZone = cache(async (): Promise<string> => (await getOrgTimeZone()) ?? MARKET_TIME_ZONE[await requestMarket()])

/** The reader's form and the organisation's clock, for a server component that writes dates */
export const getDates = cache(async (locale?: string): Promise<Dates> => ({
  locale: intlLocale(locale ?? (await getLocale())),
  timeZone: await requestTimeZone(),
}))
