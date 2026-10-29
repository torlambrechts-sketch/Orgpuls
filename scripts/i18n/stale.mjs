/**
 * Which translations a change to the source left behind. Every text the product shows is written once
 * in bokmål (messages/no.json, CLAUDE.md: «no is the source language») and translated into the other
 * languages and the market packs. lib/i18n/translation-sources.json records, for each translated
 * text, a hash of the bokmål it was translated from. When the bokmål changes, every translation of it
 * that still carries the old hash is stale: the English, Swedish and German files, and each market's
 * pack that has its own words for it. Nothing else said so before: a reworded claim on Norway's site
 * left Sweden's, Germany's and Empvibe's saying the old one, with CI green.
 *
 *   node scripts/i18n/stale.mjs                     list the stale texts; exit 1 if any (npm run verify:i18n)
 *   node scripts/i18n/stale.mjs --accept [file…]    record the current bokmål for the files' texts: they
 *                                                   are translations of it now (all files, if none named)
 *   node scripts/i18n/stale.mjs --accept file --keys a.b,c.d
 *                                                   record it for those texts only
 *   I18N_STALE=report node scripts/i18n/stale.mjs   list them and exit 0 (the weekly fold, whose pull
 *                                                   request then shows what to translate)
 *
 * A text is tracked from the day it is accepted: a new translation is accepted with the source it
 * was made from, in the same piece of work (X-089: translations ship with the text). Fallbacks are
 * not translations: a key Swedish leaves out reads English and is not listed here. A market pack's
 * own text, with no bokmål behind it, follows its pack's own language where it has one (Sweden's and
 * Germany's English from their Swedish and German) and is otherwise its own source (Empvibe's articles).
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'messages'
const STORE = 'lib/i18n/translation-sources.json'
const SOURCE = 'no'

const args = process.argv.slice(2)
const accept = args.includes('--accept')
const keysArg = args.includes('--keys') ? args[args.indexOf('--keys') + 1] : null
const only = keysArg ? new Set(keysArg.split(',').map((k) => k.trim()).filter(Boolean)) : null
const named = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--keys')
const report = process.env.I18N_STALE === 'report'

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
/** every text by its dotted path, a list's items by their index; a null item is the language's own (lib/i18n/merge.ts) */
function flat(value, prefix = '', out = {}) {
  if (typeof value === 'string') out[prefix] = value
  else if (Array.isArray(value)) value.forEach((v, i) => flat(v, `${prefix}.${i}`, out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) flat(v, prefix ? `${prefix}.${k}` : k, out)
  return out
}
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12)

const source = flat(read(join(DIR, `${SOURCE}.json`)))

/** the files that translate the source: the other languages, then each market's pack */
const targets = [
  ...readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== `${SOURCE}.json`)
    .sort()
    .map((f) => join(DIR, f)),
  ...(existsSync(join(DIR, 'market')) ? readdirSync(join(DIR, 'market')).sort() : []).flatMap((m) =>
    readdirSync(join(DIR, 'market', m))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(DIR, 'market', m, f)),
  ),
]

/** what a target's text at `key` is a translation of, or undefined where it is its own source */
function sourcesOf(path) {
  const parts = path.split('/')
  if (parts[1] !== 'market') return (key) => source[key]
  // a pack's English, beside a pack in the market's own language: its own texts translate that one
  const own = readdirSync(join(DIR, 'market', parts[2]))
    .filter((f) => f.endsWith('.json') && f !== 'en.json')
    .map((f) => flat(read(join(DIR, 'market', parts[2], f))))
  const sibling = parts[3] === 'en.json' && own.length ? own[0] : {}
  return (key) => source[key] ?? sibling[key]
}

const store = existsSync(STORE) ? read(STORE) : {}
const stale = []
let tracked = 0

for (const path of targets) {
  const texts = flat(read(path))
  const of = sourcesOf(path)
  const recorded = store[path] ?? {}
  const acceptHere = accept && (named.length === 0 || named.includes(path))
  const next = {}
  for (const key of Object.keys(texts).sort()) {
    const from = of(key)
    if (from === undefined) continue
    const now = hash(from)
    if (acceptHere && (!only || only.has(key))) next[key] = now
    else if (recorded[key] !== undefined) next[key] = recorded[key]
    if (next[key] === undefined) stale.push({ path, key, why: 'translated from a source never recorded', from })
    else if (next[key] !== now) stale.push({ path, key, why: 'its bokmål changed since it was translated', from })
    else tracked += 1
  }
  store[path] = next
}

if (accept) {
  writeFileSync(STORE, `${JSON.stringify(Object.fromEntries(Object.entries(store).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`)
  console.log(`i18n-stale: recorded the source of ${named.length ? named.join(', ') : 'every translation'}${only ? ` (${only.size} keys)` : ''}`)
}

if (stale.length) {
  const byFile = Object.groupBy(stale, (s) => s.path)
  for (const [path, list] of Object.entries(byFile)) {
    console.error(`${path}: ${list.length} stale`)
    for (const s of list.slice(0, 20)) console.error(`  ${s.key}: ${s.why} — now «${s.from.slice(0, 90)}${s.from.length > 90 ? '…' : ''}»`)
    if (list.length > 20) console.error(`  … and ${list.length - 20} more`)
  }
  console.error(
    `i18n-stale: ${stale.length} translations behind their bokmål. Update them (docs/translations/<lang>.md), then record the source they now translate: node scripts/i18n/stale.mjs --accept <file> [--keys a,b]`,
  )
  if (!report && !accept) process.exit(1)
  if (accept && !report) process.exit(1)
} else console.log(`i18n-stale: ${tracked} translations current with their bokmål`)
