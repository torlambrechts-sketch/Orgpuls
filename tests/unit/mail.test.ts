import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { smsContent, smsLength } from '@/supabase/functions/_shared/sms'
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

  // 0099, gap analysis P1-1
  it('says how long an invitation takes, carries the leader\'s greeting, and promises results only when everyone is told', () => {
    const shared = renderNotice(
      cat,
      job({ minutes: 4, results_shared: true, greeting: { text: 'Vi vil <vite> hvordan dere har det.', by: 'Kari Nordmann' } }),
      { lang: 'no', member: false, name: 'Ola' },
      APP,
    )
    expect(shared.text).toContain('Det tar omtrent 4 minutter.')
    expect(shared.text).toContain('«Vi vil <vite> hvordan dere har det.»\n– Kari Nordmann, daglig leder')
    expect(shared.html).toContain('Vi vil &lt;vite&gt;')
    expect(shared.text).toContain('Alle ansatte får vite hva målingen viste')
    const plain = renderNotice(cat, job({ minutes: 4, results_shared: false }), { lang: 'no', member: false, name: 'Ola' }, APP)
    expect(plain.text).not.toContain('får alle ansatte vite')
    expect(plain.text).not.toContain('«')
    // a reminder says none of it
    const reminder = renderNotice(cat, job({ kind: 'paminnelse', minutes: 4, results_shared: true }), { lang: 'no', member: false, name: 'Ola' }, APP)
    expect(reminder.text).not.toContain('omtrent 4 minutter')
  })

  // 0100, gap analysis P1-3
  it('links the round\'s page for employees from the results notice and the last one from the next invitation', () => {
    const slug = 't7JvAWGlyRtPExc3'
    const employee = renderNotice(cat, job({ kind: 'resultat', audience: 'alle_ansatte', token: null, results_page: slug }), { lang: 'no', member: false, name: null }, APP)
    expect(employee.text).toContain(`${APP}/r/${slug}`)
    expect(employee.text).toContain('Se hva dere svarte, og hva som skal gjøres:')
    const leader = renderNotice(cat, job({ kind: 'resultat', audience: 'daglig_leder', token: null, results_page: slug }), { lang: 'no', member: true, name: 'Dina' }, APP)
    expect(leader.text).toContain(`${APP}/resultat`)
    expect(leader.text).toContain('Du kan skjule den under Resultater.')
    const hidden = renderNotice(cat, job({ kind: 'resultat', audience: 'alle_ansatte', token: null, results_page: null }), { lang: 'no', member: false, name: null }, APP)
    expect(hidden.text).not.toContain('/r/')
    const invite = renderNotice(cat, job({ results_page: slug }), { lang: 'en', member: false, name: 'Kari' }, APP)
    expect(invite.text).toContain(`What you answered last time, and what is being done about it: ${APP}/r/${slug}`)
    const reminder = renderNotice(cat, job({ kind: 'paminnelse', results_page: slug }), { lang: 'no', member: false, name: 'Kari' }, APP)
    expect(reminder.text).not.toContain('/r/')
    // only a slug the database made reaches a mail
    expect(() => renderNotice(cat, job({ kind: 'resultat', audience: 'alle_ansatte', token: null, results_page: 'x"><script>' }), { lang: 'no', member: false, name: null }, APP)).toThrow()
  })

  // 0106 (audit AUD-06): results wait for the publish date, and the invitation says that day
  it('names the day everyone is told the results, and never promises them at the deadline', () => {
    const dated = renderNotice(cat, job({ results_shared: true, publish_on: '2026-10-20' }), { lang: 'no', member: false, name: 'Ola' }, APP)
    expect(dated.text).toContain('Alle ansatte får vite hva målingen viste, og hva som skal gjøres med det, 20. oktober.')
    const undated = renderNotice(cat, job({ results_shared: true, publish_on: null }), { lang: 'en', member: false, name: 'Ola' }, APP)
    expect(undated.text).toContain('All employees will be told what the survey showed')
    for (const r of [dated, undated]) expect(r.text).not.toMatch(/fristen er ute|deadline has passed/)
    // nobody is told: nothing is promised
    expect(renderNotice(cat, job({ results_shared: false, publish_on: '2026-10-20' }), { lang: 'no', member: false, name: 'Ola' }, APP).text).not.toContain('Alle ansatte får vite')
  })

  // 0105, engagement phase 2: «Siden sist» in the invitation's e-mail only
  it('lists what was done since the last survey in an e-mail invitation, masked names as labels, never in a reminder or an SMS', () => {
    const since = {
      first: false as const,
      since: '2026-09-18T18:00:00Z',
      items: [
        { title: 'Faste møter med ⟦n⟧ ⟦n⟧', status: 'gjennomfort' as const },
        { title: 'Ny <turnus>', status: 'pagar' as const },
      ],
      done: 1,
    }
    const invite = renderNotice(cat, job({ since }), { lang: 'no', member: false, name: 'Ola' }, APP)
    expect(invite.text).toContain('Siden sist er ett tiltak gjennomført:\n– Faste møter med [navn] [navn] (gjennomført)\n– Ny <turnus> (pågår)')
    expect(invite.html).toContain('Ny &lt;turnus&gt;')
    expect(invite.text).not.toContain('⟦')
    const many = renderNotice(cat, job({ since: { ...since, done: 3 } }), { lang: 'en', member: false, name: 'Ola' }, APP)
    expect(many.text).toContain('3')
    expect(many.text).toContain('[name]')
    // nothing to say on a first survey, or when nothing has changed
    for (const s of [{ first: true as const }, { ...since, items: [], done: 0 }, null]) {
      expect(renderNotice(cat, job({ since: s }), { lang: 'no', member: false, name: 'Ola' }, APP).text).not.toContain('Siden sist')
    }
    expect(renderNotice(cat, job({ kind: 'paminnelse', since }), { lang: 'no', member: false, name: 'Ola' }, APP).text).not.toContain('Faste møter')
    expect(renderNotice(cat, job({ channel: 'sms', since }), { lang: 'no', member: false, name: 'Ola' }, APP).text).not.toContain('Faste møter')
  })

  // 0099, P1-5 and P1-6
  it('lists a measure\'s owner\'s overdue measures, copies the verneombud, and links the app only for a member', () => {
    const measures = [{ title: 'Fast svar på avvik', due: '2026-09-27' }, { title: 'Ny <rutine>', due: null }]
    const owner = renderNotice(cat, job({ kind: 'tiltak_forfalt', round: null, token: null, measures }), { lang: 'no', member: false, name: 'Ola' }, APP)
    expect(owner.subject).toBe('Nordvik Anlegg AS: tiltak som har passert fristen')
    expect(owner.text).toContain('– Fast svar på avvik (frist 27. september)')
    expect(owner.text).toContain('– Ny <rutine> (ingen frist)')
    expect(owner.html).toContain('Ny &lt;rutine&gt;')
    expect(owner.text).not.toContain(`${APP}/tiltak`)
    const vo = renderNotice(cat, job({ kind: 'tiltak_forfalt', audience: 'verneombud', round: null, token: null, measures }), { lang: 'en', member: true, name: null }, APP)
    expect(vo.text).toContain('You get a copy because the safety representative')
    expect(vo.text).toContain(`${APP}/tiltak`)
  })

  it('tells the daglig leder a department lags, naming none and giving no figure', () => {
    const r = renderNotice(cat, job({ kind: 'svarprosent', audience: 'daglig_leder', token: null }), { lang: 'no', member: true, name: null }, APP)
    expect(r.subject).toBe('Nordvik Anlegg AS: én avdeling henger etter på grunnlinjen 2026')
    expect(r.text).toContain(`${APP}/malinger`)
    expect(r.text).not.toMatch(/\d+ ?%/)
    expect(r.text).not.toMatch(/\{\w+\}/)
  })

  it('reminds the daglig leder that the ordning is due for evaluation, and says where to record it (A-02)', () => {
    const evaluation = { cadence: 'arlig', last_on: null, due_on: '2026-09-15' }
    const r = renderNotice(cat, job({ kind: 'evaluering', audience: 'daglig_leder', round: null, token: null, evaluation }), { lang: 'no', member: true, name: null }, APP)
    expect(r.subject).toBe('Nordvik Anlegg AS: tid for å evaluere målingen')
    expect(r.text).toContain('forfalt evalueringen 15. september 2026')
    expect(r.text).toContain('Det er ikke registrert noen evaluering ennå.')
    expect(r.text).toContain(`${APP}/rapport`)
    expect(r.text).not.toMatch(/\{\w+\}/)
    const en = renderNotice(cat, job({ kind: 'evaluering', audience: 'daglig_leder', round: null, token: null, evaluation: { ...evaluation, last_on: '2025-09-01' } }), { lang: 'en', member: true, name: null }, APP)
    expect(en.text).toContain('Last recorded evaluation: 1 September 2025.')
  })

  it('heads a notice with the organisation\'s logo, and only by an address the database made (0104)', () => {
    const key = 'a1'.repeat(16)
    const withLogo = renderNotice(cat, job({ token: TOKEN, logo: key }), { lang: 'no', member: false, name: null }, APP)
    expect(withLogo.html).toContain(`<img src="${APP}/logo/${key}" alt="Nordvik Anlegg AS"`)
    expect(withLogo.html).not.toContain('>Orgpuls</div>')
    const forged = renderNotice(cat, job({ token: TOKEN, logo: '"><script>' }), { lang: 'no', member: false, name: null }, APP)
    expect(forged.html).not.toContain('<img')
    expect(forged.html).toContain('>Orgpuls</div>')
  })

  it('sends a test of the invitation to the leader with the preview\'s link and no token (0127)', () => {
    const round = '0b6f3c1e-7d2a-4f5b-9c8e-1a2b3c4d5e6f'
    for (const lang of ['no', 'en'] as const) {
      const r = renderNotice(cat, job({ token: null, lang, test_round: round }), { lang, member: true, name: 'Dina' }, APP)
      expect(r.subject.startsWith('Test: ')).toBe(true)
      expect(r.text).toContain(`${APP}/forhandsvis?runde=${round}`)
      expect(r.text).not.toContain('/s/')
      expect(r.text).toContain(lang === 'no' ? 'Dette er en test' : 'This is a test')
    }
    // a real invitation is untouched by the field's absence, and a round that is not an id never reaches a link
    expect(renderNotice(cat, job(), { lang: 'no', member: false, name: 'Ola' }, APP).subject).toBe('Nordvik Anlegg AS: svar på grunnlinjen 2026')
    expect(() => renderNotice(cat, job({ token: null, test_round: '../admin' }), { lang: 'no', member: true, name: null }, APP)).toThrow()
    // only an invitation can be a test
    expect(() => renderNotice(cat, job({ kind: 'paminnelse', token: null, test_round: round }), { lang: 'no', member: true, name: null }, APP)).toThrow()
  })

  it('names a puls by its number within the year', () => {
    expect(roundName(no.mail, { kind: 'puls', year: 2027, pulse: 2, opens_at: null, closes_at: null })).toBe('puls 2 · 2027')
    expect(roundName(en.mail, { kind: 'grunnlinje', year: 2026, pulse: null, opens_at: null, closes_at: null })).toBe('the 2026 baseline')
  })
})

describe('sms', () => {
  it('uses the organisation\'s own text for an invitation, and the default without one', () => {
    expect(smsLead(cat, job({ channel: 'sms', sms_text: 'Svar på målingen:' }), 'no')).toBe('Svar på målingen:')
    // the organisation's own text is in its language: an English reader gets the English default
    expect(smsLead(cat, job({ channel: 'sms', sms_text: 'Svar på målingen:' }), 'en')).not.toContain('Svar på målingen')
    expect(smsLead(cat, job({ channel: 'sms' }), 'no')).toBe('Hei! Nordvik Anlegg AS spør hvordan du har det på jobb. Svar anonymt:')
  })

  it('tells a reminder that the earlier link is dead, whatever the organisation wrote', () => {
    const lead = smsLead(cat, job({ kind: 'paminnelse', channel: 'sms', sms_text: 'Egen tekst:' }), 'no')
    // "Ny lenke": the text since D-128, shorter so a reminder fits one SMS, and still saying the link changed
    expect(lead).toContain('Ny lenke')
    expect(lead).toContain('13. oktober')
  })

  it('fits every personal message in one SMS with the real link, for an organisation name of up to 34 characters (D-128)', () => {
    const link = `https://www.orgpuls.com/s/${'k'.repeat(22)}`
    const org = 'Oslo kommune helse- og omsorgsetat'
    for (const lang of ['no', 'en'] as const) {
      for (const kind of ['invitasjon', 'paminnelse', 'siste_paminnelse', 'lenke'] as const) {
        // the longest date a deadline prints: 30 September
        const round = { kind: 'grunnlinje', year: 2026, pulse: null, opens_at: '2026-09-23T07:00:00Z', closes_at: '2026-09-30T07:00:00Z' }
        const content = smsContent(smsLead(cat, job({ kind, channel: 'sms', org, round }), lang), link)
        expect(smsLength(content).parts, `${lang} ${kind}: ${content}`).toBe(1)
      }
    }
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
