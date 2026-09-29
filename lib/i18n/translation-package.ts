import { cldrTag, literalText, parseIcu, pluralGaps, signature, signatureDiff } from './icu-rules'
import { SECTIONS, type Section, type SourceEntry } from './survey-catalogue'
import { smsLength } from '@/supabase/functions/_shared/sms'

/**
 * The translation file formats for survey languages (D-133): what admin › Translations exports,
 * and what it imports back.
 *
 *   JSON  «orgpuls-translations» v1 — the recommended format. One file per language; every entry
 *         carries its key, section, the bokmål source, the English as a reference, the context,
 *         the translation, its workflow step and notes, and the SHA-256 of the source it was
 *         translated from. It diffs cleanly, and a translator can work in it with any editor.
 *   XLIFF 2.0 — for an agency's CAT tool (Trados, memoQ, Phrase). The same entries as <unit>s;
 *         the step as the segment's state, the rest as notes and metadata.
 *
 * An import never approves: a translation reaches respondents only when approved in the admin.
 */
export const FORMAT = 'orgpuls-translations'
export const FORMAT_VERSION = 1

export type Step = 'draft' | 'in_review' | 'adjudicated' | 'pretested'
export const STEPS: readonly Step[] = ['draft', 'in_review', 'adjudicated', 'pretested']
export type Origin = 'official' | 'professional' | 'machine'
export const ORIGINS: readonly Origin[] = ['official', 'professional', 'machine']

/** What the database holds for a key (admin_translations) */
export type Current = { item: string; text: string; status: string; source: string; notes: string | null; source_hash: string | null }

export type PackageEntry = {
  key: string
  section: Section
  context: string
  source: string
  reference_en: string | null
  target: string
  status: string
  origin: string | null
  notes: string
  source_hash: string
}

export type Package = { format: typeof FORMAT; version: number; locale: string; source_locale: 'nb'; exported_at: string; entries: PackageEntry[] }

export function buildPackage(locale: string, catalogue: readonly SourceEntry[], current: readonly Current[], exportedAt: string): Package {
  const byKey = new Map(current.map((c) => [c.item, c]))
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    locale,
    source_locale: 'nb',
    exported_at: exportedAt,
    entries: catalogue.map((e) => {
      const c = byKey.get(e.key)
      return {
        key: e.key,
        section: e.section,
        context: e.context,
        source: e.source,
        reference_en: e.en,
        target: c?.text ?? '',
        status: c?.status ?? 'untranslated',
        origin: c?.source ?? null,
        notes: c?.notes ?? '',
        // the source the current translation was made from, or the current source for an empty one
        source_hash: c?.source_hash ?? e.hash,
      }
    }),
  }
}

export const toJson = (p: Package) => JSON.stringify(p, null, 2) + '\n'

// ---------------------------------------------------------------- XLIFF 2.0
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const unesc = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')

/** The workflow step as XLIFF's segment state, and back */
const STATE: Record<string, string> = { untranslated: 'initial', draft: 'translated', in_review: 'translated', adjudicated: 'reviewed', pretested: 'reviewed', approved: 'final', retired: 'initial' }

export function toXliff(p: Package): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" xmlns:mda="urn:oasis:names:tc:xliff:metadata:2.0" version="2.0" srcLang="nb" trgLang="${esc(p.locale)}">`,
    `  <file id="orgpuls-survey-${esc(p.locale)}" original="${FORMAT}/v${p.version}">`,
  ]
  for (const e of p.entries) {
    lines.push(`    <unit id="${esc(e.key)}">`)
    lines.push('      <mda:metadata><mda:metaGroup category="orgpuls">')
    lines.push(`        <mda:meta type="section">${esc(e.section)}</mda:meta>`)
    lines.push(`        <mda:meta type="status">${esc(e.status)}</mda:meta>`)
    lines.push(`        <mda:meta type="source_hash">${esc(e.source_hash)}</mda:meta>`)
    if (e.origin) lines.push(`        <mda:meta type="origin">${esc(e.origin)}</mda:meta>`)
    lines.push('      </mda:metaGroup></mda:metadata>')
    lines.push('      <notes>')
    lines.push(`        <note category="context">${esc(e.context)}</note>`)
    if (e.reference_en) lines.push(`        <note category="reference-en">${esc(e.reference_en)}</note>`)
    if (e.notes) lines.push(`        <note category="translator">${esc(e.notes)}</note>`)
    lines.push('      </notes>')
    lines.push(`      <segment state="${STATE[e.status] ?? 'initial'}">`)
    lines.push(`        <source>${esc(e.source)}</source>`)
    lines.push(`        <target>${esc(e.target)}</target>`)
    lines.push('      </segment>')
    lines.push('    </unit>')
  }
  lines.push('  </file>', '</xliff>', '')
  return lines.join('\n')
}

// ---------------------------------------------------------------- reading a file
/** One entry as a file gives it: only what an import can use */
export type FileEntry = { key: string; target: string; status?: string; origin?: string; notes?: string; source_hash?: string }
export type ParsedFile = { format: 'json' | 'xliff' | 'xlsx'; locale: string; entries: FileEntry[] }

export class FileError extends Error {}

const inner = (xml: string, tag: string) => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>|<${tag}(?:\\s[^>]*)?/>`).exec(xml)
  return m ? (m[1] ?? '') : null
}
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

export function parseFile(text: string): ParsedFile {
  const body = text.replace(/^﻿/, '').trim()
  if (body.startsWith('{')) {
    let data: unknown
    try {
      data = JSON.parse(body)
    } catch {
      throw new FileError('not_json')
    }
    const d = data as Partial<Package>
    if (d.format !== FORMAT || typeof d.locale !== 'string' || !Array.isArray(d.entries)) throw new FileError('not_a_package')
    if (d.version !== FORMAT_VERSION) throw new FileError('version')
    return {
      format: 'json',
      locale: d.locale,
      entries: d.entries.map((e) => {
        const x = e as Partial<PackageEntry>
        if (typeof x.key !== 'string' || typeof x.target !== 'string') throw new FileError('entry')
        return {
          key: x.key,
          target: x.target,
          status: typeof x.status === 'string' ? x.status : undefined,
          origin: typeof x.origin === 'string' ? x.origin : undefined,
          notes: typeof x.notes === 'string' ? x.notes : undefined,
          source_hash: typeof x.source_hash === 'string' ? x.source_hash : undefined,
        }
      }),
    }
  }
  if (body.startsWith('<')) {
    const root = /<xliff\b[^>]*>/.exec(body)?.[0]
    if (!root || attr(root, 'version') !== '2.0') throw new FileError('not_xliff2')
    const locale = attr(root, 'trgLang')
    if (!locale) throw new FileError('not_xliff2')
    const entries: FileEntry[] = []
    for (const m of body.matchAll(/<unit\b([^>]*)>([\s\S]*?)<\/unit>/g)) {
      const key = attr(m[1]!, 'id')
      const unit = m[2]!
      const target = inner(unit, 'target')
      if (!key) throw new FileError('entry')
      // inline markup (<ph>, <pc>, …) would be a placeholder the tool rewrote: refuse rather than guess
      if (target !== null && /<[a-z]/i.test(target)) throw new FileError(`inline:${unesc(key)}`)
      const meta = (type: string) => {
        const v = new RegExp(`<mda:meta type="${type}">([\\s\\S]*?)</mda:meta>`).exec(unit)?.[1]
        return v === undefined ? undefined : unesc(v)
      }
      const translator = /<note category="translator">([\s\S]*?)<\/note>/.exec(unit)?.[1]
      const state = attr(/<segment\b[^>]*>/.exec(unit)?.[0] ?? '', 'state')
      entries.push({
        key: unesc(key),
        target: target === null ? '' : unesc(target),
        // the workflow step as exported, else from the segment's state
        status: meta('status') ?? (state === 'reviewed' ? 'adjudicated' : state === 'translated' ? 'draft' : undefined),
        origin: meta('origin'),
        notes: translator === undefined ? undefined : unesc(translator),
        source_hash: meta('source_hash'),
      })
    }
    return { format: 'xliff', locale: unesc(locale), entries }
  }
  throw new FileError('unknown_format')
}

// ---------------------------------------------------------------- checking an import
export type Problem = { key: string; level: 'error' | 'warning'; code: string; detail?: string }
export type ImportRow = { key: string; text: string; source: Origin; status: Step; notes: string | null; source_hash: string }
export type Checked = { rows: ImportRow[]; problems: Problem[]; untranslated: number; unchanged: number }

/**
 * What an import would write: every entry with a translation that differs from what the database
 * holds, checked against the source. An error keeps that entry out; a warning lets it in.
 *   unknown_key      not a text any survey could show
 *   syntax           the translation is not a valid message
 *   placeholders     its {placeholders} or tags differ from the source's
 *   plural           a plural lacks a category this language needs (Polish: one/few/many/other)
 *   stale            translated from an older source: imported, but the page will not use it
 *   approved_capped  the file says approved; only the admin approves, so it is pretested
 *   step             not a workflow step: imported as a draft
 *   sms_long         an SMS text that alone takes more than one SMS
 */
export function checkImport(file: ParsedFile, catalogue: readonly SourceEntry[], current: readonly Current[], defaultOrigin: Origin): Checked {
  const byKey = new Map(catalogue.map((e) => [e.key, e]))
  const now = new Map(current.map((c) => [c.item, c]))
  const tag = cldrTag(file.locale)
  const rows: ImportRow[] = []
  const problems: Problem[] = []
  let untranslated = 0
  let unchanged = 0
  const seen = new Set<string>()

  for (const e of file.entries) {
    const src = byKey.get(e.key)
    if (!src) {
      problems.push({ key: e.key, level: 'error', code: 'unknown_key' })
      continue
    }
    if (seen.has(e.key)) continue
    seen.add(e.key)
    const text = e.target.trim()
    if (!text) {
      untranslated++
      continue
    }
    // the page strings and mails are ICU messages; the questions are plain text
    if (src.section === 'ui' || src.section === 'mail') {
      let bad = false
      try {
        const ast = parseIcu(text)
        const diff = signatureDiff(signature(parseIcu(src.source)), signature(ast))
        if (diff.length) {
          problems.push({ key: e.key, level: 'error', code: 'placeholders', detail: diff.join('; ') })
          bad = true
        }
        const gaps = pluralGaps(ast, tag)
        if (gaps.length) {
          problems.push({ key: e.key, level: 'error', code: 'plural', detail: gaps.join('; ') })
          bad = true
        }
        if (src.sms && smsLength(literalText(ast)).parts > 1) problems.push({ key: e.key, level: 'warning', code: 'sms_long' })
      } catch (err) {
        problems.push({ key: e.key, level: 'error', code: 'syntax', detail: err instanceof Error ? err.message : String(err) })
        bad = true
      }
      if (bad) continue
    }
    let status: Step = 'draft'
    if (e.status === 'approved') {
      problems.push({ key: e.key, level: 'warning', code: 'approved_capped' })
      status = 'pretested'
    } else if ((STEPS as readonly string[]).includes(e.status ?? '')) status = e.status as Step
    else if (e.status && e.status !== 'untranslated') problems.push({ key: e.key, level: 'warning', code: 'step', detail: e.status })
    const origin: Origin = (ORIGINS as readonly string[]).includes(e.origin ?? '') ? (e.origin as Origin) : defaultOrigin
    const hash = /^[0-9a-f]{64}$/.test(e.source_hash ?? '') ? e.source_hash! : src.hash
    if (hash !== src.hash) problems.push({ key: e.key, level: 'warning', code: 'stale' })
    const notes = e.notes?.trim() ? e.notes.trim() : null
    const c = now.get(e.key)
    if (c && c.text === text && c.source === origin && c.status === status && (notes ?? null) === (c.notes ?? null) && c.source_hash === hash) {
      unchanged++
      continue
    }
    rows.push({ key: e.key, text, source: origin, status, notes, source_hash: hash })
  }
  return { rows, problems, untranslated, unchanged }
}

/** A translation's standing, for the admin: none, in the workflow, approved, or approved but made from an older source */
export function standing(entry: SourceEntry, c: Current | undefined): 'none' | 'workflow' | 'approved' | 'stale' {
  if (!c) return 'none'
  if (c.status !== 'approved') return 'workflow'
  if ((entry.section === 'ui' || entry.section === 'mail') && c.source_hash !== entry.hash) return 'stale'
  return 'approved'
}

export const sectionOf = (key: string): Section | null => {
  const s = key.startsWith('core:') ? 'core' : key.startsWith('extra:') ? 'extra' : key.startsWith('module:') || key.startsWith('mfactor:') ? 'module' : key.startsWith('ui:') ? 'ui' : key.startsWith('mail:') ? 'mail' : null
  return s && (SECTIONS as readonly string[]).includes(s) ? s : null
}
