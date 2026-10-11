import { cookies, headers } from 'next/headers'
import { PAGE_LANG_HEADER, siteOf } from '@/lib/hosts'
import { getRequestConfig } from 'next-intl/server'
import { brandOf, rebrand, type Brand } from '@/lib/brand'
import type { Market } from '@/lib/markets'
import { DEFAULT_LOCALE, fallbackOf, isLocale, LOCALE_COOKIE } from './locales'
import { requestMarket } from './market'
import { marketOverlay } from './market-overlay'
import { applyOverrides, messageOverrides } from './overrides'
import { registryOverlay } from './registry-overlay'
import { surveyTexts } from './survey-texts'
import { keyedMessages } from './keyed'
import { pseudoMessages } from './pseudo'

type Tree = { [k: string]: unknown }
const isTree = (v: unknown): v is Tree => !!v && typeof v === 'object' && !Array.isArray(v)
/** b over a, key by key: a string missing from b is taken from a */
const merge = (a: Tree, b: Tree): Tree =>
  Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, isTree(a[k]) && isTree(b[k]) ? merge(a[k], b[k]) : (b[k] ?? a[k])]))

/**
 * A locale's catalogue, over the ones it falls back to (lib/i18n/locales.ts `fallback`, the
 * multilingual guide's chain: nn → nb → en, sv → en, …). Swedish ships partial over English (D-252),
 * and its statements and factor names come from the translation registry (D-253). The respondent
 * page never reads this overlay: a survey language is offered whole or not at all, from the
 * round's own approved texts (app/s/[token]).
 *
 * Last, the law the texts state is the market's (D-257): an organisation outside Norway reads its
 * market's legal pack over the language's own legal texts (lib/i18n/market-overlay.ts), and the
 * product's name is its market's brand (lib/brand.ts, X-111): Orgpuls reads the catalogue as written.
 */
async function loadMessages(locale: string, market: Market, brand: Brand = brandOf(market)): Promise<Tree> {
  const own = (await import(`../../messages/${locale}.json`)).default as Tree
  let out: Tree = {}
  for (const f of [...fallbackOf(locale)].reverse()) out = merge(out, (await import(`../../messages/${f}.json`)).default as Tree)
  // a language whose survey texts live in the registry (Swedish) has no statements or factor names
  // in its file: the registry's approved ones are laid where they still translate the bokmål (0216)
  const texts = await surveyTexts(locale)
  const catalogue = Object.keys(texts).length
    ? applyOverrides(merge(out, own), registryOverlay((await import('../../messages/no.json')).default as Tree, texts))
    : merge(out, own)
  // the texts replaced from admin › Translations, once approved (lib/i18n/overrides.ts, 0101)
  const replaced = applyOverrides(catalogue, await messageOverrides(locale))
  // the law the texts state is the organisation's market's, laid last: an approved replacement of a
  // Norwegian legal text is still Norway's law (lib/i18n/market-overlay.ts, D-257)
  const law = await marketOverlay(market, locale)
  const shown = rebrand(law ? merge(replaced, law) : replaced, brand, locale)
  // the QA stack's pseudo-locale (lib/i18n/pseudo.ts) and keys mode (lib/i18n/keyed.ts, which the
  // page map is crawled in); without ORGPULS_PSEUDO=1 / ORGPULS_I18N_KEYS=1 this is the catalogue itself
  return keyedMessages(locale, pseudoMessages(locale, shown))
}

/**
 * There is no locale routing: no /no or /en prefix. On Empvibe's site the locale is English
 * (D-270): a site whose host decides its language (lib/hosts.ts SITES, `pinned`, D-251). Elsewhere
 * it is the one chosen with the
 * language switch, kept in a cookie (lib/i18n/actions). A signed-in user's choice is also
 * saved on their profile and restored into the cookie at sign-in, falling back to their
 * organisation's default (lib/i18n/server). Without a choice, Norwegian: the browser's
 * language is deliberately not guessed from, so a search engine always reads the Norwegian
 * site. D-96.
 *
 * getMessageFallback renders a missing key as `namespace.key` rather than blank, so a
 * gap is visible in review and in a screenshot diff instead of silently collapsing the
 * layout around an empty string.
 */
export default getRequestConfig(async ({ locale: asked }) => {
  // a caller that names a locale gets it: the respondent page renders in the respondent's
  // language, whatever the host or the switch says (engagement P1, D-127)
  if (isLocale(asked)) {
    return {
      locale: asked,
      messages: await loadMessages(asked, await requestMarket()),
      getMessageFallback: ({ namespace, key }) => (namespace ? `${namespace}.${key}` : key),
    }
  }
  // a pinned site (Empvibe's) decides its language, whatever the cookie says (D-251), and so does a
  // site of its own's page, written in that language only (Sweden's, D-276; the middleware names it);
  // elsewhere the visitor's choice, then the site's language, then Norwegian
  const head = await headers()
  const site = siteOf(head.get('host'))
  const ownPage = !!site?.own && head.get(PAGE_LANG_HEADER) === site.lang
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = site?.pinned || ownPage ? site!.lang : isLocale(chosen) ? chosen : (site?.lang ?? DEFAULT_LOCALE)
  const market = await requestMarket()

  return {
    locale,
    messages: await loadMessages(locale, market, brandOf(market)),
    getMessageFallback: ({ namespace, key }) =>
      namespace ? `${namespace}.${key}` : key,
  }
})
