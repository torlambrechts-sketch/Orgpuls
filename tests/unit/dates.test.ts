import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dateFormat, intlLocale, isoDay } from '@/lib/i18n/dates'

/**
 * How the product writes a date (D-273): British English for English, every other language as its
 * own code says, on the organisation's clock. 22:30 UTC on 14 September 2026 is still the 14th in
 * London and already the 15th in Oslo, so the clock a screen uses shows in its words.
 */
const AT = new Date('2026-09-14T22:30:00Z')

describe('dates in the reader’s form, on the organisation’s clock (D-273)', () => {
  it('writes English the British way, and every other language as before', () => {
    expect(intlLocale('en')).toBe('en-GB')
    for (const l of ['no', 'sv', 'pl', 'uk', 'lt', 'da', 'de', 'nb']) expect(intlLocale(l)).toBe(l)
    expect(dateFormat({ locale: intlLocale('en'), timeZone: 'Europe/London' }, { dateStyle: 'long' }).format(AT)).toBe('14 September 2026')
    expect(dateFormat({ locale: intlLocale('en'), timeZone: 'Europe/London' }, { hour: '2-digit', minute: '2-digit' }).format(AT)).toBe('23:30')
  })

  it('keeps a Norwegian organisation’s dates exactly as they were', () => {
    const before = new Intl.DateTimeFormat('no', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'long' }).format(AT)
    expect(dateFormat({ locale: intlLocale('no'), timeZone: 'Europe/Oslo' }, { day: 'numeric', month: 'long' }).format(AT)).toBe(before)
  })

  it('counts today on the organisation’s clock', () => {
    expect(isoDay('Europe/London', AT)).toBe('2026-09-14')
    expect(isoDay('Europe/Oslo', AT)).toBe('2026-09-15')
  })

  it('leaves no screen on a clock or a form of its own', () => {
    // the clocks that are Norway's on purpose: the subscription's cancellation mirrors
    // cancel_subscription (0201), which counts in Oslo's calendar; the articles are Norway's; a
    // missing organisation zone falls back in the wizard as the database does; the market registry
    const allowed = new Set(['components/oppsett/BillingTab.tsx', 'components/marketing/ArticleView.tsx', 'lib/wizard/read.ts', 'lib/markets.ts'])
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) files.push(path)
      }
    }
    for (const dir of ['app', 'components', 'lib']) walk(dir)
    const oslo = files.filter((f) => !allowed.has(f) && readFileSync(f, 'utf8').includes("'Europe/Oslo'"))
    expect(oslo).toEqual([])
    // a formatter given the bare locale writes English the American way
    const bare = files.filter((f) => /new Intl\.DateTimeFormat\(locale\b|format\.dateTime\(/.test(readFileSync(f, 'utf8')))
    expect(bare).toEqual([])
  })
})
