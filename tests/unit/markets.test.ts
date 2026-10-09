import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { marketOfHost, outboundBase, PUBLIC_HOSTS, SITES, siteOf } from '@/lib/hosts'
import { LOCALES } from '@/lib/i18n/locales'
import { DEFAULT_MARKET, isMarket, MARKETS } from '@/lib/markets'
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
