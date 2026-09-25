/**
 * Norwegian is the source language: every string is extracted verbatim from the design
 * bundle, and English is translated from it. Adding a locale is a messages file plus an
 * entry here — never a component change.
 */
export const LOCALES = ['no', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const SOURCE_LOCALE: Locale = 'no'
export const DEFAULT_LOCALE: Locale = 'no'

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value)
}

/** The chosen language, set by the switch (lib/i18n/actions) and restored at sign-in. */
export const LOCALE_COOKIE = 'NEXT_LOCALE'
