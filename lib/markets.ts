import type { Locale } from '@/lib/i18n/locales'

/**
 * The markets the product is sold in (D-251), mirroring app.markets (0214): the rows there are the
 * source, and tests/unit/markets.test.ts holds this list to the migrations that seed them.
 *
 * A market is a country, not a language: an organisation in Norway may read the product in
 * English, and a language may serve several markets. The host a person signs up on names the
 * market (lib/hosts.ts SITES); the database gives a new organisation that market's anonymity
 * floor, language and time zone, and only the platform moves it to another market afterwards.
 *
 * Norway, and Sweden since 0218 (D-254). No host names Sweden until SE_HOST is set (lib/hosts.ts),
 * so nobody can join it before the Swedish site exists. Edge-safe.
 */
export const MARKETS = ['no', 'se'] as const
export type Market = (typeof MARKETS)[number]

export const DEFAULT_MARKET: Market = 'no'

/**
 * Whether sign-up can look a company up in the market's register: Brønnøysund in Norway. Sweden's
 * Bolagsverket needs an API agreement (SE-B4), so a Swedish sign-up names its company itself and
 * the number is held to Sweden's rule (lib/org-number.ts).
 */
export const REGISTRY_LOOKUP: Record<Market, boolean> = { no: true, se: false }

/**
 * The languages a market's site offers and an organisation there may default to: bokmål and English
 * in Norway, Swedish and English in Sweden (D-252, D-254). An organisation already on another
 * language keeps it on offer (components/oppsett/CompanyForm.tsx).
 */
export const MARKET_LANGS: Record<Market, readonly Locale[]> = { no: ['no', 'en'], se: ['sv', 'en'] }

/**
 * Each market's anonymity floor as the migrations set it (app.markets.k_floor: 0214, 0218), for what a
 * screen may offer: Norway the platform's 3, Sweden 5. The database is the rule and refuses anything
 * under it; tests/unit/markets.test.ts holds this to the migrations, a raised floor included.
 */
export const MARKET_K_FLOOR: Record<Market, number> = { no: 3, se: 5 }

/** The problem a sign-up shows for a number the market's rule refuses: Norway's says nine digits */
export const orgNumberProblem = (market: Market): string => (market === 'no' ? 'invalid_org_number' : `invalid_org_number_${market}`)

export function isMarket(value: unknown): value is Market {
  return typeof value === 'string' && (MARKETS as readonly string[]).includes(value)
}
