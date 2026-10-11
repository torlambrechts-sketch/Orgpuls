import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EMPVIBE_URL, SE_URL, SITES } from '@/lib/hosts'
import { MARKETS } from '@/lib/markets'
import {
  appUrlOf,
  authSite,
  brandNameOf,
  mailFrom,
  MARKET_AUTH_LANG,
  MARKET_MAIL_DOMAIN,
  MARKET_SITE_URL,
  renderAuth,
  senderFor,
  smsSenderOf,
  type MailCatalogue,
} from '@/supabase/functions/_shared/mail'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * Where an organisation's mail, SMS, Teams and Slack lead, and under whose name (UK-G, D-275). What
 * would go wrong silently, and is held here:
 *
 *  - a UK employee's invitation linking to www.orgpuls.com, or arriving from «Orgpuls»;
 *  - a UK sign-up confirmed on Orgpuls's site, in bokmål;
 *  - a local or QA run mailing links to a production site;
 *  - a brand's domain used as the sender before Brevo has authenticated it;
 *  - the dispatcher's own code going back to the product's address for one channel.
 */
const PROD = 'https://www.orgpuls.com'
const base = { email: 'varsel@orgpuls.com', name: 'Orgpuls' }
// the catalogue from the message files, as mail.test builds it: messages.gen.ts is written at deploy, not checked in
const MAIL = { no: no.mail, en: en.mail } as unknown as MailCatalogue

describe('each market’s site', () => {
  it('is the site the host registry names for it, and only a market with its own site has one', () => {
    expect(MARKET_SITE_URL.gb).toBe(EMPVIBE_URL)
    // Sweden's since its site opened (SE-F, D-276): a Swedish leader's session is on se.orgpuls.com
    expect(MARKET_SITE_URL.se).toBe(SE_URL)
    for (const [market, url] of Object.entries(MARKET_SITE_URL)) expect(SITES.some((s) => s.market === market && s.url === url), market).toBe(true)
    // every market with a site of its own has its links there
    for (const s of SITES.filter((x) => x.own)) expect(MARKET_SITE_URL[s.market], s.host).toBe(s.url)
    expect(MARKET_SITE_URL.no).toBeUndefined()
  })

  it('is where a link to an organisation in it leads from production, and only from production', () => {
    expect(appUrlOf(PROD, 'gb')).toBe('https://www.empvibe.com')
    expect(appUrlOf(`${PROD}/`, 'gb')).toBe('https://www.empvibe.com')
    expect(appUrlOf(PROD, 'no')).toBe(PROD)
    expect(appUrlOf(PROD, 'se')).toBe('https://se.orgpuls.com')
    expect(appUrlOf(PROD, null)).toBe(PROD)
    // a local, QA, branch or staging run keeps its own base: its tokens exist only in its own database
    for (const other of ['http://localhost:3100', 'http://127.0.0.1:3000/', 'https://staging.orgpuls.com', 'https://orgpuls-git-x.vercel.app'])
      for (const market of ['gb', 'se']) expect(appUrlOf(other, market), `${other} ${market}`).toBe(other)
  })
})

describe('the sender', () => {
  it('of an SMS is the brand’s name, Orgpuls’s markets keeping the configured one, in at most 11 characters', () => {
    expect(smsSenderOf('gb', 'Orgpuls')).toBe('Empvibe')
    expect(smsSenderOf('no', 'OrgpulsNO')).toBe('OrgpulsNO')
    expect(smsSenderOf(null, 'Orgpuls')).toBe('Orgpuls')
    for (const m of MARKETS) expect(smsSenderOf(m, 'Orgpuls').length, m).toBeLessThanOrEqual(11)
  })

  it('of a mail takes the brand’s domain only once Brevo has authenticated it', () => {
    expect(senderFor(base, 'no', new Set(['empvibe.com']))).toBe(base)
    expect(senderFor(base, 'gb', new Set())).toEqual({ email: 'varsel@orgpuls.com', name: 'Empvibe' })
    expect(senderFor(base, 'gb', new Set(['orgpuls.com']))).toEqual({ email: 'varsel@orgpuls.com', name: 'Empvibe' })
    expect(senderFor(base, 'gb', new Set(['empvibe.com']))).toEqual({ email: 'varsel@empvibe.com', name: 'Empvibe' })
  })

  it('of a mail from a brand’s own domain has its answers go to the support inbox, the domain having no mailbox', () => {
    expect(mailFrom(base, 'gb', new Set(['empvibe.com']), 'hjelp@orgpuls.no')).toEqual({
      sender: { email: 'varsel@empvibe.com', name: 'Empvibe' },
      replyTo: { email: 'hjelp@orgpuls.no', name: 'Empvibe' },
    })
    expect(mailFrom(base, 'gb', new Set(), 'hjelp@orgpuls.no')).toEqual({ sender: { email: 'varsel@orgpuls.com', name: 'Empvibe' } })
    expect(mailFrom(base, 'no', new Set(['empvibe.com']), 'hjelp@orgpuls.no')).toEqual({ sender: base })
  })

  it('names, for every brand of its own, a domain its site is on', () => {
    for (const [market, domain] of Object.entries(MARKET_MAIL_DOMAIN)) expect(new URL(MARKET_SITE_URL[market]!).host.endsWith(domain), market).toBe(true)
  })
})

describe('an Auth mail (sign-up, invitation, new password)', () => {
  it('leads back to the site it was asked on, read from redirect_to, and to the product’s otherwise', () => {
    expect(authSite('https://www.empvibe.com/auth/confirm', PROD)).toEqual({ url: 'https://www.empvibe.com', market: 'gb' })
    expect(authSite('https://empvibe.com/auth/confirm', PROD)).toEqual({ url: 'https://www.empvibe.com', market: 'gb' })
    expect(authSite('https://se.orgpuls.com/auth/confirm', PROD)).toEqual({ url: 'https://se.orgpuls.com', market: 'se' })
    for (const other of ['https://www.orgpuls.com/auth/confirm', 'https://evil.example/www.empvibe.com', 'https://www.empvibe.com.evil.example/', 'https://se.orgpuls.com.evil.example/', 'https://orgpuls.com/auth/confirm', 'not a url', '', undefined, null])
      expect(authSite(other, PROD), String(other)).toEqual({ url: PROD, market: null })
    // a run that is not production's keeps its own base, as every other link does
    expect(authSite('https://www.empvibe.com/auth/confirm', 'http://localhost:3100')).toEqual({ url: 'http://localhost:3100', market: 'gb' })
  })

  it('is written in the market’s language when the account names none, under the brand’s name', () => {
    expect(MARKET_AUTH_LANG.gb).toBe('en')
    // a Swedish organisation's leaders read their mail in English until it exists in Swedish (D-255)
    expect(MARKET_AUTH_LANG.se).toBe('en')
    const r = renderAuth(MAIL, 'signup', 'en', 'a@b.co.uk', 'https://www.empvibe.com/auth/confirm?x=1', `${brandNameOf('gb')} · empvibe.com`)
    expect(r.html).toContain('Empvibe · empvibe.com')
    expect(r.html).not.toContain('Orgpuls · orgpuls.com')
    // Norway's, as before
    expect(renderAuth(MAIL, 'signup', 'no', 'a@b.no', 'https://www.orgpuls.com/x').html).toContain('Orgpuls · orgpuls.com')
  })

  it('is asked for with the site and the language, on every path that sends one', () => {
    for (const file of ['app/(marketing)/registrer/actions.ts', 'app/(marketing)/bli-med/actions.ts', 'app/(marketing)/logg-inn/actions.ts'])
      expect(readFileSync(file, 'utf8'), file).toMatch(/authReturn\(\)/)
    const hook = readFileSync('supabase/functions/orgpuls-auth-mail/index.ts', 'utf8')
    expect(hook).toMatch(/authSite\(data\.email_data\.redirect_to/)
    expect(hook).not.toMatch(/authLink\(Deno\.env/)
    // Auth waits on the hook: the brand's domain is asked beside the wordings, and for a second at most
    expect(hook).toMatch(/Promise\.all\(\[[\s\S]{0,200}brevoAuthenticatedDomains\(key, 1000\)/)
  })
})

describe('the dispatcher', () => {
  const src = readFileSync('supabase/functions/orgpuls-dispatch/index.ts', 'utf8')

  it('builds no link to an organisation on the product’s own address, and sends no SMS from the bare sender', () => {
    expect(src).not.toMatch(/(personalLink|threadLink)\(appUrl,/)
    // the operator's sandboxed probe to probe@orgpuls.com is the one notice drawn on the product's address
    const onProduct = src.match(/render(Notice|ReplyNotice|Lifecycle)\([^\n]*,\s*appUrl\)/g) ?? []
    expect(onProduct).toEqual([`renderNotice(cat, job, { lang: 'no', member: false, name: 'Probe' }, appUrl)`])
    // the configured sender only as the fallback of Orgpuls's own markets (and the operator's probe)
    expect(src.match(/brevoSendSms\(key, \{ sender: smsSender,/g) ?? []).toHaveLength(0)
    // the operator's probe proves a brand's own sender before an organisation's SMS goes from it
    expect(src).toMatch(/probe === 'sms'[\s\S]{0,600}smsSenderOf\(new URL\(req\.url\)\.searchParams\.get\('market'\), smsSender\)/)
  })

  it('sends each organisation’s mail under its market’s sender', () => {
    // the product's own sender only to the operator's probe and to the copy of a lead Orgpuls keeps
    const own = src.match(/brevoSend\(key, \{ sender, to: \[\{ email: [^,}]+/g) ?? []
    expect(own).toEqual([`brevoSend(key, { sender, to: [{ email: 'probe@orgpuls.com'`, 'brevoSend(key, { sender, to: [{ email: copyTo '])
    expect(src.match(/\.\.\.\(await fromOf\(/g)?.length).toBeGreaterThanOrEqual(5)
  })
})
