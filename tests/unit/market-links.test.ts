import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EMPVIBE_URL, SITES } from '@/lib/hosts'
import { MARKETS } from '@/lib/markets'
import {
  appUrlOf,
  authSite,
  brandNameOf,
  MARKET_AUTH_LANG,
  MARKET_MAIL_DOMAIN,
  MARKET_SITE_URL,
  renderAuth,
  senderFor,
  smsSenderOf,
  type MailCatalogue,
} from '@/supabase/functions/_shared/mail'
import { MAIL } from '@/supabase/functions/_shared/messages.gen'

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

describe('each market’s site', () => {
  it('is the site the host registry names for it, and only a market with its own site has one', () => {
    expect(MARKET_SITE_URL.gb).toBe(EMPVIBE_URL)
    for (const [market, url] of Object.entries(MARKET_SITE_URL)) expect(SITES.some((s) => s.market === market && s.url === url), market).toBe(true)
    expect(MARKET_SITE_URL.no).toBeUndefined()
    expect(MARKET_SITE_URL.se).toBeUndefined()
  })

  it('is where a link to an organisation in it leads, except on a local or QA run', () => {
    expect(appUrlOf(PROD, 'gb')).toBe('https://www.empvibe.com')
    expect(appUrlOf(PROD, 'no')).toBe(PROD)
    expect(appUrlOf(PROD, 'se')).toBe(PROD)
    expect(appUrlOf(PROD, null)).toBe(PROD)
    for (const local of ['http://localhost:3100', 'http://127.0.0.1:3000/', 'http://[::1]:3000']) expect(appUrlOf(local, 'gb'), local).toBe(local)
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

  it('names, for every brand of its own, a domain its site is on', () => {
    for (const [market, domain] of Object.entries(MARKET_MAIL_DOMAIN)) expect(new URL(MARKET_SITE_URL[market]!).host.endsWith(domain), market).toBe(true)
  })
})

describe('an Auth mail (sign-up, invitation, new password)', () => {
  it('leads back to the site it was asked on, read from redirect_to, and to the product’s otherwise', () => {
    expect(authSite('https://www.empvibe.com/auth/confirm', PROD)).toEqual({ url: 'https://www.empvibe.com', market: 'gb' })
    expect(authSite('https://empvibe.com/auth/confirm', PROD)).toEqual({ url: 'https://www.empvibe.com', market: 'gb' })
    for (const other of ['https://www.orgpuls.com/auth/confirm', 'https://evil.example/www.empvibe.com', 'https://www.empvibe.com.evil.example/', 'not a url', '', undefined, null])
      expect(authSite(other, PROD), String(other)).toEqual({ url: PROD, market: null })
    // a local run keeps its own base, as every other link does
    expect(authSite('https://www.empvibe.com/auth/confirm', 'http://localhost:3100')).toEqual({ url: 'http://localhost:3100', market: 'gb' })
  })

  it('is written in the market’s language when the account names none, under the brand’s name', () => {
    expect(MARKET_AUTH_LANG.gb).toBe('en')
    const r = renderAuth(MAIL as unknown as MailCatalogue, 'signup', 'en', 'a@b.co.uk', 'https://www.empvibe.com/auth/confirm?x=1', `${brandNameOf('gb')} · empvibe.com`)
    expect(r.html).toContain('Empvibe · empvibe.com')
    expect(r.html).not.toContain('Orgpuls · orgpuls.com')
    // Norway's, as before
    expect(renderAuth(MAIL as unknown as MailCatalogue, 'signup', 'no', 'a@b.no', 'https://www.orgpuls.com/x').html).toContain('Orgpuls · orgpuls.com')
  })

  it('is asked for with the site and the language, on every path that sends one', () => {
    for (const file of ['app/(marketing)/registrer/actions.ts', 'app/(marketing)/bli-med/actions.ts', 'app/(marketing)/logg-inn/actions.ts'])
      expect(readFileSync(file, 'utf8'), file).toMatch(/authReturn\(\)/)
    const hook = readFileSync('supabase/functions/orgpuls-auth-mail/index.ts', 'utf8')
    expect(hook).toMatch(/authSite\(data\.email_data\.redirect_to/)
    expect(hook).not.toMatch(/authLink\(Deno\.env/)
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
    expect(src.match(/brevoSendSms\(key, \{ sender: smsSender,/g) ?? []).toHaveLength(1)
    expect(src).toMatch(/probe === 'sms'[\s\S]{0,400}brevoSendSms\(key, \{ sender: smsSender,/)
  })

  it('sends each organisation’s mail under its market’s sender', () => {
    // the product's own sender only to the operator's probe and to the copy of a lead Orgpuls keeps
    const own = src.match(/brevoSend\(key, \{ sender, to: \[\{ email: [^,}]+/g) ?? []
    expect(own).toEqual([`brevoSend(key, { sender, to: [{ email: 'probe@orgpuls.com'`, 'brevoSend(key, { sender, to: [{ email: copyTo '])
    expect(src.match(/sender: await senderOf\(/g)?.length).toBeGreaterThanOrEqual(5)
  })
})
