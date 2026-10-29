/**
 * A text under a brand's name: the one rule for it, in the app (lib/brand.ts rebrand), in the mail
 * (supabase/functions/_shared/brand-name.ts, a copy `npm run markets:edge` writes and
 * tests/unit/market-registry.test.ts holds equal) and on the share cards (scripts/marketing/og-images.mjs).
 * It was three hand-kept copies of one regex. Pure: no imports, so every one of them can read it.
 *
 * The written source names Orgpuls, so for Orgpuls a text is itself. Under another brand:
 *   - «Orgpuls» becomes the brand's name. Only the capitalised name: an address (orgpuls.com) stays.
 *   - A possessive follows the language: «Orgpuls'» is «Empvibe's» in English and «Empvibes» in the
 *     Scandinavian languages, which form the genitive with a bare s.
 *   - The product's support address becomes the brand's, once the brand has a mailbox of its own
 *     (lib/brand.ts BRANDS `support`; X-111: «the mail and support addresses move only when the
 *     brand's own domain is set up»). Until then the two are the same, and the address stays.
 */
export const PRODUCT_NAME = 'Orgpuls'
export const PRODUCT_SUPPORT = 'hjelp@orgpuls.no'

export function renameBrand(text: string, name: string, lang: string, support: string = PRODUCT_SUPPORT): string {
  let out = text
  if (name !== PRODUCT_NAME) {
    const possessive = lang === 'en' ? `${name}'s` : `${name}s`
    out = out.replace(/Orgpuls(?:'s|’s|'|’)(?![\p{L}\p{N}])/gu, possessive).replace(/Orgpuls/g, name)
  }
  if (support !== PRODUCT_SUPPORT) out = out.split(PRODUCT_SUPPORT).join(support)
  return out
}
