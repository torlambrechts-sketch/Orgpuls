import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { marketOfHost, outboundBase, PUBLIC_HOSTS, SITES, siteOf } from '@/lib/hosts'
import { LOCALES } from '@/lib/i18n/locales'
import { PACK_LANGS } from '@/lib/i18n/market-overlay'
import { DEFAULT_MARKET, isMarket, LEGAL_PACK, MARKET_K_FLOOR, MARKET_LANGS, MARKET_TIME_ZONE, MARKETS, orgNumberProblem, REGISTRY_LOOKUP } from '@/lib/markets'
import { K_FLOOR, thresholdChoices } from '@/lib/org/threshold'
import { PendingOrg } from '@/lib/signup/pending'

/**
 * Markets (0214, D-251): the database's app.markets rows are the source; this list, the host
 * registry and the sign-up all have to name only markets the database has, or a sign-up on a new
 * host would be refused with invalid_market — or the reverse, a market nobody can sign up in.
 */
const DIR = 'supabase/migrations'
const seeded = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .flatMap((f) => {
    const sql = readFileSync(`${DIR}/${f}`, 'utf8')
    return [...sql.matchAll(/insert into app\.markets\s*\([^)]*\)\s*values\s*([^;]+);/gi)].flatMap((m) =>
      [...(m[1] ?? '').matchAll(/\(\s*'([a-z]{2})'/g)].map((v) => v[1]),
    )
  })

describe('the markets', () => {
  it('are the ones the migrations seed, and Norway is the default', () => {
    expect([...MARKETS].sort()).toEqual([...new Set(seeded)].sort())
    expect(DEFAULT_MARKET).toBe('no')
    expect(isMarket('no')).toBe(true)
    expect(isMarket('se')).toBe(true)
    expect(isMarket('de')).toBe(false)
    expect(isMarket(undefined)).toBe(false)
  })
})

describe('the host registry', () => {
  it('names each host once, in a market that exists, in a language the platform renders', () => {
    expect(new Set(SITES.map((s) => s.host)).size).toBe(SITES.length)
    for (const s of SITES) {
      expect(isMarket(s.market), s.host).toBe(true)
      expect(LOCALES, s.host).toContain(s.lang)
      expect(s.url, s.host).toMatch(/^https:\/\/[a-z.]+$/)
    }
    expect(PUBLIC_HOSTS).toEqual(SITES.map((s) => s.host))
  })

  it('opens Norway’s hosts in Norwegian, and has no site on the English host since it moved (D-275)', () => {
    expect(siteOf('en.orgpuls.com')).toBeNull()
    expect(siteOf('WWW.ORGPULS.COM:443')).toMatchObject({ lang: 'no', pinned: false, market: 'no' })
    expect(siteOf('orgpuls.com')?.url).toBe('https://www.orgpuls.com')
    expect(siteOf('localhost:3000')).toBeNull()
    expect(outboundBase('orgpuls.com', 'http')).toBe('https://www.orgpuls.com')
  })

  it('gives a sign-up Norway on any host that is not a site, a spoofed one included', () => {
    expect(marketOfHost('www.orgpuls.com')).toBe('no')
    expect(marketOfHost('en.orgpuls.com')).toBe('no')
    expect(marketOfHost('localhost:3100')).toBe('no')
    expect(marketOfHost('evil.example')).toBe('no')
    expect(marketOfHost(null)).toBe('no')
  })
})

describe('a pending sign-up', () => {
  const base = { orgNumber: '999000214', companyName: 'Marked AS', employeeCount: 12 }
  it('kept before markets were carried, is Norway’s', () => {
    expect(PendingOrg.parse(base).market).toBe('no')
  })
  it('carries a known market and refuses an unknown one', () => {
    expect(PendingOrg.parse({ ...base, market: 'no' }).market).toBe('no')
    expect(PendingOrg.safeParse({ ...base, market: 'qq' }).success).toBe(false)
  })
})

describe('each market', () => {
  it('says whether its register can be asked, which languages it offers, and its number problem', () => {
    for (const m of MARKETS) {
      expect(typeof REGISTRY_LOOKUP[m], m).toBe('boolean')
      expect(MARKET_LANGS[m].length, m).toBeGreaterThan(0)
      for (const l of MARKET_LANGS[m]) expect(LOCALES, m).toContain(l)
    }
    // Norway as it was: Brønnøysund, bokmål and English, the nine-digit message
    expect(REGISTRY_LOOKUP.no).toBe(true)
    expect(MARKET_LANGS.no).toEqual(['no', 'en'])
    expect(orgNumberProblem('no')).toBe('invalid_org_number')
    // Sweden (D-254): no register to ask yet, Swedish and English, its own message, and its law in its pack (D-257)
    expect(REGISTRY_LOOKUP.se).toBe(false)
    expect(LEGAL_PACK.no).toBe(true)
    // a market's law is in the product exactly when it is Norway's files or it has a pack (lib/i18n/market-overlay.ts)
    for (const m of MARKETS) expect(LEGAL_PACK[m], m).toBe(m === 'no' || PACK_LANGS[m].length > 0)
    expect(MARKET_LANGS.se).toEqual(['sv', 'en'])
    expect(orgNumberProblem('se')).toBe('invalid_org_number_se')
    // the United Kingdom (D-264): no register asked yet, English, its own message, its law in its pack (D-265)
    expect(REGISTRY_LOOKUP.gb).toBe(false)
    expect(MARKET_LANGS.gb).toEqual(['en'])
    expect(LEGAL_PACK.gb).toBe(true)
    expect(orgNumberProblem('gb')).toBe('invalid_org_number_gb')
    const no = JSON.parse(readFileSync('messages/no.json', 'utf8')) as { registrer: { problem: Record<string, string> } }
    for (const m of MARKETS) expect(no.registrer.problem[orgNumberProblem(m)], m).toBeTruthy()
  })
})

describe('the Swedish site', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('is se.orgpuls.com (X-109), in Swedish with English beside it, and signs up into Sweden', async () => {
    vi.stubEnv('SE_HOST', '')
    vi.resetModules()
    const hosts = await import('@/lib/hosts')
    expect(hosts.siteOf('se.orgpuls.com')).toMatchObject({ market: 'se', lang: 'sv', pinned: false, url: 'https://se.orgpuls.com', publicSite: false })
    expect(hosts.marketOfHost('SE.orgpuls.com:443')).toBe('se')
    expect(hosts.siteLangs('se.orgpuls.com')).toEqual(['sv', 'en'])
    expect(hosts.outboundBase('se.orgpuls.com', 'http')).toBe('https://se.orgpuls.com')
    // Norway's hosts are untouched, and serve their public site as before
    expect(hosts.marketOfHost('www.orgpuls.com')).toBe('no')
    expect(hosts.siteLangs('www.orgpuls.com')).toEqual(['no', 'en'])
    for (const s of hosts.SITES.filter((x) => x.market === 'no')) expect(s.publicSite, s.host).toBe(true)
  })

  it('moves with SE_HOST, as the English site moves with EN_HOST', async () => {
    vi.stubEnv('SE_HOST', 'Orgpuls.SE')
    vi.resetModules()
    const hosts = await import('@/lib/hosts')
    expect(hosts.marketOfHost('orgpuls.se')).toBe('se')
    expect(hosts.marketOfHost('se.orgpuls.com')).toBe('no')
  })
})

describe('a host without its own public site yet (D-256)', () => {
  it('sends the Norwegian site’s pages to the sign-up, serves the rest, and indexes nothing', async () => {
    const { hostGate } = await import('@/lib/hosts')
    const se = 'se.orgpuls.com'
    expect(hostGate(se, '/', true)).toEqual({ noindex: true, redirect: '/registrer' })
    expect(hostGate(se, '/priser', true)).toEqual({ noindex: true, redirect: '/registrer' })
    expect(hostGate(se, '/artikler/medarbeiderundersokelse', true)).toEqual({ noindex: true, redirect: '/registrer' })
    for (const path of ['/registrer', '/logg-inn', '/auth/callback', '/s/abc', '/r/abc', '/inn/abc', '/bli-med/x', '/nytt-passord', '/api/sprak', '/robots.txt'])
      expect(hostGate(se, path, true), path).toEqual({ noindex: true, redirect: null })
    // the product needs a session and is not public: it passes, as everywhere
    expect(hostGate(se, '/innsikt', false)).toEqual({ noindex: true, redirect: null })
  })

  it('changes nothing on Norway’s hosts or on any other host', async () => {
    const { hostGate } = await import('@/lib/hosts')
    for (const host of ['www.orgpuls.com', 'orgpuls.com', 'localhost:3000', null])
      for (const path of ['/', '/priser', '/registrer'])
        expect(hostGate(host, path, true), `${host} ${path}`).toEqual({ noindex: false, redirect: null })
  })
})

describe('the English host, moved (X-111, UK-G, D-275)', () => {
  const sprak = (til: string) => `https://www.orgpuls.com/api/sprak?${new URLSearchParams({ l: 'en', til })}`

  it('sends a page Empvibe has to Empvibe’s, at its English address, with its query, for good', async () => {
    const { hostGate, MOVED_HOSTS } = await import('@/lib/hosts')
    expect(MOVED_HOSTS).toEqual(['en.orgpuls.com'])
    const moved = (path: string, search = '') => hostGate('en.orgpuls.com', path, true, search)
    expect(moved('/')).toEqual({ noindex: true, redirect: 'https://www.empvibe.com/', permanent: true })
    expect(moved('/plattform', '?utm_source=li')).toEqual({ noindex: true, redirect: 'https://www.empvibe.com/platform?utm_source=li', permanent: true })
    expect(moved('/priser').redirect).toBe('https://www.empvibe.com/pricing')
    expect(moved('/vilkar').redirect).toBe('https://www.empvibe.com/terms')
    expect(hostGate('EN.orgpuls.com:443', '/verneombud', true).redirect).toBe('https://www.empvibe.com/safety-representatives')
  })

  it('sends Norway’s own pages, signing in and signing up to www.orgpuls.com in English (X-111)', async () => {
    const { hostGate } = await import('@/lib/hosts')
    const moved = (path: string, pub = true, search = '') => hostGate('en.orgpuls.com', path, pub, search).redirect
    for (const path of ['/artikler/medarbeiderundersokelse', '/bygg-og-anlegg', '/maler', '/demo', '/logg-inn', '/registrer', '/nytt-passord'])
      expect(moved(path), path).toBe(sprak(path))
    expect(moved('/registrer', true, '?orgnr=922698422')).toBe(sprak('/registrer?orgnr=922698422'))
  })

  it('keeps the product, the survey, an invitation and the files at the same address on www.orgpuls.com', async () => {
    const { hostGate } = await import('@/lib/hosts')
    const moved = (path: string, pub: boolean, search = '') => hostGate('en.orgpuls.com', path, pub, search).redirect
    for (const path of ['/s/abc', '/r/abc', '/inn/abc', '/bli-med/x', '/auth/confirm', '/api/sprak', '/robots.txt', '/sitemap.xml', '/llms.txt'])
      expect(moved(path, true), path).toBe(`https://www.orgpuls.com${path}`)
    expect(moved('/innsikt', false, '?runde=1')).toBe('https://www.orgpuls.com/innsikt?runde=1')
    expect(moved('/auth/confirm', true, '?token_hash=x&type=email')).toBe('https://www.orgpuls.com/auth/confirm?token_hash=x&type=email')
  })

  it('is no site: nothing signs up into a market there, and no link is made with its address', async () => {
    const { marketOfHost, outboundBase, PUBLIC_HOSTS } = await import('@/lib/hosts')
    expect(marketOfHost('en.orgpuls.com')).toBe('no')
    expect(outboundBase('en.orgpuls.com', 'https')).toBe('https://www.orgpuls.com')
    expect(PUBLIC_HOSTS).not.toContain('en.orgpuls.com')
  })
})

describe('a host reserved for a market not open yet (X-110, D-258)', () => {
  it('sends every address on de.orgpuls.com where an English reader goes, for now, and indexes nothing', async () => {
    const { hostGate, RESERVED_HOSTS, siteOf, marketOfHost } = await import('@/lib/hosts')
    expect(RESERVED_HOSTS).toEqual(['de.orgpuls.com'])
    expect(hostGate('de.orgpuls.com', '/', true)).toEqual({ noindex: true, redirect: 'https://www.empvibe.com/' })
    expect(hostGate('DE.orgpuls.com:443', '/priser', true)).toEqual({ noindex: true, redirect: 'https://www.empvibe.com/pricing' })
    expect(hostGate('de.orgpuls.com', '/innsikt', false)).toEqual({ noindex: true, redirect: 'https://www.orgpuls.com/innsikt' })
    expect(hostGate('de.orgpuls.com', '/registrer', true).redirect).toBe(
      `https://www.orgpuls.com/api/sprak?${new URLSearchParams({ l: 'en', til: '/registrer' })}`,
    )
    // no site, so no market to sign up into: a spoofed header still reads as Norway, and the gate stops it first
    expect(siteOf('de.orgpuls.com')).toBeNull()
    expect(marketOfHost('de.orgpuls.com')).toBe('no')
  })
})

describe('each market’s floor, as a screen offers it', () => {
  // the floors the migrations set, in order: a market's insert, then any raise
  const floors = new Map<string, number>()
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(`${DIR}/${f}`, 'utf8')
    for (const m of sql.matchAll(/insert into app\.markets\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/gi)) {
      const cols = (m[1] ?? '').split(',').map((c) => c.trim())
      const vals = (m[2] ?? '').split(',').map((v) => v.trim().replace(/^'|'$/g, ''))
      floors.set(vals[cols.indexOf('code')]!, Number(vals[cols.indexOf('k_floor')]))
    }
    for (const m of sql.matchAll(/update app\.markets set k_floor\s*=\s*(\d+) where code\s*=\s*'([a-z]{2})'/gi))
      floors.set(m[2]!, Number(m[1]))
  }

  it('keeps the time zone the migrations give it (D-273)', () => {
    const zones = new Map<string, string>()
    for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
      const sql = readFileSync(`${DIR}/${f}`, 'utf8')
      for (const m of sql.matchAll(/insert into app\.markets\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/gi)) {
        const cols = (m[1] ?? '').split(',').map((c) => c.trim())
        const vals = (m[2] ?? '').split(',').map((v) => v.trim().replace(/^'|'$/g, ''))
        zones.set(vals[cols.indexOf('code')]!, vals[cols.indexOf('timezone')]!)
      }
    }
    for (const m of MARKETS) expect(MARKET_TIME_ZONE[m], m).toBe(zones.get(m))
  })

  it('is the floor the migrations give it, and never under the platform’s', () => {
    for (const m of MARKETS) {
      expect(MARKET_K_FLOOR[m], m).toBe(floors.get(m))
      expect(MARKET_K_FLOOR[m], m).toBeGreaterThanOrEqual(K_FLOOR)
    }
  })

  it('takes the chips under it away, and leaves Norway’s as they were', () => {
    expect(thresholdChoices([3, 4, 5, 6, 8, 10], MARKET_K_FLOOR.no)).toEqual([3, 4, 5, 6, 8, 10])
    expect(thresholdChoices([3, 4, 5, 6, 8, 10], MARKET_K_FLOOR.se)).toEqual([5, 6, 8, 10])
    expect(thresholdChoices([3, 4, 5, 6, 8, 10], MARKET_K_FLOOR.gb)).toEqual([5, 6, 8, 10])
    expect(thresholdChoices([3, 4, 5, 8], 2)).toEqual([3, 4, 5, 8])
  })
})

describe('Empvibe’s site, open since the move (X-111, UK-E, UK-G, D-270, D-275)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })
  const open = async (host = '') => {
    vi.stubEnv('EMPVIBE_HOST', host)
    vi.resetModules()
    return import('@/lib/hosts')
  }

  it('is www.empvibe.com and its bare domain: Empvibe, the United Kingdom, English only, with no holding page', async () => {
    const hosts = await open()
    expect('HOLDING_HOSTS' in hosts).toBe(false)
    for (const host of ['www.empvibe.com', 'empvibe.com', 'WWW.EMPVIBE.COM:443']) {
      expect(hosts.siteOf(host)).toMatchObject({ brand: 'empvibe', market: 'gb', lang: 'en', pinned: true, url: 'https://www.empvibe.com', publicSite: true })
      expect(hosts.marketOfHost(host)).toBe('gb')
      expect(hosts.siteLangs(host)).toEqual(['en'])
      expect(hosts.outboundBase(host, 'http')).toBe('https://www.empvibe.com')
      expect(hosts.PUBLIC_HOSTS).toContain(host.toLowerCase().split(':')[0])
    }
    // Norway's and Sweden's hosts are unchanged, and have no addresses of their own
    expect(hosts.siteOf('www.orgpuls.com')?.own).toBeUndefined()
    expect(hosts.marketOfHost('se.orgpuls.com')).toBe('se')
  })

  it('moves with EMPVIBE_HOST, as the Swedish site moves with SE_HOST', async () => {
    const hosts = await open('Staging.Empvibe.com')
    expect(hosts.marketOfHost('staging.empvibe.com')).toBe('gb')
    expect(hosts.siteOf('staging.empvibe.com')?.url).toBe('https://staging.empvibe.com')
    expect(hosts.marketOfHost('www.empvibe.com')).toBe('no')
  })

  it('serves each of its pages at its English address, and the Norwegian address goes there', async () => {
    const { hostGate } = await open()
    const host = 'www.empvibe.com'
    const pages: [string, string][] = [
      ['/platform', '/plattform'],
      ['/use-cases', '/bruksomrader'],
      ['/why-empvibe', '/hvorfor'],
      ['/work-related-stress-law', '/lovkrav'],
      ['/safety-representatives', '/verneombud'],
      ['/small-businesses', '/smaa-bedrifter'],
      ['/security', '/sikkerhet'],
      ['/contact', '/kontakt'],
      ['/privacy', '/personvernerklaering'],
      ['/terms', '/vilkar'],
      ['/pricing', '/priser'],
      ['/sign-in', '/logg-inn'],
      ['/sign-up', '/registrer'],
    ]
    for (const [address, route] of pages) {
      expect(hostGate(host, address, true), address).toEqual({ noindex: false, redirect: null, rewrite: route })
      expect(hostGate(host, route, true), route).toEqual({ noindex: false, redirect: address, canonical: true })
    }
    expect(hostGate(host, '/', true)).toEqual({ noindex: false, redirect: null })
  })

  it('answers 404 for the pages written for Norway, and lets the product, the survey and the API through', async () => {
    const { hostGate, NOT_SERVED_PATH } = await open()
    const host = 'www.empvibe.com'
    const notServed = { noindex: true, redirect: null, rewrite: NOT_SERVED_PATH }
    // the industries, the articles, the templates, the demo, at either address
    for (const path of ['/bransjer', '/handel', '/bygg-og-anlegg/sporsmal', '/artikler', '/artikler/medarbeiderundersokelse', '/maler', '/demo', '/venteside'])
      expect(hostGate(host, path, true), path).toEqual(notServed)
    // the IndexNow key among the files the site answers for itself (scripts/seo/indexnow.mjs)
    const key = readdirSync('public').find((f) => /^[0-9a-f]{32}\.txt$/.test(f))!
    for (const path of ['/auth/callback', '/s/abc', '/r/abc', '/inn/abc', '/bli-med/x', '/nytt-passord', '/logo/x', '/api/sprak', '/robots.txt', '/sitemap.xml', '/llms.txt', `/${key}`])
      expect(hostGate(host, path, true), path).toEqual({ noindex: false, redirect: null })
    expect(hostGate(host, '/innsikt', false)).toEqual({ noindex: false, redirect: null })
  })

  it('draws each link at its address on the site, and reads each address back as its route', async () => {
    const { addressOf, routeOf, siteOf } = await open()
    const paths = siteOf('www.empvibe.com')!.own!.paths
    expect(addressOf(paths, '/plattform#tiltak')).toBe('/platform#tiltak')
    expect(addressOf(paths, '/registrer?orgnr=SC123456')).toBe('/sign-up?orgnr=SC123456')
    expect(addressOf(paths, '/')).toBe('/')
    expect(addressOf(paths, 'https://www.hse.gov.uk/')).toBe('https://www.hse.gov.uk/')
    expect(addressOf(paths, '#kom-i-gang')).toBe('#kom-i-gang')
    expect(routeOf(paths, '/use-cases')).toBe('/bruksomrader')
    expect(routeOf(paths, '/')).toBe('/')
    // Norway's hosts have no addresses of their own: every link is its route
    expect(addressOf(undefined, '/plattform')).toBe('/plattform')
    expect(routeOf(undefined, '/plattform')).toBe('/plattform')
    // each address belongs to one route, and none is another route's address
    expect(new Set(Object.values(paths)).size).toBe(Object.keys(paths).length)
    for (const address of Object.values(paths)) expect(Object.keys(paths), address).not.toContain(address)
  })
})

describe('the United Kingdom (X-111, D-264, D-275)', () => {
  it('is a market at floor 5 that only Empvibe’s hosts sign up into', async () => {
    const { SITES, marketOfHost } = await import('@/lib/hosts')
    expect(MARKETS).toContain('gb')
    expect(MARKET_K_FLOOR.gb).toBe(5)
    expect(SITES.filter((s) => s.market === 'gb').map((s) => s.host).sort()).toEqual(['empvibe.com', 'www.empvibe.com'])
    for (const host of ['www.orgpuls.com', 'en.orgpuls.com', 'se.orgpuls.com', 'localhost:3000']) expect(marketOfHost(host)).not.toBe('gb')
  })
})
