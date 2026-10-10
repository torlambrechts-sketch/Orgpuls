import type { Market } from '@/lib/markets'
import { fallbackOf, type Locale } from './locales'

type Tree = { [k: string]: unknown }

/**
 * A market's legal pack in the product's own texts (SE-C, D-257).
 *
 * The message files are languages; the law they state is Norway's, because Norway is the market
 * they were written for. A text that states law (the report, the help articles, the duties, the
 * provisions in Oppsett, the mail that cites a paragraph) is the market's, not the language's: a
 * Swedish-speaking employee in a Norwegian firm reads Norwegian law in Swedish (messages/sv.json),
 * and an English-speaking manager in a Swedish firm reads Swedish law in English.
 *
 * So each market other than Norway has a pack: `messages/market/<market>/<lang>.json`, the keys whose
 * text is law, in each language the pack is written in, laid over the language's catalogue for an
 * organisation in that market (lib/i18n/request.ts). A key the pack does not have is the language's
 * own. A pack may also carry keys of its own (a provision Norway has no counterpart for), which only
 * the market's structure in lib/legal/pack.ts names. Norway's pack is the message files themselves.
 *
 * A language the pack is not written in reads it in the nearest one it is: its fallback chain, then
 * English, then the pack's first language. Never Norway's law: tests/unit/legal-pack.test.ts holds
 * every text that states Norwegian law to having a counterpart in each of the market's packs.
 */
export const PACK_LANGS: Record<Market, readonly Locale[]> = { no: [], se: ['sv', 'en'] }

/** The language of a market's pack a reader of `locale` gets, or null where the market has none */
export function packLang(market: Market, locale: string): Locale | null {
  const langs = PACK_LANGS[market]
  return [locale, ...fallbackOf(locale), 'en', ...langs].find((l): l is Locale => (langs as readonly string[]).includes(l)) ?? null
}

/** The market's pack for a reader of `locale`, or null for Norway, whose law the catalogues state */
export async function marketOverlay(market: Market, locale: string): Promise<Tree | null> {
  const lang = packLang(market, locale)
  if (!lang) return null
  return (await import(`../../messages/market/${market}/${lang}.json`)).default as Tree
}
