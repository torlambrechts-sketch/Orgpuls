import 'server-only'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { flag, type FlagName } from '@/lib/flags'
import { TRANSLATION_LOCALES } from '@/lib/i18n/locales'
import { SECTIONS, surveyCatalogue, type Section, type SourceEntry } from '@/lib/i18n/survey-catalogue'
import { standing, type Current } from '@/lib/i18n/translation-package'
import { platformCatalogue, type Override, type PlatformEntry } from '@/lib/i18n/platform-package'
import { effectiveMessages } from '@/lib/i18n/overrides'
import type { Catalogue } from '@/lib/i18n/icu-rules'
import { autoApprove, isError, localePilots, messageOverrideRows, translationSources, translationState, type OverrideRow, type TranslationState } from './api'

/**
 * admin › Translations (D-133, D-152). Two tabs and seven languages:
 *
 *   Questionnaire  the questions: the core statements, the questions outside the index, and the
 *                  modules'. Bokmål is the source, shown and exported; English and the survey
 *                  languages are the translation registry's (app.item_translations).
 *   Pages          every other text. For the survey languages, the survey pages and the mails, in
 *                  the registry; for bokmål and English, the whole of messages/, each string
 *                  replaceable by an approved override (app.message_overrides, 0101).
 */
export const SURVEY_LANGUAGES = TRANSLATION_LOCALES.filter((l) => l !== 'en')
export type SurveyLanguage = (typeof SURVEY_LANGUAGES)[number]
/** the languages whose questions are in the registry: English and the survey languages */
export const REGISTRY_LANGUAGES = TRANSLATION_LOCALES
export type RegistryLanguage = (typeof REGISTRY_LANGUAGES)[number]
export const PLATFORM_LANGUAGES = ['no', 'en'] as const
export type PlatformLanguage = (typeof PLATFORM_LANGUAGES)[number]
export const ADMIN_LANGUAGES = ['no', ...TRANSLATION_LOCALES] as const
export type AdminLanguage = (typeof ADMIN_LANGUAGES)[number]
/** The first in Tor's order (2026-09-27): Polish */
export const FIRST_SURVEY_LANGUAGE: SurveyLanguage = 'pl'
export const isSurveyLanguage = (v: unknown): v is SurveyLanguage => typeof v === 'string' && (SURVEY_LANGUAGES as readonly string[]).includes(v)
export const isRegistryLanguage = (v: unknown): v is RegistryLanguage => typeof v === 'string' && (REGISTRY_LANGUAGES as readonly string[]).includes(v)
export const isPlatformLanguage = (v: unknown): v is PlatformLanguage => v === 'no' || v === 'en'
export const isAdminLanguage = (v: unknown): v is AdminLanguage => typeof v === 'string' && (ADMIN_LANGUAGES as readonly string[]).includes(v)

export type Scope = 'questionnaire' | 'pages'
export const SCOPES: readonly Scope[] = ['questionnaire', 'pages']
export const isScope = (v: unknown): v is Scope => v === 'questionnaire' || v === 'pages'
/** the registry's sections in each tab */
export const SCOPE_SECTIONS: Record<Scope, readonly Section[]> = { questionnaire: ['core', 'extra', 'module'], pages: ['ui', 'mail'] }

/** Every text a respondent can meet, from the messages and the published modules */
export async function surveyTexts(): Promise<SourceEntry[] | null> {
  const sources = await translationSources()
  if (isError(sources)) return null
  // the bokmål shown now is what a survey language is translated from (0101)
  const shown = await effectiveMessages(no as unknown as Catalogue, en as unknown as Catalogue)
  return surveyCatalogue(shown.no, shown.en, sources.modules)
}

export const currentRows = (state: TranslationState): Current[] =>
  state.items.map((i) => ({ item: i.item, text: i.text, status: i.status, source: i.source, notes: i.notes, source_hash: i.source_hash }))

export type SectionCount = { total: number; approved: number; workflow: number; stale: number }

export type LanguageView = {
  locale: RegistryLanguage
  scope: Scope
  sections: readonly Section[]
  catalogue: SourceEntry[]
  state: TranslationState
  current: Map<string, Current>
  /** approved by the auto-approve switch (0101) */
  auto: Set<string>
  counts: Record<Section, SectionCount>
  /** the rule lib/i18n/offered.ts applies: switched on, and every text approved */
  flagOn: boolean
  pilots: number
  ready: boolean
  approvable: number
}

export async function languageView(locale: RegistryLanguage, scope: Scope): Promise<LanguageView | 'not_allowed' | 'failed'> {
  const [catalogue, state, pilots] = await Promise.all([surveyTexts(), translationState(locale), localePilots()])
  if (isError(state)) return state.error === 'not_allowed' ? 'not_allowed' : 'failed'
  if (!catalogue) return 'failed'
  const sections = SCOPE_SECTIONS[scope]
  const current = new Map(currentRows(state).map((c) => [c.item, c]))
  const counts = Object.fromEntries(SECTIONS.map((s) => [s, { total: 0, approved: 0, workflow: 0, stale: 0 }])) as Record<Section, SectionCount>
  for (const e of catalogue) {
    const c = counts[e.section]
    c.total++
    const s = standing(e, current.get(e.key))
    if (s === 'approved') c.approved++
    else if (s === 'workflow') c.workflow++
    else if (s === 'stale') c.stale++
  }
  const inScope = new Set(catalogue.filter((e) => sections.includes(e.section)).map((e) => e.key))
  return {
    locale,
    scope,
    sections,
    catalogue: catalogue.filter((e) => inScope.has(e.key)),
    state,
    current,
    auto: new Set(state.items.filter((i) => i.auto).map((i) => i.item)),
    counts,
    flagOn: flag(`locale_${locale}` as FlagName),
    pilots: isError(pilots) ? 0 : pilots.pilots.filter((p) => p.locale === locale).length,
    // English's page strings are messages/, approved by hash on the legal review: its questions decide
    ready: (locale === 'en' ? SCOPE_SECTIONS.questionnaire : SECTIONS).every((s) => counts[s].approved === counts[s].total),
    // a QA fixture is approvable on the QA stack only (0079), which the database decides; not counted here;
    // the button approves what is approvable in this tab's sections only on the database's side, so
    // it counts the whole language, as it approves it
    approvable: state.items.filter((i) => i.approvable && i.source !== 'qa-fixture').length,
  }
}

// ---------------------------------------------------------------- bokmål and English
export const PLATFORM_CATALOGUE: PlatformEntry[] = platformCatalogue(no as unknown as Catalogue, en as unknown as Catalogue)

export const overrideMap = (rows: readonly OverrideRow[]): Map<string, Override> =>
  new Map(rows.map((r) => [r.key, { key: r.key, text: r.text, status: r.status, source: r.source, notes: r.notes, source_hash: r.source_hash, auto: r.auto }]))

export type PlatformView = {
  locale: PlatformLanguage
  rows: OverrideRow[]
  own: Map<string, Override>
  bokmal: Map<string, Override>
  english: Map<string, Override>
  pending: OverrideRow[]
}

/** Both languages' overrides: the page shows bokmål and English side by side */
export async function platformView(locale: PlatformLanguage): Promise<PlatformView | 'not_allowed' | 'failed'> {
  const [o, e] = await Promise.all([messageOverrideRows('no'), messageOverrideRows('en')])
  if (isError(o) || isError(e)) {
    const err = isError(o) ? o : (e as { error: string })
    return err.error === 'not_allowed' ? 'not_allowed' : 'failed'
  }
  const rows = locale === 'no' ? o.items : e.items
  return {
    locale,
    rows,
    own: overrideMap(rows),
    bokmal: overrideMap(o.items),
    english: overrideMap(e.items),
    pending: rows.filter((r) => r.status !== 'approved'),
  }
}

export { autoApprove }
