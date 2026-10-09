/**
 * The markets the product is sold in (D-251), mirroring app.markets (0214): the rows there are the
 * source, and tests/unit/markets.test.ts holds this list to the migrations that seed them.
 *
 * A market is a country, not a language: an organisation in Norway may read the product in
 * English, and a language may serve several markets. The host a person signs up on names the
 * market (lib/hosts.ts SITES); the database gives a new organisation that market's anonymity
 * floor, language and time zone, and only the platform moves it to another market afterwards.
 *
 * Norway is the only market today, so nothing a customer sees depends on this yet. Edge-safe.
 */
export const MARKETS = ['no'] as const
export type Market = (typeof MARKETS)[number]

export const DEFAULT_MARKET: Market = 'no'

export function isMarket(value: unknown): value is Market {
  return typeof value === 'string' && (MARKETS as readonly string[]).includes(value)
}
