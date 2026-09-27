/**
 * Every language the product knows, in one place (multilingual guide § 4, D-132). Norwegian is
 * the source language: every string is extracted verbatim from the design bundle, and English
 * is translated from it. Adding a language is a messages file plus an entry here (and, for a
 * survey language, a migration widening the database's lists, which tests/unit/locales.test.ts
 * holds to this registry) — never a component change.
 *
 * `code` is the product's own key, in files, cookies and the database. It stays `no` for bokmål
 * (CLAUDE.md); `bcp47` is what goes outward — html lang, hreflang, Intl, JSON-LD — where the
 * standard tag for bokmål is `nb`.
 *
 *   platform  the signed-in app and the public site render in it (a full catalogue)
 *   survey    a respondent may be offered it (lib/i18n/offered.ts: flag + approvals decide)
 *   fallback  where a platform string missing from this catalogue is taken from, in order.
 *             Survey items never fall back: a language is offered whole or not at all.
 */
export const LOCALE_REGISTRY = [
  { code: 'no', bcp47: 'nb', nativeName: 'Norsk', dir: 'ltr', platform: true, survey: true, fallback: [] },
  { code: 'en', bcp47: 'en', nativeName: 'English', dir: 'ltr', platform: true, survey: true, fallback: [] },
  // survey only (D-133): their page and invitation texts live in the translation registry, not in
  // messages/, and are imported and approved in admin › Translations. Order: Tor, 2026-09-27.
  { code: 'pl', bcp47: 'pl', nativeName: 'Polski', dir: 'ltr', platform: false, survey: true, fallback: [] },
  { code: 'uk', bcp47: 'uk', nativeName: 'Українська', dir: 'ltr', platform: false, survey: true, fallback: [] },
  { code: 'lt', bcp47: 'lt', nativeName: 'Lietuvių', dir: 'ltr', platform: false, survey: true, fallback: [] },
  { code: 'sv', bcp47: 'sv', nativeName: 'Svenska', dir: 'ltr', platform: false, survey: true, fallback: [] },
  { code: 'da', bcp47: 'da', nativeName: 'Dansk', dir: 'ltr', platform: false, survey: true, fallback: [] },
] as const satisfies readonly {
  code: string
  bcp47: string
  nativeName: string
  dir: 'ltr' | 'rtl'
  platform: boolean
  survey: boolean
  fallback: readonly string[]
}[]

type Spec = (typeof LOCALE_REGISTRY)[number]
export type AnyLocale = Spec['code']

/** the languages the app and the site render in */
export type Locale = Extract<Spec, { platform: true }>['code']
export const LOCALES = LOCALE_REGISTRY.filter((l) => l.platform).map((l) => l.code) as unknown as readonly [Locale, ...Locale[]]

/**
 * The languages a survey is translated into: every survey language but the source. The
 * database's lists (app.item_translations.locale, ui_translation_approvals, locale_pilots) are
 * these, and tests/unit/locales.test.ts holds them to it.
 */
export type TranslationLocale = Exclude<Extract<Spec, { survey: true }>['code'], 'no'>
export const TRANSLATION_LOCALES = LOCALE_REGISTRY.filter((l) => l.survey && l.code !== 'no').map((l) => l.code) as unknown as readonly [
  TranslationLocale,
  ...TranslationLocale[],
]

export const SOURCE_LOCALE: Locale = 'no'
export const DEFAULT_LOCALE: Locale = 'no'

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value)
}

const spec = (code: string) => LOCALE_REGISTRY.find((l) => l.code === code)

/** The standard tag for a product code: `no` → `nb`. An unknown code passes through. */
export const bcp47 = (code: string): string => spec(code)?.bcp47 ?? code

/** Text direction for a product code (every language today is left to right). */
export const dirOf = (code: string): 'ltr' | 'rtl' => spec(code)?.dir ?? 'ltr'

/** The platform catalogues a language borrows missing strings from, in order. */
export const fallbackOf = (code: string): readonly string[] => spec(code)?.fallback ?? []

/** The chosen language, set by the switch (lib/i18n/actions) and restored at sign-in. */
export const LOCALE_COOKIE = 'NEXT_LOCALE'
