import { cookies, headers } from 'next/headers'
import { EN_HOST, hostOf } from '@/lib/hosts'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, fallbackOf, isLocale, LOCALE_COOKIE } from './locales'
import { pseudoMessages } from './pseudo'

type Tree = { [k: string]: unknown }
const isTree = (v: unknown): v is Tree => !!v && typeof v === 'object' && !Array.isArray(v)
/** b over a, key by key: a string missing from b is taken from a */
const merge = (a: Tree, b: Tree): Tree =>
  Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, isTree(a[k]) && isTree(b[k]) ? merge(a[k], b[k]) : (b[k] ?? a[k])]))

/**
 * A locale's catalogue, over the ones it falls back to (lib/i18n/locales.ts `fallback`, the
 * multilingual guide's chain: nn → nb → en, sv → en, …). No platform locale has a fallback today,
 * so this is the file itself; a new one may ship partial for the app's chrome. Survey items never
 * fall back: they are not in these files, and a survey language is offered whole or not at all.
 */
async function loadMessages(locale: string): Promise<Tree> {
  const own = (await import(`../../messages/${locale}.json`)).default as Tree
  let out: Tree = {}
  for (const f of [...fallbackOf(locale)].reverse()) out = merge(out, (await import(`../../messages/${f}.json`)).default as Tree)
  // the QA stack's pseudo-locale (lib/i18n/pseudo.ts); without ORGPULS_PSEUDO=1 this is the catalogue itself
  return pseudoMessages(locale, merge(out, own))
}

/**
 * There is no locale routing: no /no or /en prefix. On en.orgpuls.com the locale is English
 * (D-98). Elsewhere it is the one chosen with the
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
      messages: await loadMessages(asked),
      getMessageFallback: ({ namespace, key }) => (namespace ? `${namespace}.${key}` : key),
    }
  }
  // en.orgpuls.com is the English site: the host decides there, whatever the cookie says (D-98)
  const onEnglishHost = hostOf((await headers()).get('host')) === EN_HOST
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = onEnglishHost ? 'en' : isLocale(chosen) ? chosen : DEFAULT_LOCALE

  return {
    locale,
    messages: await loadMessages(locale),
    getMessageFallback: ({ namespace, key }) =>
      namespace ? `${namespace}.${key}` : key,
  }
})
