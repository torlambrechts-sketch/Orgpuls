import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import hashes from '@/lib/i18n/respondent-ui.json'
import {
  groupsOf,
  MARKET_SURVEY_BASE,
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
import { chooseLocale, offeredLocales, surveyBaseOf } from '@/lib/i18n/offered'
import { MARKETS } from '@/lib/markets'

/**
 * Engagement P1.3 (D-127): a personal message in the employee's language where the survey is
 * offered in it, else bokmål; with no language flag, the organisation's language as before.
 * And § 2.3: the SMS stays within its segment budget in every language it can be sent in.
 */
const cat = { no: no.mail, en: en.mail } as unknown as MailCatalogue
const APP = 'https://www.orgpuls.com'
// the shape of a real link since 0078 (D-128): 22 characters of base64url
const TOKEN = 'k3Xw9QpL2vRt7YbN4mZc8A'
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
  it('is the employee’s own where the survey is offered in it; the link is the plain one', () => {
    const offered = offeredFor(cat, job(), all)
    expect(offered).toEqual(['no', 'en'])
    const g = groupsOf(job(), offered)[0]!
    expect(g.lang).toBe('en')
    const r = renderNotice(cat, job(), g, APP)
    expect(r.subject).toMatch(/Lumio AS/)
    // the page opens in the employee's own language by the same rule, so the link needs no ?lang=
    expect(r.text).toContain(`${APP}/s/${TOKEN}`)
    expect(r.text).not.toContain('?lang=')
    expect(r.text).toContain(en.mail.invitasjon.cta)
  })

  it('is bokmål when the employee’s language is not offered — Polish is incomplete', () => {
    const j = job({ recipients: [{ email: 'p@lumio.no', phone: null, name: 'Piotr', lang: 'pl', member: false }] })
    const offered = offeredFor(cat, j, all)
    expect(personalLang(j, j.recipients[0]!, offered)).toBe('no')
    expect(personalLink(APP, TOKEN)).toBe(`${APP}/s/${TOKEN}`)
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

describe('the organisation’s language comes before bokmål (D-127 addendum)', () => {
  const noOwn = (lang: string) => job({ lang, recipients: [{ email: 'x@lumio.no', phone: null, name: 'X', lang: null, member: false }] })

  it('keeps an English organisation’s employee with no language of their own in English', () => {
    const j = noOwn('en')
    const offered = offeredFor(cat, j, all)
    expect(offered).toEqual(['no', 'en'])
    expect(personalLang(j, j.recipients[0]!, offered)).toBe('en')
  })

  it('is bokmål for that employee when English is not offered for the survey', () => {
    const j = { ...noOwn('en'), locales: { ...ready, en: { missing: 3, ui: [hashes.en] } } }
    const offered = offeredFor(cat, j, all)
    expect(offered).toEqual(['no'])
    expect(personalLang(j, j.recipients[0]!, offered)).toBe('no')
  })

  it('puts the employee’s own language before the organisation’s', () => {
    const j = job({ lang: 'en', recipients: [{ email: 'x@lumio.no', phone: null, name: 'X', lang: 'no', member: false }] })
    expect(personalLang(j, j.recipients[0]!, offeredFor(cat, j, all))).toBe('no')
  })

  it('offers a language the organisation pilots (0085) without its flag, and only once it is complete', () => {
    const none: LanguageOffer = { flags: new Set(), hashes }
    // the English state, piloted, with no flag at all
    expect(offeredFor(cat, job({ locales: { ...ready, en: { ...ready.en, pilot: true } } }), none)).toEqual(['no', 'en'])
    // nothing piloted and nothing flagged: the organisation's language, as before
    expect(offeredFor(cat, job(), none)).toBeNull()
    // a pilot cannot offer what is incomplete
    expect(offeredFor(cat, job({ locales: { ...ready, en: { missing: 2, ui: [hashes.en], pilot: true } } }), none)).toEqual(['no'])
    // nor a language without mail texts (this catalogue has bokmål and English only)
    expect(offeredFor(cat, job({ locales: { ...ready, pl: { missing: 0, ui: [], pilot: true } } }), none)).toBeNull()
    // the survey page's rule is the same (English is signed off, so it is offered either way)
    expect(offeredLocales({ ...ready, lt: { ...ready.lt, pilot: true } })).toEqual(['no', 'en'])
  })

  it('opens the survey page in the same order: asked, own, organisation, bokmål', () => {
    expect(chooseLocale(['no', 'en'], undefined, null, 'en')).toBe('en')
    expect(chooseLocale(['no', 'en'], undefined, 'no', 'en')).toBe('no')
    expect(chooseLocale(['no', 'en'], 'no', 'en', 'en')).toBe('no')
    expect(chooseLocale(['no'], undefined, null, 'en')).toBe('no')
    expect(chooseLocale(['no', 'en'], undefined, 'pl', null)).toBe('no')
  })
})

describe('the survey’s own language is its market’s (D-280)', () => {
  it('is the same on the survey page and in the dispatcher', () => {
    for (const m of MARKETS) expect(MARKET_SURVEY_BASE[m], m).toBe(surveyBaseOf(m))
    expect(surveyBaseOf('no')).toBe('no')
    expect(surveyBaseOf('gb')).toBe('en')
    expect(surveyBaseOf('se')).toBe('sv')
    // German is not a survey language yet, so a German organisation's survey opens in English, the
    // next of its market's languages the survey has (D-289); DE-A2 makes it German with no change here
    expect(surveyBaseOf('de')).toBe('en')
  })

  it('offers no bokmål in a British survey once English is offered, and English first', () => {
    expect(offeredLocales(ready, {}, 'en')).toEqual(['en'])
    expect(offeredFor(cat, job({ market: 'gb', lang: 'en' }), all)).toEqual(['en'])
    // where the market's language is not offered, bokmål stays the survey's language, as before
    expect(offeredLocales(ready, {}, 'sv')).toEqual(['no', 'en'])
    expect(offeredFor(cat, job({ market: 'se', lang: 'sv' }), all)).toEqual(['no', 'en'])
    // Norway's survey is unchanged
    expect(offeredLocales(ready, {}, 'no')).toEqual(['no', 'en'])
    expect(offeredFor(cat, job({ market: 'no' }), all)).toEqual(['no', 'en'])
  })

  it('falls back to the survey’s own language, never to bokmål it does not offer', () => {
    // an employee marked Norwegian in a British organisation reads English, on the page and in the mail
    expect(chooseLocale(['en'], undefined, 'no', 'en')).toBe('en')
    expect(chooseLocale(['en', 'pl'], undefined, 'lt', null)).toBe('en')
    const j = job({ market: 'gb', lang: 'en', recipients: [{ email: 'x@firm.co.uk', phone: null, name: 'X', lang: 'no', member: false }] })
    expect(personalLang(j, j.recipients[0]!, offeredFor(cat, j, all))).toBe('en')
  })
})

describe('SMS segments per language (§ 2.3)', () => {
  // an invitation, both reminders and the asked-for link, from a 34-character organisation name
  // with the longest deadline date: one segment in each language (D-128)
  const kinds = ['invitasjon', 'paminnelse', 'siste_paminnelse', 'lenke'] as const
  const long = job({ org: 'Nordvik Bygg og Anlegg Entreprenør', round: { kind: 'grunnlinje', year: 2026, pulse: null, opens_at: null, closes_at: '2026-09-30T07:00:00Z' } })
  for (const lang of ['no', 'en'] as const) {
    for (const kind of kinds) {
      it(`${lang} ${kind}: the link is whole and the message is one segment`, () => {
        expect(long.org).toHaveLength(34)
        const link = personalLink(APP, TOKEN)
        const content = smsContent(smsLead(cat, { ...long, kind }, lang), link)
        expect(content.endsWith(link)).toBe(true)
        expect(smsLength(content).parts).toBe(1)
      })
    }
  }
})
