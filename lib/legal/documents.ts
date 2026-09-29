import { createHash } from 'node:crypto'
import { canonical, type LegalLang, type LegalSection, type LegalUnit, type Msg } from './registry'

/**
 * The legal review by document (X-096): an industry page, a module, the privacy statement — read
 * and marked reviewed as a whole, the way a lawyer reads them, instead of a checkbox per sentence.
 * The registry's units stay the lines a document is made of; a document's text is its units in
 * order, each under its key, so the text stored at review (0122) can be compared line by line with
 * the text now.
 */
export type LegalDoc = {
  key: string
  section: LegalSection
  /** a message key under admin.legal.unit or admin.legal.doc, with the names it quotes */
  title: Msg
  lang: LegalLang
  where: Msg
  live: boolean
  units: LegalUnit[]
  /** what is stored when it is reviewed, and hashed */
  text: string
  hash: string
  /** broken paths: a broken document cannot be marked reviewed */
  missing: string[]
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/**
 * A unit's document: every line of an industry page or of a module is one; the site's, the
 * product's and the messages' legal texts are one per section and language, because they are
 * read together and a change shows line by line anyway; the documents themselves (the privacy
 * statement, the DPA, the terms) stay one each.
 */
export function docKey(u: { key: string; section: LegalSection; lang: LegalLang }): string {
  const parts = u.key.split(':')
  if (parts[0] === 'industry' || parts[0] === 'module') return parts.slice(0, 3).join(':')
  if (u.section === 'site' || u.section === 'product' || u.section === 'messages') return `group:${u.lang}:${u.section}`
  return u.key
}

export function legalDocuments(units: LegalUnit[]): LegalDoc[] {
  const groups = new Map<string, LegalUnit[]>()
  for (const u of units) {
    const k = docKey(u)
    groups.set(k, [...(groups.get(k) ?? []), u])
  }
  return [...groups.entries()].map(([key, list]) => {
    const first = list[0]!
    const text = list.map((u) => `# ${u.key}\n${canonical(u.lines)}`).join('\n\n')
    const kind = key.split(':')[0]
    const title: Msg =
      kind === 'industry'
        ? { key: 'doc.industryPage', values: { page: String(first.title.values?.page ?? key.split(':')[1]) } }
        : kind === 'module'
          ? { key: 'doc.moduleFile', values: { module: String(first.title.values?.module ?? key.split(':')[1]) } }
          : kind === 'group'
            ? { key: `doc.group.${first.section}` }
            : first.title
    return {
      key,
      section: first.section,
      title,
      lang: first.lang,
      // a group is read in several places; each part says its own
      where: kind === 'group' && list.length > 1 ? { key: 'severalPlaces' } : first.where,
      live: list.some((u) => u.live),
      units: list,
      text,
      hash: sha256(text),
      missing: list.flatMap((u) => u.missing ?? []),
    }
  })
}

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

/**
 * What changed between the text reviewed and the text now, line by line (a longest common
 * subsequence; documents are a few hundred lines at most). Runs of unchanged lines are kept so the
 * caller can fold them.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: 'removed', text: a[i++]! })
    } else {
      out.push({ kind: 'added', text: b[j++]! })
    }
  }
  while (i < n) out.push({ kind: 'removed', text: a[i++]! })
  while (j < m) out.push({ kind: 'added', text: b[j++]! })
  return out
}

/** Whether the old per-line approvals (0082) cover a document as it is now: then it reads as reviewed */
export const approvedLineByLine = (doc: LegalDoc, approvals: ReadonlyMap<string, string>) =>
  doc.units.length > 0 && doc.units.every((u) => approvals.get(u.key) === u.hash)
