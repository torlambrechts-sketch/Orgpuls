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
 * Norway, Sweden since 0218 (D-254), the United Kingdom since 0222 (D-264), sold as Empvibe
 * (X-111, lib/brand.ts), and Germany since 0236 (X-115, DE-B). No host names Germany until its site
 * opens (DE-F, DE-G), so nobody can join it before then. Edge-safe.
 */
export const MARKETS = ['no', 'se', 'gb', 'de'] as const
export type Market = (typeof MARKETS)[number]

export const DEFAULT_MARKET: Market = 'no'

/**
 * Whether sign-up can look a company up in the market's register: Brønnøysund in Norway. Sweden's
 * Bolagsverket needs an API agreement (SE-B4), so a Swedish sign-up names its company itself and
 * the number is held to Sweden's rule (lib/org-number.ts). Companies House has a free API with a key
 * (docs/markets/uk-legal.md § 7); until it is wired, a UK sign-up names its company itself too.
 */
export const REGISTRY_LOOKUP: Record<Market, boolean> = { no: true, se: false, gb: false, de: false }

/**
 * Whether the market's law is in the product: the report, the legal texts and the duties it prints.
 * Norway's is the message files themselves; Sweden's (arbetsmiljölagen, AFS 2023:1, AFS 2023:2) is its
 * pack since SE-C (lib/i18n/market-overlay.ts, lib/legal/pack.ts, D-257), and the United Kingdom's
 * (HSWA 1974, the Management Regulations 1999, HSE's Management Standards) since UK-C (D-265). A
 * market without one promises no report for its authority at sign-up (D-256). Germany's comes with
 * DE-C (docs/markets/de-legal.md).
 */
export const LEGAL_PACK: Record<Market, boolean> = { no: true, se: true, gb: true, de: false }

/**
 * The languages a market's site offers and an organisation there may default to: bokmål and English
 * in Norway, Swedish and English in Sweden (D-252, D-254), English in the United Kingdom (D-264),
 * German and English in Germany (DE-A, DE-B). An organisation already on another language keeps it on
 * offer (components/oppsett/CompanyForm.tsx).
 */
export const MARKET_LANGS: Record<Market, readonly Locale[]> = { no: ['no', 'en'], se: ['sv', 'en'], gb: ['en'], de: ['de', 'en'] }

/**
 * Each market's anonymity floor as the migrations set it (app.markets.k_floor: 0214, 0218, 0222,
 * 0236), for what a screen may offer: Norway the platform's 3, Sweden, the United Kingdom and Germany
 * 5 (X-111, X-115). The
 * database is the rule and refuses anything under it; tests/unit/markets.test.ts holds this to the
 * migrations, a raised floor included.
 */
export const MARKET_K_FLOOR: Record<Market, number> = { no: 3, se: 5, gb: 5, de: 5 }

/**
 * Each market's time zone as the migrations set it (app.markets.timezone: 0214, 0218, 0222, 0236), which a
 * new organisation in it takes. The clock of a page that knows the market but not the organisation
 * (lib/i18n/dates-server.ts); tests/unit/markets.test.ts holds this to the migrations.
 */
export const MARKET_TIME_ZONE: Record<Market, string> = { no: 'Europe/Oslo', se: 'Europe/Stockholm', gb: 'Europe/London', de: 'Europe/Berlin' }

/** The problem a sign-up shows for a number the market's rule refuses: Norway's says nine digits */
export const orgNumberProblem = (market: Market): string => (market === 'no' ? 'invalid_org_number' : `invalid_org_number_${market}`)

export function isMarket(value: unknown): value is Market {
  return typeof value === 'string' && (MARKETS as readonly string[]).includes(value)
}
