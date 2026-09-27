/**
 * The respondent pages' strings, per language, reduced to one hash (engagement P1.1, D-127).
 *
 *   node scripts/i18n/respondent-ui.mjs          write lib/i18n/respondent-ui.json
 *   node scripts/i18n/respondent-ui.mjs --check  fail if it is out of date (run by verify:i18n)
 *
 * A language is offered to respondents only when its respondent strings were approved
 * (app.ui_translation_approvals, 0079), and an approval names the hash it approved. Change one
 * of those strings and the hash moves, so the language stops being offered until somebody
 * approves the new wording. The questions themselves are not here: they are items, approved
 * one by one in app.item_translations.
 *
 * What counts as a respondent string: the `respond` namespace, and the factor and extra labels
 * printed above a question. The hash is SHA-256 of that object with its keys sorted.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { localeRegistry } from '../lib/locales.mjs'

const OUT = 'lib/i18n/respondent-ui.json'
// the survey languages, from the one registry (lib/i18n/locales.ts)
const LOCALES = localeRegistry()
  .filter((l) => l.survey)
  .map((l) => l.code)

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

/**
 * The bokmål source of every page string and personal mail text, by path, as its SHA-256 (D-133):
 * a survey language's translation of it is used only while it was made from this source.
 * lib/i18n/survey-catalogue.ts sourceHashes() computes the same, and a unit test holds them equal.
 */
const SOURCE_OUT = 'lib/i18n/survey-source.json'
export function surveySource() {
  const no = JSON.parse(readFileSync('messages/no.json', 'utf8'))
  const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex')
  const ui = {}
  const walk = (v, path, out) => {
    if (typeof v === 'string') out[path] = sha(v)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, out)
  }
  walk(respondentStrings(no), '', ui)
  const mail = {}
  const branches = JSON.parse(readFileSync('lib/i18n/survey-text-keys.json', 'utf8')).mail
  for (const b of branches) walk(no.mail?.[b], b, mail)
  return { ui: Object.fromEntries(Object.entries(ui).filter(([, h]) => h)), mail }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  const outputs = [
    [OUT, JSON.stringify(respondentHashes(), null, 2) + '\n'],
    [SOURCE_OUT, JSON.stringify(surveySource(), null, 2) + '\n'],
  ]
  if (process.argv.includes('--check')) {
    for (const [file, next] of outputs) {
      const now = existsSync(file) ? readFileSync(file, 'utf8') : ''
      if (now !== next) {
        console.error(`${file} is out of date: run node scripts/i18n/respondent-ui.mjs`)
        process.exit(1)
      }
    }
    console.log('respondent-ui: current')
  } else {
    for (const [file, next] of outputs) {
      writeFileSync(file, next)
      console.log(`wrote ${file}`)
    }
  }
}
