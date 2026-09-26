import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { LIFECYCLE_PATH, renderLifecycle, type LifecycleJob, type LifecycleStep, type MailCatalogue } from '@/supabase/functions/_shared/mail'

/** The trial's mail (0060, D-105): every step, both languages, filled and escaped. */
const cat = { no: no.mail, en: en.mail } as unknown as MailCatalogue
const APP = 'https://www.orgpuls.com'
const STEPS = Object.keys(LIFECYCLE_PATH) as LifecycleStep[]
const job = (step: LifecycleStep, lang: 'no' | 'en', org = 'Nordvik Anlegg AS'): LifecycleJob => ({
  id: 'x',
  step,
  to_email: 'dl@nordvik.no',
  name: 'Tuva',
  lang,
  org,
  k: 5,
  trial_ends_at: '2026-10-11T08:00:00Z',
  read_only_from: '2026-10-25T08:00:00Z',
})

describe('trial mail (D-105)', () => {
  for (const lang of ['no', 'en'] as const) {
    for (const step of STEPS) {
      it(`${lang} ${step}: every placeholder filled, one button to its page`, () => {
        const r = renderLifecycle(cat, job(step, lang), APP)
        expect(r.subject).not.toMatch(/[{}]/)
        expect(r.text).not.toMatch(/[{}]/)
        expect(r.html).toContain(`href="${APP}${LIFECYCLE_PATH[step]}"`)
        expect(r.text).toContain('Nordvik Anlegg AS')
        expect((r.html.match(/<a /g) ?? []).length).toBe(1)
        if (process.env.MAIL_PREVIEW) {
          mkdirSync(process.env.MAIL_PREVIEW, { recursive: true })
          writeFileSync(`${process.env.MAIL_PREVIEW}/${lang}-${step}.html`, r.html)
        }
      })
    }
  }

  it('the dates are the trial end, then the read-only date', () => {
    expect(renderLifecycle(cat, job('trial_ending', 'no'), APP).subject).toBe('Prøveperioden slutter 11. oktober')
    expect(renderLifecycle(cat, job('read_only_soon', 'en'), APP).subject).toBe('From 25 October you can only read')
  })

  it('an organisation name is escaped in markup', () => {
    const r = renderLifecycle(cat, job('welcome', 'no', '<b>Evil</b> AS'), APP)
    expect(r.html).not.toContain('<b>Evil</b>')
    expect(r.html).toContain('&lt;b&gt;Evil&lt;/b&gt; AS')
  })
})
