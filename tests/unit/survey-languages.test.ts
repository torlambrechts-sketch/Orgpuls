import { describe, expect, it } from 'vitest'
import no from '@/messages/no.json'
import source from '@/lib/i18n/survey-source.json'
import { offeredLocales, surveyMessages } from '@/lib/i18n/offered'
import { complete, nest, uiPlace, type Approved } from '@/supabase/functions/_shared/survey-texts'
import { offeredFor, renderNotice, type MailCatalogue, type NoticeJob } from '@/supabase/functions/_shared/mail'

/**
 * A survey-only language (D-133): offered on the page, and its invitation sent, exactly when every
 * page string (and mail text) is approved from the current bokmål — and then rendered from them.
 */
const all = (src: Record<string, string>, text: (path: string) => string): Approved =>
  Object.fromEntries(Object.keys(src).map((p) => [p, { t: text(p), h: src[p]! }]))
const ui = all(source.ui, (p) => `УК ${p}`)
const ready = { en: { missing: 0, ui: [] }, uk: { missing: 0, ui: [], pilot: true } }

describe('the survey page in a survey-only language', () => {
  it('is offered only with every page string approved from the current source, and items complete', () => {
    expect(offeredLocales(ready, { uk: ui })).toContain('uk')
    const [first] = Object.keys(source.ui)
    const stale = { ...ui, [first!]: { t: 'УК', h: 'a'.repeat(64) } }
    expect(offeredLocales(ready, { uk: stale })).not.toContain('uk')
    const { [first!]: _gone, ...short } = ui
    expect(offeredLocales(ready, { uk: short })).not.toContain('uk')
    expect(offeredLocales({ ...ready, uk: { missing: 1, ui: [], pilot: true } }, { uk: ui })).not.toContain('uk')
  })

  it('lays the approved strings over bokmål, labels back under .label', () => {
    const m = surveyMessages(no, ui) as { respond: Record<string, unknown>; factor: Record<string, { label: string; s1?: string }> }
    expect(m.respond.next).toBe('УК respond.next')
    expect(m.factor.ytring!.label).toBe('УК factor.ytring')
    // the statements are items, not page strings: they stay bokmål here and come from the texts
    expect(m.factor.ytring!.s1).toBe((no.factor as Record<string, { s1: string }>).ytring!.s1)
    expect(uiPlace('extra.enps')).toBe('extra.enps.label')
    expect(uiPlace('respond.scale.o1')).toBe('respond.scale.o1')
  })
})

describe('the invitation in a survey-only language', () => {
  const mail = all(source.mail, (p) => (p === 'invitasjon.subject' ? '{org}: опитування {round}' : p === 'invitasjon.deadline' ? 'Термін: {date}.' : p.startsWith('round.') ? '{year}' : `УК ${p}`))
  const cat = { no: no.mail, en: no.mail, uk: nest(source.mail, mail) } as unknown as MailCatalogue
  const job = {
    id: 'j', kind: 'invitasjon', audience: null, channel: 'email', sms_text: null, lang: 'no', org: 'Lumio AS', k: 5,
    round: { kind: 'grunnlinje', year: 2026, pulse: null, opens_at: null, closes_at: '2026-10-05T07:00:00Z' },
    recipients: [{ email: 'o@lumio.no', phone: null, name: 'Olena', lang: 'uk', member: false }],
    token: 'k3Xw9QpL2vRt7YbN4mZc8A',
    locales: { uk: { missing: 0, ui: [], pilot: true } },
  } as unknown as NoticeJob

  it('goes out in it only with its page strings ready too, and reads its approved texts', () => {
    expect(complete(source.mail, mail)).toBe(true)
    const offer = { flags: new Set<string>(), hashes: {} }
    expect(offeredFor(cat, job, offer)).toEqual(['no'])
    expect(offeredFor(cat, job, { ...offer, uiReady: { uk: true } })).toEqual(['no', 'uk'])
    const r = renderNotice(cat, job, { lang: 'uk', member: false, name: 'Olena' }, 'https://www.orgpuls.com')
    expect(r.subject).toBe('Lumio AS: опитування 2026')
    expect(r.text).toContain('жовтня')
  })
})
