import { SheetError } from '@/lib/xlsx'
import type { FileEntry } from './translation-package'
import { currentText, liveOverride, type Override, type PlatformEntry } from './platform-package'

/**
 * A page of the site as a bilingual spreadsheet (X-090), for a reviewer who corrects bokmål and
 * English together: one row per text, in the order the page shows it, with a column of keys, a
 * bokmål column, an English column and a note. What comes back is read by the columns' headings,
 * so a reviewer may reorder or add columns; only the key, bokmål and English columns are read.
 *
 * Each cell holds the text as it stands now: the live override where one exists (waiting or
 * approved), else the file's. A cell left as it was is unchanged on import; an emptied cell changes nothing.
 */
export const SHEET_KEY = 'key'
export const sheetHead = (locale: 'no' | 'en', name: string) => `${name} · ${locale}`

export type SheetLabels = { no: string; en: string; note: string; waiting: string; unreached: string; hint: string }

export function buildSiteSheet(
  entries: readonly { entry: PlatformEntry; reached: boolean }[],
  bokmal: ReadonlyMap<string, Override>,
  english: ReadonlyMap<string, Override>,
  labels: SheetLabels,
): string[][] {
  const now = (e: PlatformEntry, l: 'no' | 'en') => currentText(e, l, l === 'no' ? bokmal : english)
  const note = (e: PlatformEntry, reached: boolean) => {
    const waiting = (['no', 'en'] as const).filter((l) => {
      const o = liveOverride(e, l, l === 'no' ? bokmal : english)
      return o && o.status !== 'approved'
    })
    return [reached ? null : labels.unreached, waiting.length ? `${labels.waiting} (${waiting.join(', ')})` : null, /[{<]/.test(e.no) ? labels.hint : null]
      .filter(Boolean)
      .join(' · ')
  }
  return [
    [SHEET_KEY, sheetHead('no', labels.no), sheetHead('en', labels.en), labels.note],
    ...entries.map(({ entry, reached }) => [entry.path, now(entry, 'no'), now(entry, 'en'), note(entry, reached)]),
  ]
}

/** The key, bokmål and English columns of a returned sheet, as one import file per language */
export function readSiteSheet(rows: readonly (readonly string[])[]): { no: FileEntry[]; en: FileEntry[] } {
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  const at = (test: (h: string) => boolean) => head.findIndex(test)
  const key = at((h) => h === SHEET_KEY)
  const no = at((h) => h === 'no' || h.endsWith('· no'))
  const en = at((h) => h === 'en' || h.endsWith('· en'))
  if (key < 0 || (no < 0 && en < 0)) throw new SheetError('the first row must name the key column and a · no or · en column')
  const out = { no: [] as FileEntry[], en: [] as FileEntry[] }
  for (const r of rows.slice(1)) {
    const k = (r[key] ?? '').trim()
    if (!k) continue
    if (no >= 0) out.no.push({ key: `msg:${k}`, target: r[no] ?? '' })
    if (en >= 0) out.en.push({ key: `msg:${k}`, target: r[en] ?? '' })
  }
  return out
}
