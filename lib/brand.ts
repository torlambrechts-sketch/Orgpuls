import { MARKET_CONFIG, MARKETS, type Market } from '@/lib/markets'

/**
 * The brands the product is sold under (docs/markets/PLAN.md, the brand axis; X-111): one app, one
 * database, the same surveys and anonymity, and a name per brand. Orgpuls in Norway and Sweden;
 * Empvibe, the English site, for the United Kingdom (phase 4, 0222).
 *
 * A brand holds what a person reads as the product's name. Design tokens, the pulse icon and the
 * layout are shared: X-111 keeps Empvibe on Orgpuls's design, and the pixel gate holds Orgpuls's
 * screens to the bundle, so the Orgpuls brand changes nothing a Norwegian customer sees. Edge-safe.
 */
export const BRANDS = {
  orgpuls: { name: 'Orgpuls' },
  empvibe: { name: 'Empvibe' },
} as const
export type Brand = keyof typeof BRANDS

export const DEFAULT_BRAND: Brand = 'orgpuls'

/**
 * Each market's brand (lib/markets.ts MarketConfig.brand): the name its organisations, their employees
 * and their mail read. A market belongs to one brand; a site's brand is its market's (lib/hosts.ts,
 * held by tests/unit/brand.test.ts).
 */
export const MARKET_BRAND: Record<Market, Brand> = Object.fromEntries(MARKETS.map((m) => [m, MARKET_CONFIG[m].brand])) as Record<Market, Brand>

export const brandOf = (market: Market): Brand => MARKET_BRAND[market] ?? DEFAULT_BRAND

type Tree = { [k: string]: unknown }

/**
 * The texts under another brand: the product's name, «Orgpuls», becomes the brand's wherever a text
 * says it. The written source names Orgpuls, so for Orgpuls this is the catalogue itself. Only the
 * capitalised name is replaced: an address (orgpuls.com, hjelp@orgpuls.no) stays as it is, since the
 * mail and support addresses move only when the brand's own domain is set up (X-111). A possessive
 * follows the language: «Orgpuls'» is «Empvibe's» in English and «Empvibes» in the Scandinavian
 * languages, which form the genitive with a bare s.
 */
export function rebrand<T>(tree: T, brand: Brand, locale: string): T {
  if (brand === DEFAULT_BRAND) return tree
  const name = BRANDS[brand].name
  const possessive = locale === 'en' ? `${name}'s` : `${name}s`
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(/Orgpuls(?:'s|’s|'|’)(?![\p{L}\p{N}])/gu, possessive).replace(/Orgpuls/g, name)
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Tree).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(tree) as T
}
