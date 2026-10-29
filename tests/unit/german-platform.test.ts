import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { siteLangs, SITES } from '@/lib/hosts'
import { contentLang, fallbackOf, LOCALES, TRANSLATION_LOCALES } from '@/lib/i18n/locales'
import { MARKET_LANGS } from '@/lib/markets'

/**
 * German as a platform language (D-289), on the Swedish pattern (D-252): the app in German where it is
 * translated and in English where it is not. The German catalogue carries exactly what the Swedish one
 * carries — the chrome, the factor descriptions and the notes under the extra questions — and leaves the
 * respondent's, the invitation's and the site's texts to the registry (DE-A2) and the market pack (DE-F).
 */
const flat = (o: Record<string, unknown>, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : flat(v as Record<string, unknown>, `${p}${k}.`)))
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>

describe('German is a platform language with English behind it', () => {
  it('is in the registry, falling back to English, and since DE-A2 a survey language too (D-292)', () => {
    expect(LOCALES).toContain('de')
    expect(fallbackOf('de')).toEqual(['en'])
    expect(contentLang('de')).toBe('en')
    expect(TRANSLATION_LOCALES).toContain('de')
  })

  it('has a catalogue whose every key is also bokmål’s, and the same keys as Swedish', () => {
    const no = new Set(flat(read('messages/no.json')))
    const de = flat(read('messages/de.json'))
    const sv = new Set(flat(read('messages/sv.json')))
    expect(de.length).toBeGreaterThan(3000)
    expect(de.filter((k) => !no.has(k))).toEqual([])
    expect(de.filter((k) => !sv.has(k))).toEqual([])
    expect([...sv].filter((k) => !new Set(de).has(k))).toEqual([])
  })

  it('leaves the respondent’s, the invitation’s and the site’s texts to the registry and to English', () => {
    const de = read('messages/de.json')
    for (const ns of ['respond', 'mail', 'site', 'seo', 'dpa']) expect(de[ns], ns).toBeUndefined()
  })

  it('holds no statement, question, option or label the registry owns (D-253)', () => {
    const de = read('messages/de.json') as Record<string, Record<string, Record<string, string>>>
    const owned = /^(label|text|s\d+|o\d+)$/
    for (const ns of ['factor', 'extra'])
      for (const [k, fields] of Object.entries(de[ns] ?? {}))
        expect(Object.keys(fields).filter((f) => owned.test(f)), `${ns}.${k}`).toEqual([])
    expect(Object.keys(de.factor ?? {}).length).toBe(11)
  })

  it('uses German typography: „…“ for quotations and a spaced en dash, never the source’s « » or —', () => {
    const texts = Object.values(read('messages/de.json')).flatMap(function walk(v): string[] {
      return typeof v === 'string' ? [v] : Object.values(v as Record<string, unknown>).flatMap(walk)
    })
    expect(texts.filter((t) => /[«»]/.test(t))).toEqual([])
    expect(texts.filter((t) => /—/.test(t))).toEqual([])
  })
})

describe('the language chip has a label for every platform language', () => {
  it('oppsett.companySettings names each of them', () => {
    const no = read('messages/no.json') as { oppsett: { companySettings: Record<string, string> } }
    for (const code of LOCALES) {
      const key = `lang${code.charAt(0).toUpperCase()}${code.slice(1)}`
      expect(typeof no.oppsett.companySettings[key], key).toBe('string')
    }
  })

  it('a German organisation is offered German and English', () => {
    expect(MARKET_LANGS.de).toEqual(['de', 'en'])
  })
})

describe('Norway and Sweden do not move', () => {
  it('their sites offer their own languages only', () => {
    for (const s of SITES.filter((x) => x.market === 'no')) expect(s.langs).toEqual(['no', 'en'])
    expect(siteLangs('www.orgpuls.com')).toEqual(['no', 'en'])
    expect(MARKET_LANGS.se).toEqual(['sv', 'en'])
  })
})
