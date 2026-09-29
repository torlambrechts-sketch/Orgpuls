import { createHash } from 'node:crypto'
import { stillApplies } from './override-tree'
import { cldrTag, flattenMessages, parseIcu, pluralGaps, signature, signatureDiff, type Catalogue } from './icu-rules'
import { FORMAT, FORMAT_VERSION, ORIGINS, STEPS, type FileEntry, type Origin, type ParsedFile, type Problem, type Step } from './translation-package'

/**
 * Bokmål and English in admin › Translations (0101, D-152): the platform's own two languages,
 * whose texts live in messages/. Split the way the admin shows them:
 *
 *   questionnaire  what a respondent is asked: the core statements (factor.<f>.s<n>) and the
 *                  questions outside the index (extra.*). In English these are the translation
 *                  registry's (app.item_translations, locale en), as the survey page reads them;
 *                  in bokmål they are the source, shown and exported, never imported here.
 *   pages          every other string in the product, the site, the mails and the admin: each
 *                  can be replaced by an override (app.message_overrides), approved in the admin.
 *
 * A package is the same «orgpuls-translations» v1 file the survey languages use, keyed
 * `msg:<path>`, so one translator workflow covers every language.
 */
export type PlatformLocale = 'no' | 'en'
export type PlatformView = 'questionnaire' | 'pages'

export const isQuestionnairePath = (path: string) => /^factor\.[^.]+\.s\d+$/.test(path) || /^extra\./.test(path)
export const viewOf = (path: string): PlatformView => (isQuestionnairePath(path) ? 'questionnaire' : 'pages')

export type PlatformEntry = {
  /** msg:<path> */
  key: string
  path: string
  /** the top-level namespace: `admin`, `site`, `respond` … */
  ns: string
  view: PlatformView
  /** the files' own texts */
  no: string
  en: string | null
}

export type Override = {
  key: string
  text: string
  status: string
  source: string
  notes: string | null
  source_hash: string | null
  /** the file text it replaced (0109): once the files say something else, the files win */
  file_hash?: string | null
  auto?: boolean
}

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** Every string in the bokmål file, with the English beside it */
export function platformCatalogue(no: Catalogue, en: Catalogue): PlatformEntry[] {
  const e = flattenMessages(en)
  return Object.entries(flattenMessages(no)).map(([path, text]) => ({
    key: `msg:${path}`,
    path,
    ns: path.split('.')[0]!,
    view: viewOf(path),
    no: text,
    en: e[path] ?? null,
  }))
}

export const fileText = (entry: PlatformEntry, locale: PlatformLocale) => (locale === 'no' ? entry.no : (entry.en ?? ''))

/**
 * An override that still replaces the file's text (0109): absent when there is none, or when the
 * files have changed at its path since it was written (folded back, or rewritten by hand).
 */
export function liveOverride(entry: PlatformEntry, locale: PlatformLocale, overrides: ReadonlyMap<string, Override>): Override | undefined {
  const o = overrides.get(entry.path)
  return o && stillApplies(fileText(entry, locale), o.file_hash) ? o : undefined
}

/** How an override stands against the files: live, folded into them, or superseded by a later change */
export function overrideStanding(entry: PlatformEntry, locale: PlatformLocale, overrides: ReadonlyMap<string, Override>): 'none' | 'live' | 'folded' | 'superseded' {
  const o = overrides.get(entry.path)
  if (!o) return 'none'
  if (liveOverride(entry, locale, overrides)) return 'live'
  return o.text === fileText(entry, locale) ? 'folded' : 'superseded'
}

/** The text a person works on now: a live override's (approved or waiting), else the file's */
export const currentText = (entry: PlatformEntry, locale: PlatformLocale, overrides: ReadonlyMap<string, Override>) =>
  liveOverride(entry, locale, overrides)?.text ?? fileText(entry, locale)

/** The text shown now in a language: the approved live override, else the file's */
export function shownText(entry: PlatformEntry, locale: PlatformLocale, overrides: ReadonlyMap<string, Override>): string {
  const o = liveOverride(entry, locale, overrides)
  return o && o.status === 'approved' ? o.text : fileText(entry, locale)
}

export type PlatformPackageEntry = {
  key: string
  section: PlatformView
  context: string
  source: string
  reference_en: string | null
  target: string
  status: string
  origin: string | null
  notes: string
  source_hash: string
}

/**
 * A package for a translator or a proofreader. For English, the bokmål shown now is the source and
 * the English shown now the target; for bokmål, the file's own text is the source, the text shown
 * now the target, and the English a reference. `status` is the override's step, or `file` where
 * the file's own text stands.
 */
export function buildPlatformPackage(
  locale: PlatformLocale,
  entries: readonly PlatformEntry[],
  own: ReadonlyMap<string, Override>,
  bokmal: ReadonlyMap<string, Override>,
  english: ReadonlyMap<string, Override>,
  exportedAt: string,
) {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    locale,
    source_locale: 'nb' as const,
    exported_at: exportedAt,
    entries: entries.map((e): PlatformPackageEntry => {
      const o = liveOverride(e, locale, own)
      const source = locale === 'en' ? shownText(e, 'no', bokmal) : e.no
      return {
        key: e.key,
        section: e.view,
        context: contextOf(e),
        source,
        reference_en: locale === 'no' ? shownText(e, 'en', english) : null,
        target: o ? o.text : locale === 'no' ? e.no : (e.en ?? ''),
        status: o ? o.status : 'file',
        origin: o ? o.source : null,
        notes: o?.notes ?? '',
        source_hash: sha(source),
      }
    }),
  }
}

function contextOf(e: PlatformEntry): string {
  const where =
    e.ns === 'site' || e.ns === 'seo' || e.ns === 'industry' ? 'the public website'
    : e.ns === 'admin' ? 'the platform admin'
    : e.ns === 'mail' ? 'an e-mail or SMS'
    : e.ns === 'respond' || e.ns === 'entry' || e.ns === 'roundPage' ? 'the pages an employee sees'
    : 'the product, for managers'
  return `${e.path} — text on ${where}. Keep every {placeholder} and <tag> exactly as it is.`
}

export type PlatformRow =
  | { key: string; text: string; source: Origin; status: Step; notes: string | null; source_hash: string; file_hash: string }
  | { key: string; remove: true }
export type PlatformChecked = { rows: PlatformRow[]; problems: Problem[]; untranslated: number; unchanged: number; outside: number }

/**
 * What an import of a bokmål or English page package would write (0101). Every key is a string in
 * the files; every text parses as the message it replaces and keeps its placeholders and tags.
 *   unknown_key    not a string in messages/
 *   questionnaire  a question: bokmål's are the source, English's belong to the Questionnaire tab
 *   syntax, placeholders, plural   as for the survey languages
 *   stale          made from a bokmål that has changed since the file was exported
 *   approved_capped, step          as for the survey languages
 * A text equal to the file's own, where an override stands, removes the override.
 */
export function checkPlatformImport(
  file: ParsedFile,
  locale: PlatformLocale,
  entries: readonly PlatformEntry[],
  own: ReadonlyMap<string, Override>,
  bokmal: ReadonlyMap<string, Override>,
  defaultOrigin: Origin,
): PlatformChecked {
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const tag = cldrTag(locale)
  const rows: PlatformRow[] = []
  const problems: Problem[] = []
  let untranslated = 0
  let unchanged = 0
  let outside = 0
  const seen = new Set<string>()

  for (const f of file.entries as FileEntry[]) {
    // a survey-language key in a platform file: another tab's text, counted and left out
    if (!f.key.startsWith('msg:')) {
      outside++
      continue
    }
    const e = byKey.get(f.key)
    if (!e) {
      problems.push({ key: f.key, level: 'error', code: 'unknown_key' })
      continue
    }
    if (seen.has(f.key)) continue
    seen.add(f.key)
    if (e.view === 'questionnaire') {
      problems.push({ key: f.key, level: 'error', code: 'questionnaire' })
      continue
    }
    const text = f.target.trim() ? f.target : ''
    if (!text) {
      untranslated++
      continue
    }
    const file = fileText(e, locale)
    const o = liveOverride(e, locale, own)
    const current = o ? o.text : file
    if (text === current) {
      unchanged++
      continue
    }
    try {
      const ast = parseIcu(text)
      const diff = signatureDiff(signature(parseIcu(e.no)), signature(ast))
      if (diff.length) {
        problems.push({ key: f.key, level: 'error', code: 'placeholders', detail: diff.join('; ') })
        continue
      }
      const gaps = pluralGaps(ast, tag)
      if (gaps.length) {
        problems.push({ key: f.key, level: 'error', code: 'plural', detail: gaps.join('; ') })
        continue
      }
    } catch (err) {
      problems.push({ key: f.key, level: 'error', code: 'syntax', detail: err instanceof Error ? err.message : String(err) })
      continue
    }
    if (text === file) {
      rows.push({ key: e.path, remove: true })
      continue
    }
    let status: Step = 'draft'
    if (f.status === 'approved') {
      problems.push({ key: f.key, level: 'warning', code: 'approved_capped' })
      status = 'pretested'
    } else if ((STEPS as readonly string[]).includes(f.status ?? '')) status = f.status as Step
    else if (f.status && f.status !== 'file' && f.status !== 'untranslated') problems.push({ key: f.key, level: 'warning', code: 'step', detail: f.status })
    const source = locale === 'en' ? shownText(e, 'no', bokmal) : e.no
    const hash = sha(source)
    if (f.source_hash && /^[0-9a-f]{64}$/.test(f.source_hash) && f.source_hash !== hash) problems.push({ key: f.key, level: 'warning', code: 'stale' })
    const origin: Origin = (ORIGINS as readonly string[]).includes(f.origin ?? '') ? (f.origin as Origin) : defaultOrigin
    rows.push({ key: e.path, text, source: origin, status, notes: f.notes?.trim() ? f.notes.trim() : null, source_hash: hash, file_hash: sha(file) })
  }
  return { rows, problems, untranslated, unchanged, outside }
}
