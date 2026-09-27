import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'

/**
 * What the i18n gate knows about an ICU message, as plain functions (gap analysis, queue
 * item 2).
 *
 * scripts/verify/i18n.mjs runs these against every catalogue in messages/, and
 * tests/unit/plurals.test.ts runs the same code, so the gate and the tests cannot disagree
 * about what a correct message is. Nothing here imports the app: it is safe to load from a
 * node script and from a test.
 *
 * The parser is the one next-intl compiles with (intl-messageformat builds on it), with the
 * options next-intl uses: tags parsed, `other` required. A message that does not parse here
 * throws at render time there.
 */

/** Messages as next-intl reads them: a nested object whose leaves are strings. */
export type Catalogue = { [key: string]: string | Catalogue }

/** A catalogue as `a.b.c` → string, which is how the gate reports a key. */
export function flattenMessages(value: Catalogue, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(value)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flattenMessages(v, key, out)
    else out[key] = String(v)
  }
  return out
}

/**
 * The CLDR tag for a catalogue's file name. The source file is `no.json` (CLAUDE.md fixes
 * the code), but CLDR's plural data is keyed by `nb`; everything else is used as is.
 */
export function cldrTag(fileLocale: string): string {
  return fileLocale === 'no' ? 'nb' : fileLocale
}

/** Parse as next-intl will. Throws the parser's error, with its kind and offset. */
export function parseIcu(message: string): MessageFormatElement[] {
  return parse(message, { requiresOtherClause: true })
}

// ---------------------------------------------------------------------------------------
// Signature: which arguments a message takes, of which kind, and which rich-text tags
// ---------------------------------------------------------------------------------------

export type ArgKind = 'argument' | 'number' | 'date' | 'time' | 'plural' | 'select' | 'selectordinal'

export interface Signature {
  /** argument name → the kinds it is used as */
  args: Map<string, Set<ArgKind>>
  /** rich-text tag names, for t.rich */
  tags: Set<string>
}

function walk(els: MessageFormatElement[], visit: (el: MessageFormatElement) => void): void {
  for (const el of els) {
    visit(el)
    if (el.type === TYPE.plural || el.type === TYPE.select) {
      for (const opt of Object.values(el.options)) walk(opt.value, visit)
    } else if (el.type === TYPE.tag) {
      walk(el.children, visit)
    }
  }
}

export function signature(ast: MessageFormatElement[]): Signature {
  const args = new Map<string, Set<ArgKind>>()
  const tags = new Set<string>()
  const add = (name: string, kind: ArgKind) => {
    const kinds = args.get(name) ?? new Set<ArgKind>()
    kinds.add(kind)
    args.set(name, kinds)
  }
  walk(ast, (el) => {
    switch (el.type) {
      case TYPE.argument:
        return add(el.value, 'argument')
      case TYPE.number:
        return add(el.value, 'number')
      case TYPE.date:
        return add(el.value, 'date')
      case TYPE.time:
        return add(el.value, 'time')
      case TYPE.select:
        return add(el.value, 'select')
      case TYPE.plural:
        return add(el.value, el.pluralType === 'ordinal' ? 'selectordinal' : 'plural')
      case TYPE.tag:
        tags.add(el.value)
        return
    }
  })
  // `{n, plural, one {# dag} other {# dager}}` and `… other {{n} dager}}` take the same
  // argument: a bare use of a name that is also formatted is the same value printed again,
  // not a second kind. What must match across languages is how it is formatted.
  for (const kinds of args.values()) if (kinds.size > 1) kinds.delete('argument')
  return { args, tags }
}

const spell = (kinds: Set<ArgKind>) => [...kinds].sort().join('+')

/**
 * How a translation's signature differs from the source's, as readable lines; empty when
 * they agree. The source decides: a translation that drops `{total}` prints less, and one
 * that adds `{count}` prints the literal brace-wrapped name, since nobody passes it.
 */
export function signatureDiff(source: Signature, target: Signature): string[] {
  const out: string[] = []
  for (const [name, kinds] of source.args) {
    const theirs = target.args.get(name)
    if (!theirs) out.push(`missing {${name}}`)
    else if (spell(kinds) !== spell(theirs)) out.push(`{${name}} is ${spell(theirs)}, source has ${spell(kinds)}`)
  }
  for (const name of target.args.keys()) if (!source.args.has(name)) out.push(`unexpected {${name}}`)
  for (const tag of source.tags) if (!target.tags.has(tag)) out.push(`missing <${tag}>`)
  for (const tag of target.tags) if (!source.tags.has(tag)) out.push(`unexpected <${tag}>`)
  return out
}

// ---------------------------------------------------------------------------------------
// Plurals: every CLDR category of the language, in every plural
// ---------------------------------------------------------------------------------------

export type PluralType = 'cardinal' | 'ordinal'

/** The numbers a category is tested against: 0..200 and a spread of decimals. */
const SAMPLES: number[] = [
  ...Array.from({ length: 201 }, (_, i) => i),
  ...[0.1, 0.5, 1.1, 1.5, 2.1, 2.5, 10.1, 21.1, 100.5],
  1000,
  1000000,
]

const CLDR_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other']

export interface PluralRequirement {
  /** the categories CLDR defines for the language, `other` always among them */
  categories: string[]
  /**
   * Whether `=1` can stand in for `one`: only where `one` selects the number 1 and nothing
   * else. True for nb and English cardinals; false for English ordinals (1st, 21st, 31st)
   * and for Russian or Ukrainian (1, 21, 31, …), where `=1` would leave 21 in `other`.
   */
  exactOneIsOne: boolean
}

export function pluralRequirement(tag: string, type: PluralType): PluralRequirement {
  const rules = new Intl.PluralRules(tag, { type })
  // in CLDR's order, whatever order the engine lists them in; `other` always
  const listed = new Set<string>([...rules.resolvedOptions().pluralCategories, 'other'])
  const categories = CLDR_ORDER.filter((c) => listed.has(c))
  const ones = SAMPLES.filter((n) => rules.select(n) === 'one')
  return { categories, exactOneIsOne: ones.length === 1 && ones[0] === 1 }
}

/**
 * Plurals in a message that lack a category the language needs, as readable lines.
 * `other` is always required, whatever the language.
 */
export function pluralGaps(ast: MessageFormatElement[], tag: string): string[] {
  const out: string[] = []
  walk(ast, (el) => {
    if (el.type !== TYPE.plural) return
    const type: PluralType = el.pluralType === 'ordinal' ? 'ordinal' : 'cardinal'
    const { categories, exactOneIsOne } = pluralRequirement(tag, type)
    const has = new Set(Object.keys(el.options))
    const missing = categories.filter((c) => {
      if (has.has(c)) return false
      if (c === 'one' && exactOneIsOne && has.has('=1')) return false
      return true
    })
    if (missing.length) {
      const kind = type === 'ordinal' ? 'selectordinal' : 'plural'
      out.push(`{${el.value}, ${kind}} lacks ${missing.join(', ')} (${tag} needs ${categories.join(', ')})`)
    }
  })
  return out
}

// ---------------------------------------------------------------------------------------
// The text a message puts on the wire, without its placeholders
// ---------------------------------------------------------------------------------------

/**
 * Every literal a message can print, in every branch, with arguments, tags and `#` removed.
 * What the arguments hold is runtime data (an organisation's name) and is billed as it
 * comes; what is checked here is the text the catalogue itself contributes.
 */
export function literalText(ast: MessageFormatElement[]): string {
  let out = ''
  walk(ast, (el) => {
    if (el.type === TYPE.literal) out += el.value
  })
  return out
}
