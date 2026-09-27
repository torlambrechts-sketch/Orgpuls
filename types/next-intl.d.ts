import type { Locale } from '@/lib/i18n/locales'

/**
 * next-intl's AppConfig. Locale is typed, so `useLocale()` and `getLocale()` return the
 * registry's union rather than `string`.
 *
 * Messages are deliberately not typed (D-132): typing them against messages/no.json makes 130
 * call sites fail, every one a key built at runtime from data — a factor key, a status, a
 * question kind (CLAUDE.md "Data-not-code"). Narrowing those would mean a cast at each, which
 * asserts what nothing checks. Missing and orphaned keys are caught instead by the catalogue
 * gates (`npm run verify:i18n`) and rendered visibly by getMessageFallback.
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
  }
}
