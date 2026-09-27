import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import hashes from '@/lib/i18n/respondent-ui.json'
import {
  groupsOf,
  offeredFor,
  personalLang,
  personalLink,
  renderNotice,
  smsLead,
  type LanguageOffer,
  type MailCatalogue,
  type NoticeJob,
} from '@/supabase/functions/_shared/mail'
import { smsContent, smsLength } from '@/supabase/functions/_shared/sms'

/**
 * Engagement P1.3 (D-127): a personal message in the employee's language where the survey is
 * offered in it, else bokmål; with no language flag, the organisation's language as before.
 * And § 2.3: the SMS stays within its segment budget in every language it can be sent in.
 */
const cat = { no: no.mail, en: en.mail } as unknown as MailCatalogue
const APP = 'https://www.orgpuls.com'
const TOKEN = 'a'.repeat(64)
const ready = { en: { missing: 0, ui: [hashes.en] }, pl: { missing: 30, ui: [] }, lt: { missing: 33, ui: [] } }
const job = (over: Partial<NoticeJob> = {}): NoticeJob => ({
  id: 'j',
  kind: 'invitasjon',
  audience: null,
  channel: 'email',
  sms_text: null,
  lang: 'no',
  org: 'Lumio AS',
  k: 5,
  round: { kind: 'grunnlinje', year: 2026, pulse: null, opens_at: null, closes_at: '2026-10-05T07:00:00Z' },
  recipients: [{ email: 'eva@lumio.no', phone: '+4790000000', name: 'Eva', lang: 'en', member: false }],
  token: TOKEN,
  locales: ready,
  ...over,
})
const all: LanguageOffer = { flags: '*', hashes }

describe('the language of a personal message', () => {
  it('is the employee’s own where the survey is offered in it, and the link opens it there', () => {
    const offered = offeredFor(cat, job(), all)
    expect(offered).toEqual(['no', 'en'])
    const g = groupsOf(job(), offered)[0]!
    expect(g.lang).toBe('en')
    const r = renderNotice(cat, job(), g, APP)
    expect(r.subject).toMatch(/Lumio AS/)
    expect(r.text).toContain(`${APP}/s/${TOKEN}?lang=en`)
    expect(r.text).toContain(en.mail.invitasjon.cta)
  })

  it('is bokmål when the employee’s language is not offered — Polish is incomplete', () => {
    const j = job({ recipients: [{ email: 'p@lumio.no', phone: null, name: 'Piotr', lang: 'pl', member: false }] })
    const offered = offeredFor(cat, j, all)
    expect(personalLang(j, j.recipients[0]!, offered)).toBe('no')
    expect(personalLink(APP, TOKEN, 'no', offered)).toBe(`${APP}/s/${TOKEN}`)
  })

  it('is bokmål when a string on the respondent pages changed since the approval', () => {
    const stale = job({ locales: { ...ready, en: { missing: 0, ui: ['0'.repeat(64)] } } })
    expect(offeredFor(cat, stale, all)).toEqual(['no'])
  })

  it('is the organisation’s, exactly as before, with no language flag on', () => {
    const j = job({ lang: 'en' })
    expect(offeredFor(cat, j, null)).toBeNull()
    expect(offeredFor(cat, j, { flags: new Set(['engagement_thanks']), hashes })).toBeNull()
    const g = groupsOf(j, null)[0]!
    expect(g.lang).toBe('en')
    expect(renderNotice(cat, j, g, APP).text).toContain(`${APP}/s/${TOKEN}`)
    expect(renderNotice(cat, j, g, APP).text).not.toContain('?lang=')
  })
})

describe('SMS segments per language (§ 2.3)', () => {
  // an invitation, both reminders and the asked-for link, each with a 64-character token link
  const kinds = ['invitasjon', 'paminnelse', 'siste_paminnelse', 'lenke'] as const
  for (const lang of ['no', 'en'] as const) {
    for (const kind of kinds) {
      it(`${lang} ${kind}: the link is whole and the message fits in two segments`, () => {
        const offered: ('no' | 'en')[] = ['no', 'en']
        const link = personalLink(APP, TOKEN, lang, offered)
        const content = smsContent(smsLead(cat, job({ kind }), lang), link)
        expect(content.endsWith(link)).toBe(true)
        expect(smsLength(content).parts).toBeLessThanOrEqual(2)
      })
    }
  }
})
