import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRANDS, MARKET_BRAND } from '@/lib/brand'
import { DE_SITE, effectiveHost, MAIN_HOST, SITES } from '@/lib/hosts'
import { DPA_MARKET } from '@/lib/legal/dpa'
import { PACK_LANGS } from '@/lib/i18n/market-overlay'
import { MARKET_CONFIG, MARKET_LANGS, MARKETS } from '@/lib/markets'
import { beaconBody, mayCount, setBeaconSite } from '@/lib/marketing/beacon'
import { PRICE_MARKET } from '@/lib/site/pricing'
import { EDGE_MARKETS_PATH, edgeMarkets } from '@/scripts/markets/edge'
import { MARKET_BRAND_NAME, MARKET_SITE_URL, MARKET_TIME_ZONE } from '@/supabase/functions/_shared/mail'
import { normalizePhone } from '@/supabase/functions/_shared/sms'

/**
 * The market registry (lib/markets.ts MARKET_CONFIG): everything the code knows about a market, in one
 * place. The maps the rest of the code reads are its own, and the edge functions' copy is generated
 * from it, so a market is changed, or added, in one file.
 */
describe('the market registry', () => {
  it('is what every per-market map reads', () => {
    for (const m of MARKETS) {
      const c = MARKET_CONFIG[m]
      expect(MARKET_BRAND[m], m).toBe(c.brand)
      expect(PRICE_MARKET[m], m).toBe(c.prices)
      expect(DPA_MARKET[m], m).toBe(c.dpa)
      expect(PACK_LANGS[m], m).toEqual(c.packLangs)
      expect(MARKET_LANGS[m], m).toEqual(c.langs)
    }
  })

  it('names a site for every market but Norway, open where the host registry serves it', () => {
    expect(MARKET_CONFIG.no.site).toBeNull()
    for (const m of MARKETS.filter((m) => m !== 'no')) {
      const site = MARKET_CONFIG[m].site!
      expect(site, m).not.toBeNull()
      // the host registry serves an open market's site at the registry's address, and a closed one's not at all
      expect(SITES.some((s) => s.market === m && s.url === site.url), m).toBe(site.open || (m === 'de' && process.env.DE_SITE === 'open'))
    }
    expect(DE_SITE.url).toBe(MARKET_CONFIG.de.site!.url)
  })

  it('gives each site its market’s brand and languages', () => {
    for (const s of SITES) {
      expect(s.brand, s.host).toBe(MARKET_CONFIG[s.market].brand)
      expect(s.langs, s.host).toEqual(MARKET_CONFIG[s.market].langs)
    }
  })

  it('cites the law by section everywhere but the United Kingdom (D-271)', () => {
    expect(MARKETS.filter((m) => MARKET_CONFIG[m].lawSeal === '✓')).toEqual(['gb'])
  })
})

describe('the edge functions’ copy of the registry', () => {
  it(`is current: ${EDGE_MARKETS_PATH} is what npm run markets:edge writes`, () => {
    expect(readFileSync(EDGE_MARKETS_PATH, 'utf8')).toBe(edgeMarkets())
  })

  it('is what the mail reads: each market’s brand name, open site and clock', () => {
    for (const m of MARKETS) {
      expect(MARKET_BRAND_NAME[m], m).toBe(BRANDS[MARKET_CONFIG[m].brand].name)
      expect(MARKET_TIME_ZONE[m], m).toBe(MARKET_CONFIG[m].timeZone)
      const site = MARKET_CONFIG[m].site
      expect(MARKET_SITE_URL[m], m).toBe(site?.open ? site.url : undefined)
    }
  })

  it('reads a number written the market’s own way, with its country code, and Norway’s forms in Norway only', () => {
    expect(normalizePhone('07123 456789', 'gb')).toBe('+447123456789')
    expect(normalizePhone('070-123 45 67', 'se')).toBe('+46701234567')
    expect(normalizePhone('0151 23456789', 'de')).toBe('+4915123456789')
    expect(normalizePhone('+47 912 34 567', 'se')).toBe('+4791234567')
    expect(normalizePhone('912 34 567', 'se')).toBeNull()
    expect(normalizePhone('912 34 567', 'no')).toBe('+4791234567')
    expect(normalizePhone('07123 456789', 'no')).toBeNull()
  })
})

describe('the host a request is answered as', () => {
  it('is always itself on a production host, whatever the visitor chose', () => {
    for (const s of SITES) expect(effectiveHost(s.host, 'gb', false), s.host).toBe(s.host)
    expect(effectiveHost('en.orgpuls.com', 'se', false)).toBe('en.orgpuls.com')
  })

  it('is the chosen site’s on a preview or a local build, by its market', () => {
    expect(effectiveHost('localhost:3000', 'se', false)).toBe(SITES.find((s) => s.market === 'se')!.host)
    expect(effectiveHost('orgpuls-git-x.vercel.app', 'gb', false)).toBe(SITES.find((s) => s.market === 'gb')!.host)
    expect(effectiveHost('localhost:3000', 'no', false)).toBe(MAIN_HOST)
  })

  it('is itself without a choice, with one it does not know, and on any production deployment', () => {
    expect(effectiveHost('localhost:3000', null, false)).toBe('localhost:3000')
    expect(effectiveHost('localhost:3000', 'fr', false)).toBe('localhost:3000')
    expect(effectiveHost('orgpuls-git-x.vercel.app', 'se', true)).toBe('orgpuls-git-x.vercel.app')
  })
})

describe('the visit counting, told its site by the server', () => {
  it('counts on the host the server says is a production one, with the site’s own addresses', () => {
    // a preview showing Empvibe's site (?site=gb) is not counted: the server says the real host is not production
    setBeaconSite({ counted: false, paths: { '/logg-inn': '/sign-in' } })
    expect(mayCount('www.empvibe.com', '/pricing', false, '')).toBe(false)
    // Germany's site, once open, is counted although the browser's copy of the registry never sees DE_SITE
    setBeaconSite({ counted: true, paths: DE_SITE.own!.paths })
    expect(mayCount(new URL(DE_SITE.url).host, '/', false, '')).toBe(true)
    expect(mayCount(new URL(DE_SITE.url).host, '/anmelden', false, '')).toBe(false)
    expect(beaconBody({ k: 'view' }, '/', {}).k).toBe('view')
  })
})
