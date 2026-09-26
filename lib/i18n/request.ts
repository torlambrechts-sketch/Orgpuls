import { cookies, headers } from 'next/headers'
import { EN_HOST, hostOf } from '@/lib/hosts'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from './locales'

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
export default getRequestConfig(async () => {
  // en.orgpuls.com is the English site: the host decides there, whatever the cookie says (D-98)
  const onEnglishHost = hostOf((await headers()).get('host')) === EN_HOST
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = onEnglishHost ? 'en' : isLocale(chosen) ? chosen : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    getMessageFallback: ({ namespace, key }) =>
      namespace ? `${namespace}.${key}` : key,
  }
})
