/**
 * The respondent pages' strings, per language, reduced to one hash (engagement P1.1, D-127).
 *
 *   node scripts/i18n/respondent-ui.mjs          write lib/i18n/respondent-ui.json
 *   node scripts/i18n/respondent-ui.mjs --check  fail if it is out of date (run by verify:i18n)
 *
 * A language is offered to respondents only when its respondent strings were approved
 * (app.ui_translation_approvals, 0078), and an approval names the hash it approved. Change one
 * of those strings and the hash moves, so the language stops being offered until somebody
 * approves the new wording. The questions themselves are not here: they are items, approved
 * one by one in app.item_translations.
 *
 * What counts as a respondent string: the `respond` namespace, and the factor and extra labels
 * printed above a question. The hash is SHA-256 of that object with its keys sorted.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const OUT = 'lib/i18n/respondent-ui.json'
const LOCALES = ['no', 'en', 'pl', 'lt']

const sorted = (v) =>
  Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v

export function respondentStrings(messages) {
  const labels = (ns) => Object.fromEntries(Object.entries(messages[ns] ?? {}).map(([k, v]) => [k, v?.label ?? null]))
  return sorted({ respond: messages.respond ?? null, factor: labels('factor'), extra: labels('extra') })
}

export function respondentHashes() {
  const out = {}
  for (const l of LOCALES) {
    const file = `messages/${l}.json`
    if (!existsSync(file)) continue
    const strings = respondentStrings(JSON.parse(readFileSync(file, 'utf8')))
    out[l] = createHash('sha256').update(JSON.stringify(strings)).digest('hex')
  }
  return out
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  const next = JSON.stringify(respondentHashes(), null, 2) + '\n'
  if (process.argv.includes('--check')) {
    const now = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
    if (now !== next) {
      console.error(`${OUT} is out of date: run node scripts/i18n/respondent-ui.mjs`)
      process.exit(1)
    }
    console.log('respondent-ui: current')
  } else {
    writeFileSync(OUT, next)
    console.log(`wrote ${OUT}`)
  }
}
