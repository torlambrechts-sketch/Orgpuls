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
 *   surveyTexts  where its respondent texts (the survey pages, the invitation) live: messages/ for
 *             bokmål and English, the translation registry for every other language — Swedish too,
 *             though its app chrome is in messages/sv.json (D-252)
 *   fallback  where a platform string missing from this catalogue is taken from, in order.
 *             Survey items never fall back: a language is offered whole or not at all.
 */
export const LOCALE_REGISTRY = [
  { code: 'no', bcp47: 'nb', nativeName: 'Norsk', dir: 'ltr', platform: true, survey: true, surveyTexts: 'messages', fallback: [] },
  { code: 'en', bcp47: 'en', nativeName: 'English', dir: 'ltr', platform: true, survey: true, surveyTexts: 'messages', fallback: [] },
  // survey only (D-133): their page and invitation texts live in the translation registry, not in
  // messages/, and are imported and approved in admin › Translations. Order: Tor, 2026-09-27.
  { code: 'pl', bcp47: 'pl', nativeName: 'Polski', dir: 'ltr', platform: false, survey: true, surveyTexts: 'registry', fallback: [] },
  { code: 'uk', bcp47: 'uk', nativeName: 'Українська', dir: 'ltr', platform: false, survey: true, surveyTexts: 'registry', fallback: [] },
  { code: 'lt', bcp47: 'lt', nativeName: 'Lietuvių', dir: 'ltr', platform: false, survey: true, surveyTexts: 'registry', fallback: [] },
  // a platform language since phase 2 (D-252): the app's chrome in Swedish, anything not yet
  // translated in English; its survey texts stay in the registry like the other survey languages
  { code: 'sv', bcp47: 'sv', nativeName: 'Svenska', dir: 'ltr', platform: true, survey: true, surveyTexts: 'registry', fallback: ['en'] },
  // a platform language since phase 3 (DE-A, X-115): the app's chrome in German, anything not yet
  // translated in English; a survey language since DE-A2 (D-292), its respondent texts in the registry
  { code: 'de', bcp47: 'de', nativeName: 'Deutsch', dir: 'ltr', platform: true, survey: true, surveyTexts: 'registry', fallback: ['en'] },
  { code: 'da', bcp47: 'da', nativeName: 'Dansk', dir: 'ltr', platform: false, survey: true, surveyTexts: 'registry', fallback: [] },
] as const satisfies readonly {
  code: string
  bcp47: string
  nativeName: string
  dir: 'ltr' | 'rtl'
  platform: boolean
  survey: boolean
  /** where a survey language's respondent texts live: messages/ (approved by hash) or the registry (D-133) */
  surveyTexts: 'messages' | 'registry'
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

/**
 * The language to show content in that exists in bokmål and English only — pages, modules, templates,
 * the site's notices: bokmål for bokmål, English for every other language, since English is every
 * other platform language's fallback (D-252). For bokmål and English this is the locale itself.
 */
export const contentLang = (locale: string | null | undefined): 'no' | 'en' => (locale === 'no' || !locale ? 'no' : 'en')

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value)
}

const spec = (code: string) => LOCALE_REGISTRY.find((l) => l.code === code)

/** The standard tag for a product code: `no` → `nb`. An unknown code passes through. */
export const bcp47 = (code: string): string => spec(code)?.bcp47 ?? code

/** Text direction for a product code (every language today is left to right). */
export const dirOf = (code: string): 'ltr' | 'rtl' => spec(code)?.dir ?? 'ltr'

/** The platform catalogues a language borrows missing strings from, in order. */
/** a language whose respondent texts are in the translation registry, not in messages/ (D-133, D-252) */
export const registryTexts = (code: string): boolean => spec(code)?.surveyTexts === 'registry'

export const fallbackOf = (code: string): readonly string[] => spec(code)?.fallback ?? []

/** The chosen language, set by the switch (lib/i18n/actions) and restored at sign-in. */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

/**
 * A translated noun inside a sentence: lower-cased in the languages that write it so (bokmål's «om
 * ytringsklima», English's «about freedom to speak up», Swedish's «om yttrandeklimat»), and left as it
 * is in German, where a noun keeps its capital wherever it stands («zu Meinungsklima», «Puls Mai 2025»).
 * Use it instead of toLocaleLowerCase on a text a catalogue gave you (D-291).
 */
export const lowerInSentence = (text: string, locale: string): string => (locale === 'de' || locale.startsWith('de-') ? text : text.toLocaleLowerCase(locale))
