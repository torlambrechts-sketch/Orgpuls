import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from './locales'

/**
 * There is no locale routing: no /no or /en prefix. The locale comes from the signed-in
 * user's profile, their organisation's default, or the language cookie — resolved here
 * rather than from the URL.
 *
 * getMessageFallback renders a missing key as `namespace.key` rather than blank, so a
 * gap is visible in review and in a screenshot diff instead of silently collapsing the
 * layout around an empty string.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    getMessageFallback: ({ namespace, key }) =>
      namespace ? `${namespace}.${key}` : key,
  }
})
