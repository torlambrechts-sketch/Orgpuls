/**
 * The pseudo-locale (multilingual-gap-analysis.md, CI check 6): the source catalogue, every
 * word accented and lengthened, every message bracketed.
 *
 *   node scripts/i18n/pseudo.mjs                 write .pseudo/no.json from messages/no.json
 *   node scripts/i18n/pseudo.mjs --out <file>    somewhere else
 *
 * What it is for. Norwegian is short beside the languages the survey will be offered in, and a
 * screen built to it can clip or scroll sideways when the words grow. A pseudo catalogue shows
 * that on the Norwegian screens themselves, before any translation exists:
 *   - accents (a → á, e → é, s → š …) prove the font and the page carry more than ASCII;
 *   - about 40 % more letters (every vowel doubled, the remainder padded with ·) show what
 *     a longer language does to the layout — longer words, not only longer sentences;
 *   - `[` and `]` around every message show where one ends, so text that is cut off or a
 *     string that never came from the catalogue (hard-coded, or from the database) is plain.
 *
 * ICU is parsed, not pattern-matched (@formatjs/icu-messageformat-parser, as next-intl does):
 * only literal text changes. Arguments, plural and select branches, `#` and rich-text tags
 * keep their names, so the pseudo catalogue formats with the same values the page passes, and
 * the run fails if any message's arguments or tags differ from its source's.
 *
 * The output is generated and not committed (.gitignore). lib/i18n/pseudo.ts reads it when
 * ORGPULS_PSEUDO=1, which only the QA stack's pseudo server sets (scripts/qa/serve.mjs).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse, TYPE } from '@formatjs/icu-messageformat-parser'
import { printAST } from '@formatjs/icu-messageformat-parser/printer.js'

export const PSEUDO_SOURCE = 'messages/no.json'
export const PSEUDO_OUT = '.pseudo/no.json'
/** letters added per letter of source text, besides the brackets */
export const EXPANSION = 0.4

const ACCENT = Object.fromEntries(
  [...'aáeéiíoóuúyýAÁEÉIÍOÓUÚYÝcçCÇnñNÑsšSŠzžZŽrřRŘgĝGĜhĥHĤjĵJĴkķKĶlļLĻtţTŢwŵWŴdďDĎ'.match(/../gu)].map((p) => [...p]),
)
const VOWEL = /[aeiouyæøåAEIOUYÆØÅ]/
// a word that is an address stays one: a mangled URL or e-mail is not a translation
const VERBATIM = /^(https?:\/\/|www\.|\S+@\S+\.\S+$)/

/** One run of literal text: accented, and lengthened by doubling vowels, then padding. */
function stretch(text) {
  const letters = [...text].filter((c) => /\p{L}/u.test(c)).length
  if (letters === 0) return text
  let extra = Math.ceil(letters * EXPANSION)
  const words = text.split(/(\s+)/)
  const out = words.map((w) => {
    if (!w.trim() || VERBATIM.test(w)) return w
    let s = ''
    for (const c of w) {
      const a = ACCENT[c] ?? c
      s += a
      if (extra > 0 && VOWEL.test(c)) {
        s += a
        extra -= 1
      }
    }
    return s
  })
  // what the vowels did not cover goes on the last word, so no word is split by it
  if (extra > 0) {
    const last = out.findLastIndex((w) => w.trim() && !VERBATIM.test(w))
    if (last >= 0) out[last] += '·'.repeat(extra)
  }
  return out.join('')
}

function walk(ast) {
  for (const el of ast) {
    if (el.type === TYPE.literal) el.value = stretch(el.value)
    else if (el.type === TYPE.tag) walk(el.children)
    else if (el.type === TYPE.plural || el.type === TYPE.select) for (const o of Object.values(el.options)) walk(o.value)
  }
  return ast
}

/** the names of every argument and tag in a message, and what kind each is */
function shape(ast, into = new Set()) {
  for (const el of ast) {
    if (el.type === TYPE.literal || el.type === TYPE.pound) continue
    into.add(`${el.type}:${el.value}`)
    if (el.type === TYPE.tag) shape(el.children, into)
    if (el.type === TYPE.plural || el.type === TYPE.select) {
      for (const [k, o] of Object.entries(el.options)) {
        into.add(`${el.type}:${el.value}:${k}`)
        shape(o.value, into)
      }
    }
  }
  return into
}

/** One message in pseudo form, or null when the source is not ICU the parser accepts. */
export function pseudoMessage(source) {
  let ast
  try {
    ast = parse(source)
  } catch {
    return null
  }
  const before = [...shape(ast)].sort().join('|')
  const out = `[${printAST(walk(ast))}]`
  const after = [...shape(parse(out))].sort().join('|')
  if (before !== after) throw new Error(`pseudo: arguments or tags changed in ${JSON.stringify(source)}`)
  return out
}

/** The whole catalogue. A message the parser refuses is kept as it is, bracketed. */
export function pseudoCatalogue(messages, stats = { messages: 0, verbatim: [] }, path = []) {
  const out = {}
  for (const [key, value] of Object.entries(messages)) {
    if (value && typeof value === 'object') out[key] = pseudoCatalogue(value, stats, [...path, key])
    else if (typeof value === 'string') {
      stats.messages += 1
      const p = pseudoMessage(value)
      if (p === null) stats.verbatim.push([...path, key].join('.'))
      out[key] = p ?? value
    } else out[key] = value
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : PSEUDO_OUT
  const stats = { messages: 0, verbatim: [] }
  const catalogue = pseudoCatalogue(JSON.parse(readFileSync(PSEUDO_SOURCE, 'utf8')), stats)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(catalogue, null, 2) + '\n')
  console.log(`pseudo: ${stats.messages} messages from ${PSEUDO_SOURCE} -> ${out}`)
  if (stats.verbatim.length) console.log(`pseudo: ${stats.verbatim.length} not ICU, left as they are: ${stats.verbatim.join(', ')}`)
}
