import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { marketOfHost, outboundBase, PUBLIC_HOSTS, SITES, siteOf } from '@/lib/hosts'
import { LOCALES } from '@/lib/i18n/locales'
import { PACK_LANGS } from '@/lib/i18n/market-overlay'
import { DEFAULT_MARKET, isMarket, LEGAL_PACK, MARKET_K_FLOOR, MARKET_LANGS, MARKETS, orgNumberProblem, REGISTRY_LOOKUP } from '@/lib/markets'
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

  it('keeps today’s behaviour: the English host pins English, the main hosts open in Norwegian', () => {
    expect(siteOf('en.orgpuls.com')).toMatchObject({ lang: 'en', pinned: true, market: 'no' })
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
    for (const host of ['www.orgpuls.com', 'orgpuls.com', 'en.orgpuls.com', 'localhost:3000', null])
      for (const path of ['/', '/priser', '/registrer'])
        expect(hostGate(host, path, true), `${host} ${path}`).toEqual({ noindex: false, redirect: null })
  })
})

describe('a host reserved for a market not open yet (X-110, D-258)', () => {
  it('sends every address on de.orgpuls.com to the same one on the English site, and indexes nothing', async () => {
    const { hostGate, RESERVED_HOSTS, siteOf, marketOfHost } = await import('@/lib/hosts')
    expect(Object.keys(RESERVED_HOSTS).sort()).toEqual(['de.orgpuls.com'])
    for (const [path, pub] of [['/', true], ['/priser', true], ['/registrer', true], ['/logg-inn', true], ['/robots.txt', true], ['/innsikt', false]] as const)
      expect(hostGate('de.orgpuls.com', path, pub), path).toEqual({ noindex: true, redirect: `https://en.orgpuls.com${path}` })
    expect(hostGate('DE.orgpuls.com:443', '/', true).redirect).toBe('https://en.orgpuls.com/')
    // no site, so no market to sign up into: a spoofed header still reads as Norway, and the gate stops it first
    expect(siteOf('de.orgpuls.com')).toBeNull()
    expect(marketOfHost('de.orgpuls.com')).toBe('no')
  })
})

describe('a brand’s host before its site opens (X-111, D-269)', () => {
  it('shows Empvibe’s holding page at every address on empvibe.com, in English, and indexes nothing', async () => {
    const { hostGate, HOLDING_HOSTS, HOLDING_PATH, holdingOf, siteOf, RESERVED_HOSTS } = await import('@/lib/hosts')
    expect(Object.keys(HOLDING_HOSTS).sort()).toEqual(['empvibe.com', 'www.empvibe.com'])
    for (const host of ['empvibe.com', 'www.empvibe.com', 'WWW.Empvibe.com:443']) {
      expect(holdingOf(host)).toEqual({ brand: 'empvibe', lang: 'en' })
      // never the Orgpuls site: no redirect to it, and no sign-up or sign-in in its place
      for (const [path, pub] of [['/', true], ['/priser', true], ['/registrer', true], ['/logg-inn', true], ['/s/abc', true], ['/innsikt', false]] as const)
        expect(hostGate(host, path, pub), `${host}${path}`).toEqual({ noindex: true, redirect: null, rewrite: HOLDING_PATH })
      // robots.txt is answered there, and disallows everything (app/robots.ts)
      expect(hostGate(host, '/robots.txt', true)).toEqual({ noindex: true, redirect: null })
      expect(siteOf(host)).toBeNull()
      expect(RESERVED_HOSTS[host.toLowerCase().split(':')[0]!]).toBeUndefined()
    }
    // the holding page's address is nothing on Orgpuls's hosts
    expect(holdingOf('www.orgpuls.com')).toBeNull()
    expect(hostGate('www.orgpuls.com', HOLDING_PATH, true)).toEqual({ noindex: false, redirect: null })
  })

  it('names Empvibe in each language and never Orgpuls', async () => {
    for (const lang of ['no', 'en', 'sv']) {
      const m = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')) as { holding: Record<string, string> }
      expect(Object.keys(m.holding).sort(), lang).toEqual(['lead', 'note', 'title'])
      expect(m.holding.title, lang).toContain('{brand}')
      expect(JSON.stringify(m.holding), lang).not.toMatch(/orgpuls/i)
    }
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

describe('Empvibe’s site, built behind the holding page (X-111, UK-E, D-270)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })
  const open = async (host = '') => {
    vi.stubEnv('EMPVIBE_SITE', 'open')
    vi.stubEnv('EMPVIBE_HOST', host)
    vi.resetModules()
    return import('@/lib/hosts')
  }

  it('is not open unless EMPVIBE_SITE=open: no site row, the holding page, nobody signs up into the United Kingdom', async () => {
    vi.stubEnv('EMPVIBE_SITE', '')
    vi.resetModules()
    const hosts = await import('@/lib/hosts')
    expect(hosts.EMPVIBE_OPEN).toBe(false)
    expect(hosts.SITES.filter((s) => s.market === 'gb')).toEqual([])
    expect(Object.keys(hosts.HOLDING_HOSTS).sort()).toEqual(['empvibe.com', 'www.empvibe.com'])
    expect(hosts.marketOfHost('www.empvibe.com')).toBe('no')
    expect(hosts.hostGate('www.empvibe.com', '/platform', true).rewrite).toBe(hosts.HOLDING_PATH)
  })

  it('once open, is www.empvibe.com and its bare domain: Empvibe, the United Kingdom, English only', async () => {
    const hosts = await open()
    expect(hosts.HOLDING_HOSTS).toEqual({})
    for (const host of ['www.empvibe.com', 'empvibe.com', 'WWW.EMPVIBE.COM:443']) {
      expect(hosts.siteOf(host)).toMatchObject({ brand: 'empvibe', market: 'gb', lang: 'en', pinned: true, url: 'https://www.empvibe.com', publicSite: true })
      expect(hosts.marketOfHost(host)).toBe('gb')
      expect(hosts.siteLangs(host)).toEqual(['en'])
      expect(hosts.outboundBase(host, 'http')).toBe('https://www.empvibe.com')
    }
    // Norway's and Sweden's hosts are unchanged, and have no addresses of their own
    expect(hosts.siteOf('www.orgpuls.com')?.own).toBeUndefined()
    expect(hosts.siteOf('en.orgpuls.com')).toMatchObject({ brand: 'orgpuls', market: 'no', lang: 'en' })
    expect(hosts.marketOfHost('se.orgpuls.com')).toBe('se')
  })

  it('moves with EMPVIBE_HOST, as the English site moves with EN_HOST', async () => {
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
    // the industries, the articles, the templates, the demo; the prices, the privacy notice and the
    // terms until UK-F (D-272), at either address
    for (const path of ['/bransjer', '/handel', '/bygg-og-anlegg/sporsmal', '/artikler', '/artikler/medarbeiderundersokelse', '/maler', '/demo', '/priser', '/pricing', '/venteside', '/personvernerklaering', '/privacy', '/vilkar', '/terms'])
      expect(hostGate(host, path, true), path).toEqual(notServed)
    for (const path of ['/auth/callback', '/s/abc', '/r/abc', '/inn/abc', '/bli-med/x', '/nytt-passord', '/logo/x', '/api/sprak', '/robots.txt', '/sitemap.xml', '/llms.txt'])
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

describe('the United Kingdom (X-111, D-264)', () => {
  it('is a market at floor 5 that no host signs up into until its site is built', async () => {
    const { SITES, marketOfHost } = await import('@/lib/hosts')
    expect(MARKETS).toContain('gb')
    expect(MARKET_K_FLOOR.gb).toBe(5)
    expect(SITES.filter((s) => s.market === 'gb')).toEqual([])
    for (const host of ['empvibe.com', 'www.empvibe.com', 'en.orgpuls.com']) expect(marketOfHost(host)).not.toBe('gb')
  })
})
