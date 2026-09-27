import { createHash } from 'node:crypto'
import { respondentLines } from './respondent-strings'
import keys from './survey-text-keys.json'

/**
 * Every text a respondent can meet in a survey language (D-133), with its bokmål source, the
 * English as a reference, and the SHA-256 of the bokmål it must be translated from. The admin's
 * Translations page lists these, the export writes them, and the import accepts only these keys.
 *
 *   core     the survey's statements (messages factor.<key>.s<n>)
 *   extra    the questions outside the index and their options
 *   module   a published module's statements, count and background questions, options and factor
 *            names, and the kindergarten and school wordings of a worded module (0083)
 *   ui       the survey pages' strings (lib/i18n/respondent-strings.ts)
 *   mail     the invitation, the reminders, the link asked for, and the SMS (survey-text-keys.json)
 *
 * The registry keys are the database's (0079, 0084, 0086). Bokmål and English are the platform's
 * languages and keep their texts in messages/; these are for every other survey language.
 */
export type Section = 'core' | 'extra' | 'module' | 'ui' | 'mail'
export const SECTIONS: readonly Section[] = ['core', 'extra', 'module', 'ui', 'mail']

export type SourceEntry = {
  key: string
  section: Section
  source: string
  en: string | null
  /** what the translator needs to know about where the text appears */
  context: string
  hash: string
  /** sent by SMS: its length decides what it costs */
  sms?: boolean
}

type Tree = { [k: string]: unknown }
type Locale = { [k: string]: string | undefined }

export type ModuleSource = {
  key: string
  version: string
  name: string
  factors: { id: string; name: string; i18n: Record<string, { name?: string } | undefined> | null }[]
  items: {
    id: string
    code: string
    kind: 'likert5' | 'count' | 'segment'
    factor: string | null
    text: Locale
    options: Locale[] | null
  }[]
}

export const sourceHash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

const WORDINGS = ['barnehage', 'skole'] as const

const at = (tree: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Tree)[k] : undefined), tree)

function leaves(tree: unknown, prefix: string, out: { path: string; text: string }[] = []) {
  if (typeof tree === 'string') out.push({ path: prefix, text: tree })
  else if (tree && typeof tree === 'object') for (const [k, v] of Object.entries(tree)) leaves(v, `${prefix}.${k}`, out)
  return out
}

export function surveyCatalogue(no: Tree, en: Tree, modules: readonly ModuleSource[]): SourceEntry[] {
  const out: SourceEntry[] = []
  const push = (e: Omit<SourceEntry, 'hash'>) => {
    if (e.source.trim()) out.push({ ...e, hash: sourceHash(e.source) })
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : null)

  // the core survey's statements
  for (const [factor, f] of Object.entries((no.factor ?? {}) as Record<string, Tree>)) {
    const label = str(f.label) ?? factor
    for (const [k, v] of Object.entries(f)) {
      const m = /^s(\d+)$/.exec(k)
      if (m && typeof v === 'string')
        push({ key: `core:${factor}:${m[1]}`, section: 'core', source: v, en: str(at(en, `factor.${factor}.${k}`)),
               context: `Statement ${m[1]} of «${label}», answered on a 1–5 agreement scale. Part of the validated core instrument.` })
    }
  }
  // the questions outside the index and their options
  for (const [q, x] of Object.entries((no.extra ?? {}) as Record<string, Tree>)) {
    if (typeof x.text === 'string')
      push({ key: `extra:${q}`, section: 'extra', source: x.text, en: str(at(en, `extra.${q}.text`)), context: `Question «${str(x.label) ?? q}», outside the index.` })
    for (const [k, v] of Object.entries(x)) {
      const m = /^o(\d+)$/.exec(k)
      if (m && typeof v === 'string')
        push({ key: `extra:${q}:o${m[1]}`, section: 'extra', source: v, en: str(at(en, `extra.${q}.${k}`)), context: `Answer option ${m[1]} of the question «${str(x.label) ?? q}».` })
    }
  }
  // the published modules
  for (const m of modules) {
    const where = `${m.name} ${m.version}`
    for (const f of m.factors) {
      push({ key: `mfactor:${f.id}`, section: 'module', source: f.name, en: f.i18n?.en?.name ?? null, context: `Factor name in ${where}, printed above its statements.` })
      for (const w of WORDINGS) {
        const v = f.i18n?.[`nb.${w}`]?.name
        if (v) push({ key: `mfactor:${f.id}:v:${w}`, section: 'module', source: v, en: f.i18n?.[`en.${w}`]?.name ?? null, context: `Factor name in ${where}, ${w === 'barnehage' ? 'kindergarten' : 'school'} wording.` })
      }
    }
    for (const i of m.items) {
      const kind = i.kind === 'likert5' ? 'statement' : i.kind === 'count' ? 'count question' : 'background question'
      if (i.text.nb) push({ key: `module:${i.id}`, section: 'module', source: i.text.nb, en: i.text.en ?? null, context: `${where}, ${kind} ${i.code}.` })
      for (const w of WORDINGS) {
        const v = i.text[`nb.${w}`]
        if (v) push({ key: `module:${i.id}:v:${w}`, section: 'module', source: v, en: i.text[`en.${w}`] ?? null, context: `${where}, ${kind} ${i.code}, ${w === 'barnehage' ? 'kindergarten' : 'school'} wording.` })
      }
      ;(i.options ?? []).forEach((o, n) => {
        if (o.nb) push({ key: `module:${i.id}:o${n + 1}`, section: 'module', source: o.nb, en: o.en ?? null, context: `${where}, answer option ${n + 1} of ${kind} ${i.code}.` })
      })
    }
  }
  // the survey pages
  const enLines = new Map(respondentLines(en).map((l) => [l.path, l.text]))
  for (const l of respondentLines(no)) {
    push({ key: `ui:${l.path}`, section: 'ui', source: l.text, en: enLines.get(l.path) ?? null,
           context: l.path.startsWith('factor.') || l.path.startsWith('extra.') ? 'Label printed above a question on the survey page.' : 'Survey page text. Keep every {placeholder} exactly as it is.' })
  }
  // the invitation, the reminders, the link asked for, and the SMS
  for (const branch of keys.mail) {
    for (const l of leaves(at(no, `mail.${branch}`), branch)) {
      const sms = branch === 'sms'
      push({ key: `mail:${l.path}`, section: 'mail', source: l.text, en: str(at(en, `mail.${l.path}`)), sms,
             context: sms ? 'SMS to an employee. Keep it short: one SMS is 160 plain or 70 accented characters, the link included.' : 'E-mail to an employee (invitation, reminder or requested link). Keep every {placeholder} exactly as it is.' })
    }
  }
  return out
}

/** The page strings and mail texts' source hashes, by path, as scripts/i18n/respondent-ui.mjs writes them */
export function sourceHashes(no: Tree): { ui: Record<string, string>; mail: Record<string, string> } {
  const entries = surveyCatalogue(no, {}, [])
  const pick = (section: Section, prefix: string) =>
    Object.fromEntries(entries.filter((e) => e.section === section).map((e) => [e.key.slice(prefix.length), e.hash]))
  return { ui: pick('ui', 'ui:'), mail: pick('mail', 'mail:') }
}
