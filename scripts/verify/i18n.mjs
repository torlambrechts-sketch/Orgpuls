/**
 * Message parity.
 *
 * Norwegian is the source language: every string is extracted verbatim from the design
 * bundle, and English is translated from it. Two ways that goes wrong silently, both
 * caught here:
 *
 * 1. A key exists in one file and not the other. next-intl's getMessageFallback renders
 *    the missing one as `namespace.key`, which is visible in review but only if someone
 *    looks at that screen in that language.
 * 2. The ICU placeholders drift — `{answered} of {total}` translated as `{count} of
 *    {total}`. next-intl then renders the literal `{count}`, so a screen that reads
 *    correctly in Norwegian prints a brace-wrapped variable name in English.
 *
 * Neither is a type error and neither fails a build, so it is checked explicitly.
 *
 *   node scripts/verify/i18n.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'messages'
const SOURCE = 'no'

const flatten = (value, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(value)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out[key] = String(v)
  }
  return out
}

/**
 * The ICU arguments a message takes — scanned, not matched.
 *
 * A regular expression cannot do this. `{count, plural, one {# faktor} other {# faktorer}}`
 * takes one argument, `count`, but `/\{\s*(\w+)/g` finds three: it cannot tell an
 * argument from the opening brace of a branch body. The consequence was not theoretical —
 * it reported "missing {Ingen} {Ett}, unexpected {No} {One}" for a correctly translated
 * message, and the earlier response was to stop using plural branches, which is the wrong
 * half of the problem to fix. A select or plural whose branches differ per language is
 * exactly what ICU is for.
 *
 * So this walks the string in the two contexts ICU defines. In a *message* a `{` opens an
 * argument; in an *argument* the `{...}` blocks that follow a selector are messages again,
 * and may hold arguments of their own. Single quotes escape a brace, as ICU says.
 */
const placeholders = (s) => {
  const out = new Set()
  let i = 0

  // a message: text, escapes, and arguments. Returns at the `}` that closes the branch
  // it sits in, without consuming it — the argument scanner owns that brace.
  const message = () => {
    while (i < s.length) {
      const c = s[i]
      if (c === '}') return
      if (c === "'") {
        i += 1
        while (i < s.length && s[i] !== "'") i += 1
        i += 1
        continue
      }
      if (c === '{') {
        i += 1
        argument()
        continue
      }
      i += 1
    }
  }

  // an argument: a name, optionally a type and selectors whose bodies are messages
  const argument = () => {
    while (i < s.length && /\s/.test(s[i])) i += 1
    let name = ''
    while (i < s.length && /[\w.]/.test(s[i])) name += s[i++]
    if (name) out.add(name)
    while (i < s.length) {
      const c = s[i]
      if (c === '}') {
        i += 1
        return
      }
      if (c === '{') {
        i += 1
        message()
        if (s[i] === '}') i += 1
        continue
      }
      i += 1
    }
  }

  message()
  return out
}

const locales = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))

const messages = Object.fromEntries(
  locales.map((l) => [l, flatten(JSON.parse(readFileSync(join(DIR, `${l}.json`), 'utf8')))]),
)

const source = messages[SOURCE]
if (!source) {
  console.error(`no ${SOURCE}.json — the source language must exist`)
  process.exit(2)
}

let failures = 0
const fail = (msg) => {
  console.error(`  ${msg}`)
  failures += 1
}

for (const locale of locales.filter((l) => l !== SOURCE)) {
  const target = messages[locale]
  console.log(`${SOURCE} -> ${locale}: ${Object.keys(source).length} keys`)

  for (const key of Object.keys(source)) {
    if (!(key in target)) {
      fail(`${locale}: missing key ${key}`)
      continue
    }
    const a = placeholders(source[key])
    const b = placeholders(target[key])
    const missing = [...a].filter((p) => !b.has(p))
    const extra = [...b].filter((p) => !a.has(p))
    if (missing.length || extra.length) {
      fail(
        `${locale}: ${key} placeholders differ` +
          (missing.length ? ` — missing {${missing.join('} {')}}` : '') +
          (extra.length ? ` — unexpected {${extra.join('} {')}}` : ''),
      )
    }
  }

  for (const key of Object.keys(target)) {
    if (!(key in source)) fail(`${locale}: ${key} has no ${SOURCE} source`)
  }
}

console.log(failures === 0 ? 'i18n: PASS' : `i18n: FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
