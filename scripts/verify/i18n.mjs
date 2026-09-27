/**
 * Message catalogues: parity, syntax, plurals, SMS encoding.
 *
 * Norwegian is the source language: every string is extracted verbatim from the design
 * bundle, and English is translated from it. None of what goes wrong below is a type error
 * or fails a build, so it is checked explicitly:
 *
 * 1. A key exists in one file and not the other. next-intl's getMessageFallback renders
 *    the missing one as `namespace.key`, which is visible in review but only if someone
 *    looks at that screen in that language.
 * 2. A message is not valid ICU. next-intl compiles it at render time and throws, so the
 *    screen breaks in the one language whose translator dropped a brace.
 * 3. The arguments drift — `{answered} of {total}` translated as `{count} of {total}`, a
 *    `{n, plural, …}` translated as a bare `{n}`, a `<b>` tag renamed. next-intl then prints
 *    the literal `{count}`, or formats the value wrongly, or drops the rich text. Compared by
 *    parsing each message with the parser next-intl compiles with and walking the tree, per
 *    argument name and kind, and per tag name. (An earlier hand-written scanner did this by
 *    walking braces; a regular expression cannot, since it cannot tell an argument from the
 *    opening brace of a plural branch.)
 * 4. A plural lacks a category its language needs. Norwegian and English have one and other;
 *    Polish, Lithuanian and Ukrainian have one, few, many and other, and a Polish plural with
 *    only one/other prints "5 pliki" where it should print "5 plików". The categories come
 *    from CLDR via Intl.PluralRules, so a new language is checked without a table to update.
 *    `=1` counts as `one` only where that language's `one` is the number 1 and nothing else.
 * 5. An SMS template carries a character outside GSM-7. One such character sends every
 *    message as UCS-2, 70 characters a part instead of 160, and the organisation pays for it.
 *
 * The rules live in lib/i18n/icu-rules.ts and lib/sms/gsm7.ts; tests/unit/plurals.test.ts
 * and tests/unit/sms-gsm.test.ts run the same code.
 *
 *   node scripts/verify/i18n.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tsImport } from 'tsx/esm/api'

const { cldrTag, flattenMessages, literalText, parseIcu, pluralGaps, signature, signatureDiff } = await tsImport(
  '../../lib/i18n/icu-rules.ts',
  import.meta.url,
)
const { nonGsm7 } = await tsImport('../../lib/sms/gsm7.ts', import.meta.url)

const DIR = 'messages'
const SOURCE = 'no'

/** Where the SMS templates are, and the languages an SMS is sent in (mail.ts, D-66). */
const SMS_PREFIX = 'mail.sms.'
const SMS_LOCALES = ['no', 'en']

/**
 * Findings that are known and deliberately not fixed, as `locale key: check` → why. Keep it
 * empty where possible. Strings under respond, factor, extra and mail are approved or legal
 * texts: changing one withdraws its approval, so a finding there is listed with its reason
 * until the owner approves a corrected text.
 */
const ALLOWED = {}

const locales = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))

const messages = Object.fromEntries(
  locales.map((l) => [l, flattenMessages(JSON.parse(readFileSync(join(DIR, `${l}.json`), 'utf8')))]),
)

const source = messages[SOURCE]
if (!source) {
  console.error(`no ${SOURCE}.json — the source language must exist`)
  process.exit(2)
}

let failures = 0
let allowed = 0
const used = new Set()
const fail = (locale, key, check, msg) => {
  const id = `${locale} ${key}: ${check}`
  if (id in ALLOWED) {
    used.add(id)
    allowed += 1
    console.log(`  allowed — ${locale}: ${key} ${msg} (${ALLOWED[id]})`)
    return
  }
  console.error(`  ${locale}: ${key} ${msg}`)
  failures += 1
}

// Parse everything once. A message that does not parse is reported here and skipped by
// the checks that need its tree.
const trees = {}
for (const locale of locales) {
  trees[locale] = {}
  for (const [key, text] of Object.entries(messages[locale])) {
    try {
      trees[locale][key] = parseIcu(text)
    } catch (e) {
      const at = e?.location?.start?.offset
      fail(locale, key, 'syntax', `is not valid ICU — ${e?.message ?? e}${at === undefined ? '' : ` at offset ${at}`}`)
    }
  }
}

for (const locale of locales.filter((l) => l !== SOURCE)) {
  const target = messages[locale]
  console.log(`${SOURCE} -> ${locale}: ${Object.keys(source).length} keys`)

  for (const key of Object.keys(source)) {
    if (!(key in target)) {
      fail(locale, key, 'parity', 'is missing')
      continue
    }
    const a = trees[SOURCE][key]
    const b = trees[locale][key]
    if (!a || !b) continue
    const diff = signatureDiff(signature(a), signature(b))
    if (diff.length) fail(locale, key, 'arguments', `arguments differ — ${diff.join('; ')}`)
  }

  for (const key of Object.keys(target)) {
    if (!(key in source)) fail(locale, key, 'parity', `has no ${SOURCE} source`)
  }
}

let plurals = 0
for (const locale of locales) {
  const tag = cldrTag(locale)
  for (const [key, tree] of Object.entries(trees[locale])) {
    if (JSON.stringify(tree).includes('"pluralType"')) plurals += 1
    for (const gap of pluralGaps(tree, tag)) fail(locale, key, 'plural', gap)
  }
}
console.log(`plurals: ${plurals} checked against CLDR (${locales.map((l) => `${l}→${cldrTag(l)}`).join(', ')})`)

let sms = 0
for (const locale of SMS_LOCALES.filter((l) => messages[l])) {
  for (const [key, tree] of Object.entries(trees[locale])) {
    if (!key.startsWith(SMS_PREFIX)) continue
    sms += 1
    const bad = nonGsm7(literalText(tree))
    if (bad.length) {
      const shown = bad.map((c) => `${JSON.stringify(c)} U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
      fail(locale, key, 'gsm7', `is not GSM-7 — ${shown.join(', ')}`)
    }
  }
}
console.log(`sms: ${sms} templates checked for GSM-7 (${SMS_LOCALES.join(', ')})`)

for (const id of Object.keys(ALLOWED)) {
  if (!used.has(id)) {
    console.error(`  allow-list entry no longer matches anything, remove it: ${id}`)
    failures += 1
  }
}

console.log(failures === 0 ? `i18n: PASS${allowed ? ` (${allowed} allowed)` : ''}` : `i18n: FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
