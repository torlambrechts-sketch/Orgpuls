import 'server-only'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { flag, type FlagName } from '@/lib/flags'
import { TRANSLATION_LOCALES } from '@/lib/i18n/locales'
import { SECTIONS, surveyCatalogue, type Section, type SourceEntry } from '@/lib/i18n/survey-catalogue'
import { standing, type Current } from '@/lib/i18n/translation-package'
import { isError, localePilots, translationSources, translationState, type TranslationState } from './api'

/**
 * admin › Translations (D-133): the survey languages whose texts live in the translation registry.
 * English is the platform's own, in messages/, and is approved on the legal review.
 */
export const SURVEY_LANGUAGES = TRANSLATION_LOCALES.filter((l) => l !== 'en')
export type SurveyLanguage = (typeof SURVEY_LANGUAGES)[number]
/** The first in Tor's order (2026-09-27): Polish */
export const FIRST_SURVEY_LANGUAGE: SurveyLanguage = 'pl'
export const isSurveyLanguage = (v: unknown): v is SurveyLanguage => typeof v === 'string' && (SURVEY_LANGUAGES as readonly string[]).includes(v)

/** Every text a respondent can meet, from the messages and the published modules */
export async function surveyTexts(): Promise<SourceEntry[] | null> {
  const sources = await translationSources()
  if (isError(sources)) return null
  return surveyCatalogue(no, en, sources.modules)
}

export const currentRows = (state: TranslationState): Current[] =>
  state.items.map((i) => ({ item: i.item, text: i.text, status: i.status, source: i.source, notes: i.notes, source_hash: i.source_hash }))

export type SectionCount = { total: number; approved: number; workflow: number; stale: number }

export type LanguageView = {
  locale: SurveyLanguage
  catalogue: SourceEntry[]
  state: TranslationState
  current: Map<string, Current>
  counts: Record<Section, SectionCount>
  /** the rule lib/i18n/offered.ts applies: switched on, and every text approved */
  flagOn: boolean
  pilots: number
  ready: boolean
  approvable: number
}

export async function languageView(locale: SurveyLanguage): Promise<LanguageView | 'not_allowed' | 'failed'> {
  const [catalogue, state, pilots] = await Promise.all([surveyTexts(), translationState(locale), localePilots()])
  if (isError(state)) return state.error === 'not_allowed' ? 'not_allowed' : 'failed'
  if (!catalogue) return 'failed'
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
  return {
    locale,
    catalogue,
    state,
    current,
    counts,
    flagOn: flag(`locale_${locale}` as FlagName),
    pilots: isError(pilots) ? 0 : pilots.pilots.filter((p) => p.locale === locale).length,
    ready: SECTIONS.every((s) => counts[s].approved === counts[s].total),
    // a QA fixture is approvable on the QA stack only (0079), which the database decides; not counted here
    approvable: state.items.filter((i) => i.approvable && i.source !== 'qa-fixture').length,
  }
}
