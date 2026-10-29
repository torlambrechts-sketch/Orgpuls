import { PRODUCT_SUPPORT, renameBrand } from '@/lib/brand-name'
import { MARKET_CONFIG, MARKETS, type Market } from '@/lib/markets'

/**
 * The brands the product is sold under (docs/markets/PLAN.md, the brand axis; X-111): one app, one
 * database, the same surveys and anonymity, and a name per brand. Orgpuls in Norway and Sweden;
 * Empvibe, the English site, for the United Kingdom (phase 4, 0222).
 *
 * A brand holds what a person reads as the product's name. Design tokens, the pulse icon and the
 * layout are shared: X-111 keeps Empvibe on Orgpuls's design, and the pixel gate holds Orgpuls's
 * screens to the bundle, so the Orgpuls brand changes nothing a Norwegian customer sees. Edge-safe.
 *
 * `support` is the address a brand's readers write to: on its pages, in its structured data, as its
 * mail's Reply-To. Empvibe has no mailbox of its own yet (X-111, D-275: Tor's), so it is Orgpuls's;
 * the day it has one, this line moves every text, page and mail that names the address
 * (lib/brand-name.ts renameBrand).
 */
export const BRANDS = {
  orgpuls: { name: 'Orgpuls', support: PRODUCT_SUPPORT },
  empvibe: { name: 'Empvibe', support: PRODUCT_SUPPORT },
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
 * The texts under another brand (lib/brand-name.ts renameBrand, the one rule the mail and the share
 * cards use too): the product's name, «Orgpuls», becomes the brand's wherever a text says it, its
 * possessive in the language's form, and the support address the brand's once it has its own. The
 * written source names Orgpuls, so for Orgpuls this is the catalogue itself.
 */
export function rebrand<T>(tree: T, brand: Brand, locale: string): T {
  if (brand === DEFAULT_BRAND) return tree
  const { name, support } = BRANDS[brand]
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return renameBrand(v, name, locale, support)
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Tree).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(tree) as T
}
