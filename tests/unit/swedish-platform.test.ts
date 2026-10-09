import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { siteLangs, SITES } from '@/lib/hosts'
import { contentLang, fallbackOf, LOCALES } from '@/lib/i18n/locales'

/**
 * Swedish as a platform language (D-252): the app in Swedish where it is translated and in English
 * where it is not, with nothing changed for Norway — its site still offers bokmål and English only,
 * and content that exists in bokmål and English shows a Swede the English.
 */
describe('Swedish is a platform language with English behind it', () => {
  it('is in the registry, falling back to English', () => {
    expect(LOCALES).toContain('sv')
    expect(fallbackOf('sv')).toEqual(['en'])
    expect(fallbackOf('no')).toEqual([])
    expect(fallbackOf('en')).toEqual([])
  })

  it('has a catalogue whose every key is also bokmål’s', () => {
    expect(existsSync('messages/sv.json')).toBe(true)
    const flat = (o: Record<string, unknown>, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : flat(v as Record<string, unknown>, `${p}${k}.`)))
    const no = new Set(flat(JSON.parse(readFileSync('messages/no.json', 'utf8'))))
    const sv = flat(JSON.parse(readFileSync('messages/sv.json', 'utf8')))
    expect(sv.length).toBeGreaterThan(3000)
    expect(sv.filter((k) => !no.has(k))).toEqual([])
  })

  it('leaves the respondent’s, the invitation’s and the site’s texts to the registry and to English', () => {
    const sv = JSON.parse(readFileSync('messages/sv.json', 'utf8')) as Record<string, unknown>
    for (const ns of ['respond', 'mail', 'site', 'seo', 'dpa']) expect(sv[ns], ns).toBeUndefined()
  })

  it('holds no statement, question, option or label the registry owns (D-253)', () => {
    const sv = JSON.parse(readFileSync('messages/sv.json', 'utf8')) as Record<string, Record<string, Record<string, string>>>
    const owned = /^(label|text|s\d+|o\d+)$/
    for (const ns of ['factor', 'extra'])
      for (const [k, fields] of Object.entries(sv[ns] ?? {}))
        expect(Object.keys(fields).filter((f) => owned.test(f)), `${ns}.${k}`).toEqual([])
    // and the rest of each factor is in Swedish: its short name, description and abbreviations
    expect(Object.keys(sv.factor ?? {}).length).toBe(11)
  })
})

describe('Norway does not move', () => {
  it('its site and every host that is not a site offer bokmål and English only', () => {
    for (const s of SITES.filter((x) => x.market === 'no')) expect(s.langs).toEqual(['no', 'en'])
    expect(siteLangs('localhost:3000')).toEqual(['no', 'en'])
    expect(siteLangs('www.orgpuls.com')).toEqual(['no', 'en'])
  })

  it('content in bokmål and English is chosen as before, and English for Swedish', () => {
    expect(contentLang('no')).toBe('no')
    expect(contentLang('en')).toBe('en')
    expect(contentLang('sv')).toBe('en')
    expect(contentLang(undefined)).toBe('no')
  })
})
