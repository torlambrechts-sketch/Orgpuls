import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { marketOfHost, outboundBase, PUBLIC_HOSTS, SITES, siteOf } from '@/lib/hosts'
import { LOCALES } from '@/lib/i18n/locales'
import { DEFAULT_MARKET, isMarket, MARKET_K_FLOOR, MARKET_LANGS, MARKETS, orgNumberProblem, REGISTRY_LOOKUP } from '@/lib/markets'
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
    // Sweden (D-254): no register to ask yet, Swedish and English, its own message
    expect(REGISTRY_LOOKUP.se).toBe(false)
    expect(MARKET_LANGS.se).toEqual(['sv', 'en'])
    expect(orgNumberProblem('se')).toBe('invalid_org_number_se')
    const no = JSON.parse(readFileSync('messages/no.json', 'utf8')) as { registrer: { problem: Record<string, string> } }
    for (const m of MARKETS) expect(no.registrer.problem[orgNumberProblem(m)], m).toBeTruthy()
  })
})

describe('the Swedish site', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('does not exist until SE_HOST names it, so nobody can join Sweden before then', async () => {
    vi.stubEnv('SE_HOST', '')
    vi.resetModules()
    const hosts = await import('@/lib/hosts')
    expect(hosts.SITES.some((s) => s.market === 'se')).toBe(false)
    expect(hosts.marketOfHost('orgpuls.se')).toBe('no')
  })

  it('once named, opens in Swedish, offers Swedish and English, and signs up into Sweden', async () => {
    vi.stubEnv('SE_HOST', 'Orgpuls.SE')
    vi.resetModules()
    const hosts = await import('@/lib/hosts')
    expect(hosts.siteOf('orgpuls.se')).toMatchObject({ market: 'se', lang: 'sv', pinned: false, url: 'https://orgpuls.se' })
    expect(hosts.marketOfHost('orgpuls.se:443')).toBe('se')
    expect(hosts.siteLangs('orgpuls.se')).toEqual(['sv', 'en'])
    expect(hosts.outboundBase('orgpuls.se', 'http')).toBe('https://orgpuls.se')
    // Norway's hosts are untouched
    expect(hosts.marketOfHost('www.orgpuls.com')).toBe('no')
    expect(hosts.siteLangs('www.orgpuls.com')).toEqual(['no', 'en'])
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
    expect(thresholdChoices([3, 4, 5, 8], 2)).toEqual([3, 4, 5, 8])
  })
})
