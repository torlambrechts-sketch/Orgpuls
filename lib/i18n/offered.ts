import 'server-only'
import { flag, type FlagName } from '@/lib/flags'
import { LOCALE_REGISTRY } from './locales'
import hashes from './respondent-ui.json'
import SOURCE from './survey-source.json'
import { complete, nest, uiPlace, type Approved } from '@/supabase/functions/_shared/survey-texts'

/**
 * Which languages a survey is offered in (engagement P1.1, D-127).
 *
 * Bokmål always. Another language only when all three hold:
 *   1. its flag is on (`locale_en`, `locale_pl`, `locale_lt`; off in production until a person
 *      has approved the translation — engagement-phases.md § 1), or the survey's organisation
 *      pilots it (app.locale_pilots, 0085: the guide's stepped rollout, a few customers first);
 *   2. every item the survey asks has an approved translation (app.item_translations, 0079);
 *   3. the respondent pages' strings in that language, as they are in this build, were approved
 *      (their hash, lib/i18n/respondent-ui.json, is in app.ui_translation_approvals).
 *
 * With no language flag on at all, and no pilot, the answer is `null`: the respondent pages keep today's
 * behaviour, in the language of the host and the language switch (D-96, D-98). The registry
 * only decides once somebody has turned a language on.
 */
export type RespondentLocale = Extract<(typeof LOCALE_REGISTRY)[number], { survey: true }>['code']
/** the survey languages, from the one registry (lib/i18n/locales.ts) */
export const RESPONDENT_LOCALES = LOCALE_REGISTRY.filter((l) => l.survey).map((l) => l.code) as unknown as readonly [
  RespondentLocale,
  ...RespondentLocale[],
]

/** each language by its own name, as the picker shows it */
export const LOCALE_NAMES = Object.fromEntries(LOCALE_REGISTRY.filter((l) => l.survey).map((l) => [l.code, l.nativeName])) as Record<
  RespondentLocale,
  string
>

export type LocaleState = Record<string, { missing: number; ui: string[]; pilot?: boolean; auto?: boolean }>

const HASHES: Record<string, string> = hashes

export function isRespondentLocale(v: unknown): v is RespondentLocale {
  return typeof v === 'string' && (RESPONDENT_LOCALES as readonly string[]).includes(v)
}

/**
 * `ui`: a survey language's approved page strings (respond_locales, 0086). Bokmål and English keep
 * their strings in messages/ and are approved by hash; the survey-only languages' strings come
 * from the registry, and count only when every one is approved from the current bokmål (D-133).
 */
export function offeredLocales(state: LocaleState | null, ui: Record<string, Approved> = {}): RespondentLocale[] | null {
  const others = RESPONDENT_LOCALES.filter((l) => l !== 'no')
  const on = (l: RespondentLocale) => flag(`locale_${l}` as FlagName) || state?.[l]?.pilot === true
  if (!others.some(on)) return null
  return [
    'no',
    ...others.filter((l) => {
      const s = state?.[l]
      const hash = HASHES[l]
      // auto-approve on (0101): this build's page strings count as approved; a survey-only
      // language still needs every string translated from the current bokmål
      const pages = hash !== undefined ? !!s?.auto || !!s?.ui.includes(hash) : complete(SOURCE.ui, ui[l])
      return on(l) && s !== undefined && s.missing === 0 && pages
    }),
  ]
}

/**
 * The respondent pages' messages in a survey-only language: bokmål's, with every approved string
 * laid over it. Used only once offeredLocales has found them all approved and current, so no
 * bokmål is left showing; the overlay is still bokmål-backed, so a page can never show a key.
 */
export function surveyMessages(no: Record<string, unknown>, approved: Approved): Record<string, unknown> {
  const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      [...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => {
        const x = a[k]
        const y = b[k]
        return [k, x && y && typeof x === 'object' && typeof y === 'object' ? merge(x as Record<string, unknown>, y as Record<string, unknown>) : (y ?? x)]
      }),
    )
  return merge(no, nest(SOURCE.ui, approved, uiPlace))
}

/**
 * The language to show: `?lang=`, then the employee's own, then the organisation's, then bokmål —
 * each only if offered. The organisation's comes before bokmål because its invitations were
 * written in it (the dispatcher's personalLang follows the same order), so an English
 * organisation's employee with no language of their own opens the survey in the language
 * their invitation was in.
 */
export function chooseLocale(
  offered: readonly RespondentLocale[],
  asked: unknown,
  employee: unknown,
  organisation?: unknown,
): RespondentLocale {
  for (const l of [asked, employee, organisation]) if (isRespondentLocale(l) && offered.includes(l)) return l
  return 'no'
}
