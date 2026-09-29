import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { blocking, checkCampaign, GMAIL_CLIP_BYTES, type CheckInput } from '@/lib/crm/deliverability'
import { pairs, renderCampaign, type CampaignBlock, type CrmJob, type MailCatalogue } from '@/supabase/functions/_shared/mail'

/**
 * Designed campaign mail (0113, X-092): the branded layout as mail programs need it, the five new
 * blocks in both styles and in plain text, and the inbox check that decides whether a campaign may
 * be scheduled.
 */
const cat = { no: no.mail, en: en.mail } as unknown as MailCatalogue
const SITE = 'https://www.orgpuls.com'

const DESIGNED: CampaignBlock[] = [
  { type: 'hero', title: 'Kartleggingen på en time', text: 'Alt dere trenger for årets kartlegging.', url: 'https://www.orgpuls.com/plattform', label: 'Se hvordan' },
  { type: 'features', title: 'Dette er nytt', text: 'Påminnelser | Eieren får beskjed.\nÅrshjul | Alt på ett sted.\nEffekt | Neste puls viser det.' },
  { type: 'steps', text: 'Legg inn ansatte | Én og én.\nVelg uke | Vi foreslår.\nGodkjenn | Resten går av seg selv.' },
  { type: 'stats', text: '5 | svar før noe resultat vises\n15 | dagers prøveperiode' },
  { type: 'quote', text: 'Det tok en time.', title: 'Kari, daglig leder' },
  { type: 'cta', title: 'Klar?', text: 'Prøv gratis.', url: 'https://www.orgpuls.com/registrer', label: 'Kom i gang' },
]

const job = (over: Partial<NonNullable<CrmJob['campaign']>> = {}, extra: Partial<CrmJob> = {}): CrmJob => ({
  id: 'j',
  kind: 'campaign',
  to_email: 'kari@example.no',
  token: 'b'.repeat(64),
  name: 'Kari Nordmann',
  company: 'Nordvik AS',
  basis: 'consent',
  lang: 'no',
  campaign: { kind: 'newsletter', style: 'branded', subject: 'Nytt fra Orgpuls', preheader: 'Tre ting', blocks: DESIGNED, utm_campaign: 'probe', ...over },
  ...extra,
})

describe('the branded layout', () => {
  const r = renderCampaign(cat, job(), SITE)

  it('is built for Outlook, phones and dark mode', () => {
    expect(r.html).toContain('<!--[if mso]><table role="presentation" width="600"')
    expect(r.html).toContain('@media only screen and (max-width:620px)')
    expect(r.html).toContain('@media (prefers-color-scheme:dark)')
    expect(r.html).toContain('<meta name="color-scheme" content="light dark">')
    expect(r.html).toContain('x-apple-disable-message-reformatting')
  })

  it('names the sender in live text beside a PNG mark, never text in a picture', () => {
    expect(r.html).toContain(`src="${SITE}/mail/mark.png"`)
    expect(r.html).toMatch(/<span class="ink"[^>]*>Orgpuls<\/span>/)
    expect(r.html).not.toMatch(/<img[^>]+\.svg/)
  })

  it('draws the designed blocks', () => {
    expect(r.html).toContain('<h1 class="ink"')
    expect(r.html).toContain('Kartleggingen på en time')
    expect(r.html).toContain('class="col"') // two columns that stack
    expect(r.html).toContain('>Påminnelser</p>')
    expect(r.html).toMatch(/>1<\/span>.*>Legg inn ansatte</s)
    expect(r.html).toContain('>15</p>')
    expect(r.html).toContain('&ldquo;')
    expect(r.html).toContain('bgcolor="#191510"') // the closing band
  })

  it('tags every link with the campaign and its block', () => {
    expect(r.html).toContain('utm_content=b1-hero')
    expect(r.html).toContain('utm_content=b6-cta')
    expect(r.html).toContain('utm_content=logo')
  })

  it('carries every block into the plain-text part', () => {
    expect(r.text).toContain('KARTLEGGINGEN PÅ EN TIME')
    expect(r.text).toContain('– Påminnelser: Eieren får beskjed.')
    expect(r.text).toContain('2. Velg uke: Vi foreslår.')
    expect(r.text).toContain('15 – dagers prøveperiode')
    expect(r.text).toContain('Kom i gang: https://www.orgpuls.com/registrer?')
  })

  it('escapes what the author wrote', () => {
    const x = renderCampaign(cat, job({ blocks: [{ type: 'hero', title: '<script>x</script>', text: '"a" & b' }] }), SITE)
    expect(x.html).not.toContain('<script>x</script>')
    expect(x.html).toContain('&lt;script&gt;')
  })

  it('stays far under the size at which Gmail clips a mail', () => {
    expect(new TextEncoder().encode(r.html).length).toBeLessThan(40 * 1024)
  })

  it('labels an event in the campaign language', () => {
    const b: CampaignBlock[] = [{ type: 'event', title: 'Webinar', text: 'Torsdag' }]
    expect(renderCampaign(cat, job({ blocks: b }), SITE).html).toContain('>Arrangement</p>')
    expect(renderCampaign(cat, job({ blocks: b }, { lang: 'en' }), SITE).html).toContain('>Event</p>')
  })
})

describe('the plain letter', () => {
  const r = renderCampaign(cat, job({ style: 'letter' }), SITE)
  it('stays a letter: no picture, no panel, no table layout for the designed blocks', () => {
    expect(r.html).not.toContain('<img')
    expect(r.html).not.toContain('bgcolor="#191510"')
    expect(r.html).not.toContain('<h1')
    expect(r.html).toContain('Kartleggingen på en time')
    expect(r.html).toContain('1. <strong>Legg inn ansatte</strong>')
  })
})

describe('pairs', () => {
  it('splits «title | text» lines and caps them', () => {
    expect(pairs('A | a\nB\n\n C | c | d ', 2)).toEqual([
      { a: 'A', b: 'a' },
      { a: 'B', b: '' },
    ])
    expect(pairs(' C | c | d ')).toEqual([{ a: 'C', b: 'c | d' }])
  })
})

describe('the inbox check', () => {
  const base: CheckInput = {
    style: 'branded',
    subject: 'Tre ting om arbeidsmiljøet denne måneden',
    preheader: 'Høy svarprosent og hva Arbeidstilsynet ser etter',
    blocks: DESIGNED,
    html: renderCampaign(cat, job(), SITE).html,
    footer: 'Orgpuls AS · Storgata 1, 0155 Oslo',
  }
  const level = (c: CheckInput, id: string) => checkCampaign(c).find((x) => x.id === id)?.level

  it('passes a well-made campaign with nothing blocking', () => {
    expect(blocking(checkCampaign(base))).toEqual([])
  })

  it('blocks a deceptive reply prefix', () => {
    expect(level({ ...base, subject: 'Re: arbeidsmiljøet' }, 'subject_deceptive')).toBe('fail')
    expect(level({ ...base, subject: 'SV: kartleggingen' }, 'subject_deceptive')).toBe('fail')
  })

  it('blocks a [placeholder] anywhere: subject, preheader, text, alt text', () => {
    expect(level({ ...base, subject: 'Slik fikk [virksomhet] det til' }, 'placeholder')).toBe('fail')
    expect(level({ ...base, preheader: 'Gjelder til [frist]' }, 'placeholder')).toBe('fail')
    expect(level({ ...base, blocks: [...DESIGNED, { type: 'quote', text: '[Sitat]' }] }, 'placeholder')).toBe('fail')
    expect(level({ ...base, blocks: [...DESIGNED, { type: 'image', url: 'https://x.no/a.png', alt: '[beskriv bildet]' }] }, 'placeholder')).toBe('fail')
  })

  it('blocks link shorteners and a mail that is nearly all picture', () => {
    expect(level({ ...base, blocks: [...DESIGNED, { type: 'button', text: 'Se', url: 'https://bit.ly/abc' }] }, 'link_shortener')).toBe('fail')
    expect(level({ ...base, blocks: [{ type: 'image', url: 'https://www.orgpuls.com/og.png', alt: 'Bilde' }] }, 'text_amount')).toBe('fail')
  })

  it('blocks a mail Gmail would clip', () => {
    expect(level({ ...base, html: 'x'.repeat(GMAIL_CLIP_BYTES + 1) }, 'size')).toBe('fail')
  })

  it('warns about shouting, spam words, a missing preheader and vague links', () => {
    expect(level({ ...base, subject: 'GRATIS kartlegging nå!!' }, 'subject_style')).toBe('warn')
    expect(checkCampaign({ ...base, subject: 'Gratis kartlegging' }).find((x) => x.id === 'spam_words')?.vars?.words).toContain('gratis')
    expect(level({ ...base, preheader: '' }, 'preheader')).toBe('warn')
    expect(level({ ...base, preheader: base.subject }, 'preheader')).toBe('warn')
    expect(level({ ...base, blocks: [...DESIGNED, { type: 'button', text: 'Klikk her', url: 'https://www.orgpuls.com/' }] }, 'link_text')).toBe('warn')
  })

  it('does not count ordinary words as spam in the body', () => {
    expect(level({ ...base, blocks: [...DESIGNED, { type: 'text', text: 'Prøv gratis i 15 dager, uten binding.' }] }, 'spam_words')).toBe('pass')
  })

  it('keeps a first-contact letter plain and personal', () => {
    const letter: CheckInput = { ...base, style: 'letter', preheader: '', subject: 'Kartleggingen i {firma}', blocks: [{ type: 'text', text: 'Hei,\n\n'.concat('ord '.repeat(40)) }] }
    expect(level(letter, 'letter_plain')).toBe('pass')
    expect(level(letter, 'letter_personal')).toBe('pass')
    expect(level(letter, 'preheader')).toBe('pass')
    expect(level({ ...letter, blocks: [...letter.blocks, DESIGNED[0]!] }, 'letter_plain')).toBe('warn')
    expect(level({ ...letter, subject: 'Kartleggingen' }, 'letter_personal')).toBe('warn')
  })

  it('asks for a postal address in the footer', () => {
    expect(level(base, 'footer_address')).toBe('pass')
    expect(level({ ...base, footer: no.mail.crm.sender }, 'footer_address')).toBe('warn')
  })

  it('has a message for every check at every level it can reach', () => {
    const items = en.admin.crm.studio.check.item as Record<string, Record<string, string>>
    const all = [
      ...checkCampaign(base),
      ...checkCampaign({ ...base, style: 'letter' }),
      ...checkCampaign({ ...base, subject: 'Re: GRATIS!! [x]', preheader: '', blocks: [{ type: 'button', text: 'klikk her', url: 'https://bit.ly/x' }], html: 'x'.repeat(GMAIL_CLIP_BYTES + 1), footer: '' }),
    ]
    for (const c of all) expect(items[c.id]?.[c.level], `${c.id}.${c.level}`).toBeTruthy()
    for (const id of ['dkim', 'dmarc', 'spf', 'domain_unknown', 'domain_lookup']) expect(items[id]).toBeTruthy()
    expect(no.admin.crm.studio.check.item).toEqual(en.admin.crm.studio.check.item)
  })
})
