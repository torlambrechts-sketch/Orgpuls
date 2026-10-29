/**
 * Keeps each market pack (messages/market/<market>/<lang>.json) to what differs from its language
 * (docs/markets/PLAN.md rule 3, lib/i18n/merge.ts). A text the pack holds word for word as its
 * language's own file does is a copy, and a copy no longer follows the language: an edit to
 * messages/en.json never reached empvibe.com where the UK pack held the old sentence. So a copy is
 * left out, and the language's text shows through.
 *
 *   node scripts/i18n/pack-delta.mjs           report the copies, exit 1 if there are any (npm run verify:i18n)
 *   node scripts/i18n/pack-delta.mjs --write   leave them out of the packs
 *
 * A pack is compared with its language's own file only (en.json for an English pack, sv.json for a
 * Swedish one), never with the English the language falls back to: a Swedish pack's text that
 * happens to read as English does today («AFS 2023:2», a name) stays Swedish whatever English
 * becomes. In a list of its language's length, a copied item becomes null, which keeps the language's
 * item (lib/i18n/merge.ts); a list of another length is the market's own, whole.
 *
 * Never left out, copy or not: a text that states Norwegian law in messages/no.json, which a pack
 * repeats to say the words hold under its own law too (scripts/lib/law.mjs NORWEGIAN_LAW,
 * tests/unit/legal-pack.test.ts), so a later edit to Norway's law text does not reach the market
 * unread; and a document the pack holds whole (WHOLE_DOCUMENTS: the signed DPA, the privacy notice,
 * the terms).
 *
 * Refused, write or not: a null item in a list whose language's list has another length, or none.
 * There the item would have nothing to show.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { NORWEGIAN_LAW, WHOLE_DOCUMENTS } from '../lib/law.mjs'

const DIR = 'messages/market'
const write = process.argv.includes('--write')

const isTree = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const OMIT = Symbol('omit')

const NO = JSON.parse(readFileSync('messages/no.json', 'utf8'))
/** bokmål's text at a dotted path (list items by their index), as tests/unit/legal-pack.test.ts flattens it */
const bokmal = (path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), NO)
/** whether the pack holds this text whole: Norway's law restated, or a document of the market's own */
const kept = (path) =>
  WHOLE_DOCUMENTS.some((d) => path === d || path.startsWith(`${d}.`)) || (typeof bokmal(path) === 'string' && NORWEGIAN_LAW.test(bokmal(path)))

/** the pack's value with every copy of `base` left out, or OMIT where all of it is a copy */
function delta(value, base, path) {
  if (path && WHOLE_DOCUMENTS.some((d) => path === d || path.startsWith(`${d}.`))) return value
  if (typeof value === 'string') return kept(path) || value !== base ? value : OMIT
  if (isTree(value)) {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      const d = delta(v, isTree(base) ? base[k] : undefined, path ? `${path}.${k}` : k)
      if (d !== OMIT) out[k] = d
    }
    return Object.keys(out).length ? out : OMIT
  }
  if (Array.isArray(value) && Array.isArray(base) && value.length === base.length) {
    const items = value.map((v, i) => {
      const d = delta(v, base[i], `${path}.${i}`)
      return d === OMIT ? null : d
    })
    return items.every((v) => v === null) ? OMIT : items
  }
  return same(value, base) ? OMIT : value
}

/** the paths of null items whose list has nothing under them in the language */
function holes(value, base, path, out) {
  if (isTree(value)) for (const [k, v] of Object.entries(value)) holes(v, isTree(base) ? base[k] : undefined, `${path}.${k}`, out)
  else if (Array.isArray(value)) {
    const fits = Array.isArray(base) && base.length === value.length
    value.forEach((v, i) => {
      if (v === null && !fits) out.push(`${path}[${i}]`)
      else holes(v, fits ? base[i] : undefined, `${path}[${i}]`, out)
    })
  }
  return out
}

/** the number of texts a value holds */
const count = (v) => (typeof v === 'string' ? 1 : Array.isArray(v) ? v.reduce((n, x) => n + count(x), 0) : isTree(v) ? Object.values(v).reduce((n, x) => n + count(x), 0) : 0)

let copies = 0
const broken = []
for (const market of readdirSync(DIR).sort()) {
  for (const file of readdirSync(`${DIR}/${market}`).filter((f) => f.endsWith('.json')).sort()) {
    const path = `${DIR}/${market}/${file}`
    const raw = readFileSync(path, 'utf8')
    const pack = JSON.parse(raw)
    const lang = JSON.parse(readFileSync(`messages/${file}`, 'utf8'))
    const delta_ = delta(pack, lang, '')
    const out = delta_ === OMIT ? {} : delta_
    const left = count(pack) - count(out)
    broken.push(...holes(out, lang, path, []))
    if (left === 0) continue
    copies += left
    console.log(`${path}: ${left} of ${count(pack)} texts are copies of messages/${file}`)
    if (write) writeFileSync(path, `${JSON.stringify(out, null, 2)}${raw.endsWith('\n') ? '\n' : ''}`)
  }
}

if (broken.length) {
  console.error(`pack-delta: ${broken.length} null items with no item under them in their language:\n  ${broken.join('\n  ')}`)
  process.exit(1)
}
if (copies && !write) {
  console.error(`pack-delta: ${copies} copied texts in the market packs; run node scripts/i18n/pack-delta.mjs --write`)
  process.exit(1)
}
console.log(write && copies ? `pack-delta: ${copies} copies left out` : 'pack-delta: every pack holds only what differs')
