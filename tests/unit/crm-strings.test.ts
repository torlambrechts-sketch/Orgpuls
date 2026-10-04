import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTranslator, type AbstractIntlMessages, type Locale } from 'next-intl'
import { CONTACT_SOURCES } from '@/lib/admin/crm'

/**
 * The strings WP-0.8 moved out of the CRM's code into the messages (D-225): each in both catalogues the
 * admin reads, with the placeholders the pages fill, and a label for every contact source the schema
 * writes (`demo`, from 0146, had none).
 */
const DIR = join(__dirname, '..', '..', 'messages')
const catalogue = (locale: string) => JSON.parse(readFileSync(join(DIR, `${locale}.json`), 'utf8')) as AbstractIntlMessages
const translator = (locale: string, errors: string[]) =>
  createTranslator({ locale: locale as Locale, messages: catalogue(locale), namespace: 'admin' as never, onError: (e) => errors.push(e.message) })

describe('the strings that left the CRM’s code', () => {
  for (const locale of ['en', 'no']) {
    it(`holds each one with the placeholders the pages fill, in ${locale}`, () => {
      const errors: string[] = []
      const t = translator(locale, errors)
      const raw = (key: string) => t.raw(key as never) as string
      // filled by the pages with replace(): the placeholder must be there, once
      for (const [key, holes] of [
        ['crm.inbox.minutes', ['{n}']],
        ['crm.inbox.hours', ['{n}']],
        ['crm.report.points', ['{n}']],
        ['crm.campaign.abSubjects', ['{a}', '{b}']],
      ] as const)
        for (const hole of holes) expect(raw(key).split(hole).length - 1, `${key} ${hole}`).toBe(1)
      expect(raw('crm.campaign.notYours')).toBeTruthy()
      // formatted by next-intl: every count and value renders, and nothing is reported missing
      for (const count of [1, 7]) expect(t('crm.campaignsPage.lifeOn' as never, { count } as never)).toContain(String(count))
      expect(t('crm.campaignsPage.lifeOn' as never, { count: 0 } as never)).toBeTruthy()
      expect(t('crm.campaignsPage.lifeOff' as never)).toBeTruthy()
      expect(t('growth.g3.partners.kpi.shareValue' as never, { pct: 20 } as never)).toContain('20')
      expect(t('growth.g3.partners.kpi.shareRange' as never, { min: 10, max: 25 } as never)).toMatch(/10.*25/)
      for (const count of [0, 1, 3]) expect(t('growth.g3.partners.kpi.shareSub' as never, { count, total: 4 } as never)).toBeTruthy()
      expect(errors).toEqual([])
    })

    it(`names every contact source the schema writes, in ${locale}`, () => {
      const sources = ((catalogue(locale).admin as AbstractIntlMessages).crm as AbstractIntlMessages).source as Record<string, string>
      expect(CONTACT_SOURCES.filter((s) => !sources[s])).toEqual([])
    })
  }

  it('writes the English as the screens show it', () => {
    const errors: string[] = []
    const t = translator('en', errors)
    expect(t('crm.campaignsPage.lifeOn' as never, { count: 0 } as never)).toBe('On · none sent in 30 d')
    expect(t('crm.campaignsPage.lifeOn' as never, { count: 1 } as never)).toBe('On · 1 sent in 30 d')
    expect(t('growth.g3.partners.kpi.shareRange' as never, { min: 10, max: 25 } as never)).toBe('10–25 %')
    expect(t('growth.g3.partners.kpi.shareSub' as never, { count: 0, total: 4 } as never)).toBe('No partner has a share in per cent yet')
    expect(t('growth.g3.partners.kpi.shareSub' as never, { count: 1, total: 4 } as never)).toBe('1 of 4 partners has a share in per cent')
    expect(errors).toEqual([])
  })
})
