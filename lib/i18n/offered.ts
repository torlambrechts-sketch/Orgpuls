import 'server-only'
import { flag, type FlagName } from '@/lib/flags'
import hashes from './respondent-ui.json'

/**
 * Which languages a survey is offered in (engagement P1.1, D-127).
 *
 * Bokmål always. Another language only when all three hold:
 *   1. its flag is on (`locale_en`, `locale_pl`, `locale_lt`; off in production until a person
 *      has approved the translation — engagement-phases.md § 1);
 *   2. every item the survey asks has an approved translation (app.item_translations, 0079);
 *   3. the respondent pages' strings in that language, as they are in this build, were approved
 *      (their hash, lib/i18n/respondent-ui.json, is in app.ui_translation_approvals).
 *
 * With no language flag on at all, the answer is `null`: the respondent pages keep today's
 * behaviour, in the language of the host and the language switch (D-96, D-98). The registry
 * only decides once somebody has turned a language on.
 */
export const RESPONDENT_LOCALES = ['no', 'en', 'pl', 'lt'] as const
export type RespondentLocale = (typeof RESPONDENT_LOCALES)[number]

/** each language by its own name, as the picker shows it */
export const LOCALE_NAMES: Record<RespondentLocale, string> = { no: 'Norsk', en: 'English', pl: 'Polski', lt: 'Lietuvių' }

export type LocaleState = Record<string, { missing: number; ui: string[] }>

const HASHES: Record<string, string> = hashes

export function isRespondentLocale(v: unknown): v is RespondentLocale {
  return typeof v === 'string' && (RESPONDENT_LOCALES as readonly string[]).includes(v)
}

export function offeredLocales(state: LocaleState | null): RespondentLocale[] | null {
  const others = RESPONDENT_LOCALES.filter((l) => l !== 'no')
  if (!others.some((l) => flag(`locale_${l}` as FlagName))) return null
  return [
    'no',
    ...others.filter((l) => {
      const s = state?.[l]
      const hash = HASHES[l]
      return flag(`locale_${l}` as FlagName) && s !== undefined && s.missing === 0 && hash !== undefined && s.ui.includes(hash)
    }),
  ]
}

/** The language to show: `?lang=`, then the employee's own, then bokmål — each only if offered. */
export function chooseLocale(offered: readonly RespondentLocale[], asked: unknown, employee: unknown): RespondentLocale {
  if (isRespondentLocale(asked) && offered.includes(asked)) return asked
  if (isRespondentLocale(employee) && offered.includes(employee)) return employee
  return 'no'
}
