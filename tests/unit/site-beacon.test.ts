import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beaconBody, formCode, mayCount, referrerHost } from '@/lib/marketing/beacon'
import { COLLECT_ORIGIN, COLLECT_URL } from '@/lib/marketing/collect'
import no from '@/messages/no.json'
import en from '@/messages/en.json'

/**
 * The public site's own visit counting in Sentral (D-248): what is sent, from where, and what is
 * never sent. The privacy statement promises that a browser asking not to be tracked sends nothing,
 * that no capability page is counted, and that what is sent is the page, the referring domain and the
 * campaign tags; these hold it to that.
 */
describe('where the beacon may count', () => {
  it('counts on the production hosts only, unless a test stack names its own collector', () => {
    expect(mayCount('www.orgpuls.com', '/', false, '')).toBe(true)
    expect(mayCount('www.empvibe.com', '/pricing', false, '')).toBe(true)
    // the English host moved (D-275): it serves no page, so nothing there is counted
    expect(mayCount('en.orgpuls.com', '/', false, '')).toBe(false)
    expect(mayCount('orgpuls.com', '/priser', false, '')).toBe(true)
    expect(mayCount('orgpuls-git-x.vercel.app', '/', false, '')).toBe(false)
    expect(mayCount('localhost', '/', false, '')).toBe(false)
    expect(mayCount('localhost', '/', false, 'http://127.0.0.1:54321/functions/v1/web-collect')).toBe(true)
  })

  it('never counts a page that carries a capability, or sign-in', () => {
    for (const p of ['/s/abc123', '/s', '/bli-med/tok', '/r/x', '/inn/KODE', '/auth/callback', '/logg-inn', '/nytt-passord', '/api/x', '/admin'])
      expect(mayCount('www.orgpuls.com', p, false, ''), p).toBe(false)
    // a path that only starts with the same letters is a page of the site
    expect(mayCount('www.orgpuls.com', '/sikkerhet', false, '')).toBe(true)
    expect(mayCount('www.orgpuls.com', '/registrer', false, '')).toBe(true)
  })

  it('sends nothing from a browser that asks not to be tracked', () => {
    expect(mayCount('www.orgpuls.com', '/', true, '')).toBe(false)
  })

  it('reads a site’s own addresses as their routes: Empvibe’s sign-in is never counted, its pages are (D-274)', () => {
    expect(mayCount('www.empvibe.com', '/sign-in', false, '')).toBe(false)
    expect(mayCount('www.empvibe.com', '/privacy', false, '')).toBe(true)
    expect(mayCount('www.empvibe.com', '/sign-up', false, '')).toBe(true)
  })
})

describe('what a beacon says', () => {
  it('a view: the page, the referring host and the campaign tags', () => {
    expect(beaconBody({ k: 'view' }, '/priser', { utm_source: 'linkedin' }, 'www.google.com')).toEqual({
      k: 'view', p: '/priser', r: 'www.google.com', u: { utm_source: 'linkedin' },
    })
    expect(beaconBody({ k: 'view' }, '/', {})).toEqual({ k: 'view', p: '/' })
  })

  it('a press and an event carry which, and no referrer', () => {
    expect(beaconBody({ k: 'cta', l: 'orgnr' }, '/', {}, 'x.no')).toEqual({ k: 'cta', p: '/', l: 'orgnr' })
    expect(beaconBody({ k: 'event', e: 'signup_started' }, '/registrer', {})).toEqual({ k: 'event', p: '/registrer', e: 'signup_started' })
  })

  it('a step, an error or a persona carries its code (D-277)', () => {
    expect(beaconBody({ k: 'form', e: 'signup_step', l: 'step2_shown' }, '/registrer', {})).toEqual({ k: 'event', p: '/registrer', e: 'signup_step', l: 'step2_shown' })
    expect(beaconBody({ k: 'form', e: 'signup_error', l: 'lookup_not_found' }, '/registrer', { utm_source: 'google-ads' }))
      .toEqual({ k: 'event', p: '/registrer', e: 'signup_error', l: 'lookup_not_found', u: { utm_source: 'google-ads' } })
  })

  it('a code is a code: anything typed is not one (D-277)', () => {
    expect(formCode('step2_signup_failed')).toBe('step2_signup_failed')
    expect(formCode('sso-google')).toBe('sso-google')
    for (const v of ['923456789x ', 'ola@firma.no', 'Kari Nordmann', '', 'a'.repeat(41), 'STEP2']) expect(formCode(v), v).toBeUndefined()
  })

  it('caps the path', () => {
    expect(beaconBody({ k: 'view' }, `/${'a'.repeat(400)}`, {}).p).toHaveLength(160)
  })

  it('the referrer is a host, and never the site itself', () => {
    expect(referrerHost('https://www.google.com/search?q=arbeidsmilj%C3%B8', 'www.orgpuls.com')).toBe('www.google.com')
    expect(referrerHost('https://www.orgpuls.com/priser', 'www.orgpuls.com')).toBeUndefined()
    expect(referrerHost('', 'www.orgpuls.com')).toBeUndefined()
    expect(referrerHost('not a url', 'www.orgpuls.com')).toBeUndefined()
  })
})

describe('sending', () => {
  const fetchMock = vi.fn((..._a: unknown[]) => Promise.resolve(new Response(null, { status: 204 })))
  const nav: { doNotTrack: string | null; globalPrivacyControl?: boolean } = { doNotTrack: null }
  const loc = { hostname: 'www.orgpuls.com', pathname: '/', search: '?utm_source=nyhetsbrev&orgnr=999999999' }

  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockClear()
    nav.doNotTrack = null
    delete nav.globalPrivacyControl
    loc.pathname = '/'
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', nav)
    vi.stubGlobal('window', { location: loc })
    vi.stubGlobal('document', { referrer: 'https://www.linkedin.com/feed/' })
  })
  afterEach(() => vi.unstubAllGlobals())

  const sent = () => fetchMock.mock.calls.map((c) => {
    const init = c[1] as RequestInit
    return { url: c[0], init, body: JSON.parse(String(init.body)) as Record<string, unknown> }
  })

  it('posts text/plain to Sentral in cors mode, so the origin is the real one under no-referrer', async () => {
    const { sendBeacon } = await import('@/lib/marketing/beacon')
    sendBeacon({ k: 'view' })
    const [one] = sent()
    expect(one?.url).toBe(COLLECT_URL)
    expect(one?.init).toMatchObject({ method: 'POST', keepalive: true, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
    expect(one?.init.headers).toEqual({ 'content-type': 'text/plain' })
    // only the five campaign keys survive the address: the organisation number does not
    expect(one?.body).toEqual({ k: 'view', p: '/', r: 'www.linkedin.com', u: { utm_source: 'nyhetsbrev' } })
  })

  it('names the referrer once per page load', async () => {
    const { sendBeacon } = await import('@/lib/marketing/beacon')
    sendBeacon({ k: 'view' })
    loc.pathname = '/priser'
    sendBeacon({ k: 'view' })
    expect(sent().map((s) => s.body.r)).toEqual(['www.linkedin.com', undefined])
  })

  it('sends nothing under Global Privacy Control or Do Not Track', async () => {
    const { sendBeacon } = await import('@/lib/marketing/beacon')
    nav.globalPrivacyControl = true
    sendBeacon({ k: 'view' })
    delete nav.globalPrivacyControl
    nav.doNotTrack = '1'
    sendBeacon({ k: 'event', e: 'signup_started' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends nothing from a respondent link', async () => {
    const { sendBeacon } = await import('@/lib/marketing/beacon')
    loc.pathname = '/s/Qm9vb29vb29vb29vb29v'
    sendBeacon({ k: 'view' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends a form code, and nothing when the value is not a code (D-277)', async () => {
    const { sendBeacon } = await import('@/lib/marketing/beacon')
    loc.pathname = '/registrer'
    sendBeacon({ k: 'form', e: 'signup_error', l: 'lookup_not_found' })
    sendBeacon({ k: 'form', e: 'signup_error', l: 'ola@firma.no' })
    expect(sent().map((x) => x.body)).toEqual([{ k: 'event', p: '/registrer', e: 'signup_error', l: 'lookup_not_found', u: { utm_source: 'nyhetsbrev' } }])
  })

  it('a failed post never breaks the page', async () => {
    const { sendBeacon } = await import('@/lib/marketing/beacon')
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')))
    expect(() => sendBeacon({ k: 'view' })).not.toThrow()
  })
})

describe('the collector', () => {
  it('is Sentral’s web-collect, pinned to Frankfurt', () => {
    expect(COLLECT_URL).toMatch(/^https:\/\/[a-z]{20}\.supabase\.co\/functions\/v1\/web-collect\?forceFunctionRegion=eu-central-1$/)
  })

  it('the CSP lets the browser reach it, and nothing else new', async () => {
    const config = (await import('@/next.config')).default
    const rules = await config.headers!()
    const csp = rules.flatMap((r) => r.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
    const connect = csp.split('; ').find((d) => d.startsWith('connect-src')) ?? ''
    expect(connect.split(' ')).toContain(COLLECT_ORIGIN)
    expect(connect).not.toMatch(/\s{2}/)
  })

  it('the privacy statement says what is sent, and that GPC/DNT sends nothing', () => {
    const text = (m: typeof no) => JSON.stringify(m.seo.pages.personvernerklaering)
    expect(text(no)).toContain('Global Privacy Control')
    expect(text(no)).toContain('Besøksstatistikk: 13 måneder')
    // D-277: the signup's step and error codes and the device class are named
    expect(text(no)).toContain('hvilket steg i registreringen du kommer til og en kode for en eventuell feil')
    expect(text(no)).toContain('en mobil, et nettbrett eller en datamaskin')
    expect(text(no)).not.toContain('Vi fører ingen egen statistikk')
    expect(text(en as typeof no)).toContain('Global Privacy Control')
    expect(text(en as typeof no)).toContain('Visit statistics: 13 months')
  })
})
