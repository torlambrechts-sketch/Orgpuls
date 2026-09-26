import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import {
  AUTH_ACTIONS,
  authLink,
  groupsOf,
  isReservedAddress,
  renderAuth,
  renderCampaign,
  renderNotice,
  renderOptin,
  roundName,
  withUtm,
  smsLead,
  type CrmJob,
  type MailCatalogue,
  type NoticeJob,
} from '@/supabase/functions/_shared/mail'

/**
 * The module the edge functions send with, against the message files they are built from.
 * What a mail may carry is the security property here: a respondent link only in that
 * respondent's own mail, an app link only for someone who can sign in, and nothing from
 * the database placed in markup unescaped.
 */
const cat = { no: no.mail, en: en.mail } as unknown as MailCatalogue
const APP = 'https://www.orgpuls.com'
const TOKEN = 'a'.repeat(64)

const job = (over: Partial<NoticeJob> = {}): NoticeJob => ({
  id: 'x',
  kind: 'invitasjon',
  audience: null,
  channel: 'email',
  sms_text: null,
  lang: 'no',
  org: 'Nordvik Anlegg AS',
  k: 5,
  round: { kind: 'grunnlinje', year: 2026, pulse: null, opens_at: '2026-10-06T07:00:00Z', closes_at: '2026-10-13T07:00:00Z' },
  recipients: [{ email: 'ola@firma.no', phone: null, name: 'Ola', lang: null, member: false }],
  token: TOKEN,
  ...over,
})

describe('notices', () => {
  it('puts the respondent link in the invitation, with the deadline and the threshold', () => {
    const r = renderNotice(cat, job(), { lang: 'no', member: false, name: 'Ola' }, APP)
    expect(r.subject).toBe('Nordvik Anlegg AS: svar på grunnlinjen 2026')
    expect(r.text).toContain(`${APP}/s/${TOKEN}`)
    expect(r.html).toContain(`${APP}/s/${TOKEN}`)
    expect(r.text).toContain('Hei Ola,')
    expect(r.text).toContain('minst 5 har svart')
    expect(r.text).toContain('Svarfrist: 13. oktober.')
  })

  it('writes a token-bearing link as text, never as a link a provider would rewrite (D-97)', () => {
    for (const kind of ['invitasjon', 'paminnelse'] as const) {
      const r = renderNotice(cat, job({ kind }), { lang: 'no', member: false, name: 'Ola' }, APP)
      expect(r.html).toContain(`${APP}/s/${TOKEN}`)
      expect(r.html).not.toContain('href=')
    }
  })

  it('tells a reminder that the earlier link no longer works', () => {
    const r = renderNotice(cat, job({ kind: 'paminnelse' }), { lang: 'no', member: false, name: 'Ola' }, APP)
    expect(r.subject).toBe('Påminnelse: grunnlinjen 2026 i Nordvik Anlegg AS')
    expect(r.text).toContain('Lenken i den forrige virker ikke lenger.')
  })

  it('refuses an invitation without a link rather than sending one that cannot be used', () => {
    expect(() => renderNotice(cat, job({ token: null }), { lang: 'no', member: false, name: null }, APP)).toThrow()
  })

  it('gives a result notice an app link only for someone who can sign in', () => {
    const r = job({ kind: 'resultat', audience: 'daglig_leder', token: null })
    const member = renderNotice(cat, r, { lang: 'no', member: true, name: null }, APP)
    const employee = renderNotice(cat, r, { lang: 'no', member: false, name: null }, APP)
    expect(member.text).toContain(`${APP}/resultat`)
    expect(employee.text).not.toContain(APP)
    expect(employee.html).not.toContain('href=')
    expect(member.subject).toBe('Resultatet fra grunnlinjen 2026 er klart')
  })

  it('never carries a respondent link in a notice to a role', () => {
    for (const kind of ['forvarsel', 'resultat'] as const) {
      const r = renderNotice(cat, job({ kind, audience: 'verneombud', token: null }), { lang: 'no', member: true, name: null }, APP)
      expect(r.text).not.toContain('/s/')
    }
  })

  it('escapes what came from the database before it goes into markup', () => {
    const r = renderNotice(cat, job({ org: 'A & B <AS>' }), { lang: 'no', member: false, name: '<script>x</script>' }, APP)
    expect(r.html).not.toContain('<script>')
    expect(r.html).toContain('&lt;script&gt;')
    expect(r.html).toContain('A &amp; B &lt;AS&gt;')
  })

  it('renders every kind and audience in both languages', () => {
    const audiences = ['verneombud', 'tillitsvalgte', 'daglig_leder', 'avdelingsledere', 'alle_ansatte']
    for (const lang of ['no', 'en'] as const) {
      for (const audience of audiences) {
        for (const kind of ['forvarsel', 'resultat'] as const) {
          const r = renderNotice(cat, job({ kind, audience, token: null }), { lang, member: audience !== 'alle_ansatte', name: null }, APP)
          expect(r.subject.length).toBeGreaterThan(5)
          expect(r.text).not.toMatch(/\{\w+\}/)
        }
      }
      for (const kind of ['invitasjon', 'paminnelse'] as const) {
        const r = renderNotice(cat, job({ kind }), { lang, member: false, name: 'Kari' }, APP)
        expect(r.text).not.toMatch(/\{\w+\}/)
      }
    }
  })

  it('names a puls by its number within the year', () => {
    expect(roundName(no.mail, { kind: 'puls', year: 2027, pulse: 2, opens_at: null, closes_at: null })).toBe('puls 2 · 2027')
    expect(roundName(en.mail, { kind: 'grunnlinje', year: 2026, pulse: null, opens_at: null, closes_at: null })).toBe('the 2026 baseline')
  })
})

describe('sms', () => {
  it('uses the organisation\'s own text for an invitation, and the default without one', () => {
    expect(smsLead(cat, job({ channel: 'sms', sms_text: 'Svar på målingen:' }), 'no')).toBe('Svar på målingen:')
    expect(smsLead(cat, job({ channel: 'sms' }), 'no')).toBe('Hei! Nordvik Anlegg AS spør hvordan du har det på jobb. Svaret er helt anonymt:')
  })

  it('tells a reminder that the earlier link is dead, whatever the organisation wrote', () => {
    const lead = smsLead(cat, job({ kind: 'paminnelse', channel: 'sms', sms_text: 'Egen tekst:' }), 'no')
    expect(lead).toContain('Lenken i forrige melding virker ikke lenger.')
    expect(lead).toContain('13. oktober')
  })
})

describe('grouping', () => {
  it('sends each invitation to one person, and a role notice once per language and kind of reader', () => {
    const two = [
      { email: 'a@firma.no', phone: null, name: 'A', lang: null, member: false },
      { email: 'b@firma.no', phone: null, name: 'B', lang: null, member: false },
    ]
    expect(groupsOf(job({ recipients: two }))).toHaveLength(2)
    const roles = groupsOf(
      job({
        kind: 'resultat',
        token: null,
        recipients: [...two, { email: 'c@firma.no', phone: null, name: 'C', lang: 'en', member: true }],
      }),
    )
    expect(roles).toHaveLength(2)
    expect(roles.find((g) => !g.member)?.to).toHaveLength(2)
    expect(roles.every((g) => g.name === null)).toBe(true)
  })
})

describe('auth mails', () => {
  it('never mails a reserved test domain, by the same rule as the database', () => {
    for (const a of ['dev.orgpuls@nordvik.example', 'x@kunde.test', 'x@example.com', '', null]) expect(isReservedAddress(a)).toBe(true)
    for (const a of ['ola@firma.no', 'x@orgpuls.com', 'x@example.no']) expect(isReservedAddress(a)).toBe(false)
  })

  it('links a reset to the confirm route and on to the new-password page', () => {
    const link = authLink(APP, 'recovery', 'pkce_abc')
    expect(link).toBe(`${APP}/auth/confirm?token_hash=pkce_abc&type=recovery&next=%2Fnytt-passord`)
    expect(authLink(APP, 'signup', 'h')).toContain('type=email')
  })

  it('renders every supported action in both languages', () => {
    for (const lang of ['no', 'en'] as const) {
      for (const a of AUTH_ACTIONS) {
        const r = renderAuth(cat, a, lang, 'ola@firma.no', `${APP}/auth/confirm?x`)
        expect(r.text).toContain('ola@firma.no')
        expect(r.html).toContain(`${APP}/auth/confirm?x`)
        // a sign-in token must not pass through the provider's click redirect (D-97)
        expect(r.html).not.toContain('href=')
        expect(r.text).not.toMatch(/\{\w+\}/)
      }
    }
  })
})

describe('marketing mail (D-101)', () => {
  const crm = (over: Partial<CrmJob> = {}): CrmJob => ({
    id: 'c',
    kind: 'campaign',
    to_email: 'leser@firma.no',
    token: TOKEN,
    name: 'Kari',
    lang: 'no',
    campaign: {
      kind: 'newsletter',
      subject: 'Nytt fra Orgpuls',
      preheader: 'Tre ting om lovkravet',
      utm_campaign: 'host-2026',
      blocks: [
        { type: 'heading', text: 'Hei <alle>' },
        { type: 'text', text: 'Første avsnitt.\n\nAndre & siste.' },
        { type: 'button', text: 'Les mer', url: 'https://www.orgpuls.com/lovkrav' },
        { type: 'button', text: 'Arbeidstilsynet', url: 'https://www.arbeidstilsynet.no/x' },
      ],
    },
    ...over,
  })

  it('tags only links to Orgpuls, and keeps tags already there', () => {
    expect(withUtm('https://www.orgpuls.com/priser', 'x')).toBe(
      'https://www.orgpuls.com/priser?utm_source=orgpuls&utm_medium=email&utm_campaign=x',
    )
    expect(withUtm('https://en.orgpuls.com/?utm_campaign=keep', 'x')).toContain('utm_campaign=keep')
    expect(withUtm('https://www.arbeidstilsynet.no/x', 'x')).toBe('https://www.arbeidstilsynet.no/x')
    expect(withUtm('http://www.orgpuls.com/', 'x')).toBe('http://www.orgpuls.com/')
  })

  it('renders blocks escaped, with the sender, the reason and an unsubscribe link', () => {
    const r = renderCampaign(cat, crm(), APP)
    expect(r.subject).toBe('Nytt fra Orgpuls')
    expect(r.html).toContain('Hei &lt;alle&gt;')
    expect(r.html).toContain('Andre &amp; siste.')
    expect(r.html).toContain('utm_campaign=host-2026')
    expect(r.html).toContain('utm_content=b3-button')
    expect(r.html).toContain('href="https://www.arbeidstilsynet.no/x"')
    expect(r.html).toContain(`${APP}/avmeld?t=${TOKEN}`)
    expect(r.html).toContain('Tre ting om lovkravet')
    expect(r.text).toContain(`Meld deg av eller velg hva du får: ${APP}/avmeld?t=${TOKEN}`)
    expect(r.text).toContain('Orgpuls · orgpuls.com')
  })

  it('marks a test send in the subject, in the campaign language', () => {
    expect(renderCampaign(cat, crm({ kind: 'test' }), APP).subject).toBe('[Test] Nytt fra Orgpuls')
    expect(renderCampaign(cat, crm({ lang: 'en' }), APP).text).toContain('Unsubscribe or choose what you get:')
  })

  it('writes the confirmation link as text, since it carries the token', () => {
    const r = renderOptin(cat, crm({ kind: 'optin', campaign: null }), APP)
    expect(r.subject).toBe('Bekreft påmeldingen til nyhetsbrevet fra Orgpuls')
    expect(r.html).not.toContain(`href="${APP}/nyhetsbrev`)
    expect(r.html).toContain(`${APP}/nyhetsbrev?t=${TOKEN}`)
    expect(r.html).toContain('Hei Kari,')
  })
})

describe('campaign blocks and styles (D-103)', () => {
  const job = (over: Partial<CrmJob> = {}, campaign: Partial<NonNullable<CrmJob['campaign']>> = {}): CrmJob => ({
    id: 'c',
    kind: 'campaign',
    to_email: 'post@firma.no',
    token: TOKEN,
    name: 'Kari Nordmann',
    company: 'Nordvik Anlegg AS',
    basis: 'consent',
    lang: 'no',
    campaign: {
      kind: 'campaign',
      style: 'branded',
      subject: 'Kartleggingen i {firma}',
      preheader: 'Hei {navn}',
      utm_campaign: 'q4',
      blocks: [
        { type: 'article', title: 'Lovkravet', text: 'Kort om kravet.', url: 'https://www.orgpuls.com/lovkrav' },
        { type: 'bullets', text: 'Én\nTo & tre' },
        { type: 'image', url: 'https://www.orgpuls.com/og.png', alt: 'Skjermbilde av <rapporten>', href: 'https://www.orgpuls.com/plattform' },
        { type: 'divider' },
        { type: 'quote', text: 'Det virker.', title: 'Daglig leder' },
        { type: 'event', title: 'Webinar', text: 'Torsdag kl. 09\nTeams', url: 'https://www.orgpuls.com/kontakt' },
        { type: 'ps', text: 'Svar gjerne.' },
      ],
      ...campaign,
    },
    ...over,
  })

  it('fills {firma} and {navn} from the recipient, and falls back when unknown', () => {
    expect(renderCampaign(cat, job(), APP).subject).toBe('Kartleggingen i Nordvik Anlegg AS')
    expect(renderCampaign(cat, job(), APP).html).toContain('Hei Kari')
    expect(renderCampaign(cat, job({ company: null }), APP).subject).toBe('Kartleggingen i virksomheten')
  })

  it('tags every own link with the block it sits in, and escapes alt text', () => {
    const r = renderCampaign(cat, job(), APP)
    expect(r.html).toContain('utm_content=b1-article')
    expect(r.html).toContain('utm_content=b3-image')
    expect(r.html).toContain('utm_content=b6-event')
    expect(r.html).toContain('alt="Skjermbilde av &lt;rapporten&gt;"')
    expect(r.html).toContain('To &amp; tre')
    expect(r.text).toContain('P.S. Svar gjerne.')
  })

  it('draws buttons as tables in the branded style, and as text links in a letter', () => {
    const b = job({}, { blocks: [{ type: 'button', text: 'Se mer', url: 'https://www.orgpuls.com/' }] })
    expect(renderCampaign(cat, b, APP).html).toContain('<table role="presentation"')
    const l = job({}, { style: 'letter', signature: 'Tor\nOrgpuls', blocks: [{ type: 'button', text: 'Se mer', url: 'https://www.orgpuls.com/' }] })
    const r = renderCampaign(cat, l, APP)
    expect(r.html).not.toContain('<table role="presentation"')
    expect(r.html).not.toContain('>Orgpuls</div>')
    expect(r.text).toContain('Tor\nOrgpuls')
  })

  it('says why: the list, the register, or consent', () => {
    expect(renderCampaign(cat, job({}, { list: { name_no: 'Produktnyheter', name_en: 'Product news' } }), APP).text).toContain(
      'fordi du abonnerer på Produktnyheter',
    )
    expect(renderCampaign(cat, job({ basis: 'business' }), APP).text).toContain('Nordvik Anlegg AS er oppført med denne adressen')
  })

  it('links a published campaign to its web version', () => {
    expect(renderCampaign(cat, job({}, { web_slug: 'hostbrev' }), APP).html).toContain(`${APP}/nyhetsbrev/arkiv/hostbrev?utm_source=orgpuls`)
    expect(renderCampaign(cat, job(), APP).html).not.toContain('/nyhetsbrev/arkiv/')
  })

  it('names the lists a confirmation is for', () => {
    const r = renderOptin(cat, job({ kind: 'optin', campaign: null, lists: [{ name_no: 'Nyhetsbrevet', name_en: 'The newsletter' }] }), APP)
    expect(r.text).toContain('Du meldte deg på: Nyhetsbrevet.')
  })
})
