import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTranslator, type AbstractIntlMessages, type Locale } from 'next-intl'
import {
  cldrTag,
  flattenMessages,
  parseIcu,
  pluralGaps,
  pluralRequirement,
  signature,
  signatureDiff,
  type Catalogue,
} from '@/lib/i18n/icu-rules'

/**
 * Plurals, per CLDR, in every catalogue (gap analysis, queue item 2). The rules are the ones
 * scripts/verify/i18n.mjs applies; this runs them from the test suite as well, proves the
 * rules themselves on languages we do not ship yet, and renders every plural message
 * through next-intl for the counts where languages disagree.
 */

const DIR = join(__dirname, '..', '..', 'messages')
const catalogues = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Catalogue]),
)
const locales = Object.keys(catalogues)

describe('the CLDR rules the gate applies', () => {
  it('maps the source file to nb, and leaves every other code alone', () => {
    expect(cldrTag('no')).toBe('nb')
    expect(cldrTag('en')).toBe('en')
    expect(cldrTag('pl')).toBe('pl')
  })

  it('knows each language’s cardinal categories', () => {
    expect(pluralRequirement('nb', 'cardinal').categories.sort()).toEqual(['one', 'other'])
    expect(pluralRequirement('en', 'cardinal').categories.sort()).toEqual(['one', 'other'])
    expect(pluralRequirement('pl', 'cardinal').categories.sort()).toEqual(['few', 'many', 'one', 'other'])
    expect(pluralRequirement('lt', 'cardinal').categories.sort()).toEqual(['few', 'many', 'one', 'other'])
    expect(pluralRequirement('uk', 'cardinal').categories.sort()).toEqual(['few', 'many', 'one', 'other'])
  })

  it('lets =1 stand for one only where one is the number 1 and nothing else', () => {
    expect(pluralRequirement('nb', 'cardinal').exactOneIsOne).toBe(true)
    expect(pluralRequirement('en', 'cardinal').exactOneIsOne).toBe(true)
    expect(pluralRequirement('pl', 'cardinal').exactOneIsOne).toBe(true)
    // 21 is `one` in Lithuanian and Ukrainian, and 1st, 21st in English ordinals
    expect(pluralRequirement('lt', 'cardinal').exactOneIsOne).toBe(false)
    expect(pluralRequirement('uk', 'cardinal').exactOneIsOne).toBe(false)
    expect(pluralRequirement('en', 'ordinal').exactOneIsOne).toBe(false)
  })

  it('finds the categories a plural lacks', () => {
    const polish = parseIcu('{n, plural, one {# plik} other {# pliki}}')
    expect(pluralGaps(polish, 'pl')).toEqual([expect.stringContaining('lacks few, many')])
    expect(pluralGaps(parseIcu('{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}'), 'pl')).toEqual([])
    expect(pluralGaps(parseIcu('{n, plural, =1 {ett svar} other {# svar}}'), 'nb')).toEqual([])
    expect(pluralGaps(parseIcu('{n, plural, =1 {# файл} few {# файли} many {# файлів} other {# файлу}}'), 'uk')).toEqual([
      expect.stringContaining('lacks one'),
    ])
    expect(pluralGaps(parseIcu('{n, selectordinal, one {#st} other {#th}}'), 'en')).toEqual([expect.stringContaining('lacks two, few')])
  })

  it('finds a plural nested in a select or a tag', () => {
    const nested = parseIcu('{who, select, me {<b>{n, plural, one {# plik} other {# pliki}}</b>} other {x}}')
    expect(pluralGaps(nested, 'pl')).toHaveLength(1)
  })

  it('compares arguments by name and kind, and tags by name', () => {
    const sig = (s: string) => signature(parseIcu(s))
    expect(signatureDiff(sig('{a} av {b}'), sig('{a} of {b}'))).toEqual([])
    expect(signatureDiff(sig('{a} av {b}'), sig('{c} of {b}'))).toEqual(['missing {a}', 'unexpected {c}'])
    expect(signatureDiff(sig('{n, plural, one {# dag} other {# dager}}'), sig('{n} days'))).toEqual([
      '{n} is argument, source has plural',
    ])
    // `#` and `{n}` in a branch are the same argument printed
    expect(signatureDiff(sig('{n, plural, one {# dag} other {# dager}}'), sig('{n, plural, one {one day} other {{n} days}}'))).toEqual([])
    expect(signatureDiff(sig('Les <link>mer</link>'), sig('Read <a>more</a>'))).toEqual(['missing <link>', 'unexpected <a>'])
    expect(signatureDiff(sig('{d, date, short}'), sig('{d, time, short}'))).toEqual(['{d} is time, source has date'])
  })

  it('refuses what next-intl cannot compile', () => {
    expect(() => parseIcu('{count, plural, one {# spørsmål}')).toThrow()
    expect(() => parseIcu('{count, plural, one {# spørsmål}}')).toThrow() // no `other`
    expect(() => parseIcu('<b>open')).toThrow()
  })
})

describe.each(locales)('messages/%s.json', (locale) => {
  const flat = flattenMessages(catalogues[locale]!)
  const withPlurals = Object.entries(flat)
    .map(([key, text]) => ({ key, text, tree: parseIcu(text) }))
    .filter(({ tree }) => JSON.stringify(tree).includes('"pluralType"'))

  it('has plurals to check', () => {
    expect(withPlurals.length).toBeGreaterThan(50)
  })

  it(`covers every ${cldrTag(locale)} plural category in every plural`, () => {
    const gaps = withPlurals.flatMap(({ key, tree }) => pluralGaps(tree, cldrTag(locale)).map((g) => `${key}: ${g}`))
    expect(gaps).toEqual([])
  })

  it('renders every plural message through next-intl for 0, 1, 2, 5 and 21', () => {
    const errors: string[] = []
    const t = createTranslator({
      locale: locale as Locale, // every file in messages/, a registered locale or not
      messages: catalogues[locale] as AbstractIntlMessages,
      timeZone: 'Europe/Oslo',
      onError: (e) => errors.push(e.message),
    })
    const when = new Date('2026-09-27T10:00:00Z')
    let rendered = 0
    for (const { key, tree } of withPlurals) {
      const { args, tags } = signature(tree)
      for (const n of [0, 1, 2, 5, 21]) {
        const values: Record<string, string | number | Date | ((chunks: string) => string)> = {}
        for (const [name, kinds] of args) {
          values[name] = kinds.has('plural') || kinds.has('selectordinal') || kinds.has('number') ? n : kinds.has('date') || kinds.has('time') ? when : 'x'
        }
        for (const tag of tags) values[tag] = (chunks: string) => chunks
        const out = tags.size ? t.markup(key as never, values as never) : t(key as never, values as never)
        expect(typeof out, key).toBe('string')
        expect(out, key).not.toBe(key)
        if (n === 5) expect(out, key).not.toMatch(/\{[a-zA-Z]+\}/)
        rendered += 1
      }
    }
    expect(errors).toEqual([])
    expect(rendered).toBe(withPlurals.length * 5)
  })
})

describe('what a count reads as', () => {
  const t = (locale: string) => createTranslator({ locale: locale as Locale, messages: catalogues[locale] as AbstractIntlMessages })
  it('says one question in English and the right count in Norwegian', () => {
    expect(t('en')('malinger.questionCount' as never, { count: 1 } as never)).toBe('1 question')
    expect(t('en')('malinger.questionCount' as never, { count: 21 } as never)).toBe('21 questions')
    expect(t('no')('rapport.runScope' as never, { questions: 1, factors: 1 } as never)).toBe('1 spørsmål · 1 faktor')
    expect(t('no')('rapport.runScope' as never, { questions: 21, factors: 5 } as never)).toBe('21 spørsmål · 5 faktorer')
  })
})
