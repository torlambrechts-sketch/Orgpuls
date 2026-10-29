import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import gb from '@/messages/market/gb/en.json'
import en from '@/messages/en.json'
import { mergeMessages } from '@/lib/i18n/merge'
import { PLAN_MAX } from '@/lib/billing/read'
import { MARKET_CONFIG, MARKETS } from '@/lib/markets'
import { ANNUAL_MONTHS, PLAN_PRICES, PLAN_SIZES, PRICE_MARKET, planPrices, planSizes, priceDigits, yearly } from '@/lib/site/pricing'
import { EMPVIBE_PAGES } from '@/lib/hosts'
import { OWN_FOOTERS, OWN_NAV } from '@/lib/site/nav'
import { ORGPULS_LD, software } from '@/lib/marketing/schema'
import { vatNumberAsStored } from '@/lib/billing/vat'

/**
 * Invoicing an organisation in the United Kingdom (UK-F3, X-113, D-274): pounds, the reverse charge,
 * a VAT number where Norway has EHF. What would go wrong silently, and is held here:
 *
 *  - a UK organisation shown kroner, or a Norwegian one pounds;
 *  - the UK list drifting from what the owner decided, or Norway's /priser from Norway's list;
 *  - the screen saying VAT is added, or naming an organisation number, to a UK customer;
 *  - the database accepting a VAT number the form never could, or the reverse.
 */
describe('the price lists (X-113)', () => {
  it('charges each market by its own list, Sweden by Norway’s until SE-E', () => {
    for (const market of MARKETS) expect(PRICE_MARKET[market], market).toBeDefined()
    expect(planPrices('no')).toBe(PLAN_PRICES.no)
    expect(planPrices('se')).toBe(PLAN_PRICES.no)
    expect(planPrices('gb')).toBe(PLAN_PRICES.gb)
  })

  it('is £25 and £55 a month in the United Kingdom, and a year at ten months', () => {
    expect(PLAN_PRICES.gb).toEqual({ currency: 'GBP', small: 25, usual: 55 })
    expect(ANNUAL_MONTHS).toBe(10)
  })

  it('keeps Norway’s /priser on Norway’s list, and the plans’ sizes as billing refuses them', () => {
    expect(PLAN_SIZES.map((p) => p.monthly)).toEqual([PLAN_PRICES.no.small, PLAN_PRICES.no.usual, null])
    expect(PLAN_SIZES.map((p) => p.max)).toEqual([PLAN_MAX.small, PLAN_MAX.usual, Number.POSITIVE_INFINITY])
  })
})

describe('Oppsett › Betaling in the United Kingdom', () => {
  const billing = gb.oppsett.billing as unknown as Record<string, string>

  it('words its amounts in pounds', () => {
    expect(billing.kroner).toBe('£{n}')
    expect(billing.yearPerMonth).toMatch(/£\{price\}/)
  })

  it('names a company number, not an organisation number', () => {
    expect(billing.planLead).toMatch(/company number \{orgnr\}/)
    expect(billing.planLead).not.toMatch(/org\. no\./)
  })

  it('says the customer accounts for UK VAT under the reverse charge, in either case', () => {
    for (const key of ['terms', 'termsAfterTrial']) expect(billing[key], key).toMatch(/reverse charge/)
  })
})

describe('the VAT number (0227)', () => {
  const migration = readFileSync('supabase/migrations/0227_billing_gb.sql', 'utf8')
  const rule = new RegExp(migration.match(/vat_number ~ '([^']+)'/)![1]!)

  it('is stored as HMRC writes it: GB and nine digits, twelve for a branch, GD or HA and three', () => {
    for (const ok of ['GB123456789', 'GB123456789012', 'GBGD001', 'GBHA500']) expect(rule.test(ok), ok).toBe(true)
    for (const no of ['123456789', 'GB12345', 'XI123456789', 'NO922698422MVA', 'gb123456789']) expect(rule.test(no), no).toBe(false)
  })

  it('reads back in the form as the database stores it', () => {
    for (const [typed, stored] of [[' 123 4567 89 ', 'GB123456789'], ['gb123.456.789', 'GB123456789'], ['123456789012', 'GB123456789012'], ['GBGD001', 'GBGD001']]) {
      expect(vatNumberAsStored(typed!), typed).toBe(stored)
      expect(rule.test(vatNumberAsStored(typed!)), typed).toBe(true)
    }
  })

  it('is drawn where the market registry asks for one, where EHF is drawn elsewhere', () => {
    const tab = readFileSync('components/oppsett/BillingTab.tsx', 'utf8')
    expect(tab).toMatch(/const \{ vatNumber \} = MARKET_CONFIG\[market\]\.billing/)
    expect(tab).toMatch(/vat=\{\s*vatNumber/)
    // a market's invoice asks for a VAT number or offers EHF, never both (BillingForms draws one or the other)
    for (const m of MARKETS) expect(MARKET_CONFIG[m].billing.eInvoice, m).toBe(!MARKET_CONFIG[m].billing.vatNumber)
  })

  it('is accepted by the database for the markets the registry asks it of, and no others (save_billing, 0227)', () => {
    // every market the function names is the one that takes a VAT number and refuses EHF
    const named = new Set([...migration.matchAll(/v_market (?:is distinct from|=) '([a-z]{2})'/g)].map((m) => m[1]))
    expect(named).toEqual(new Set(MARKETS.filter((m) => MARKET_CONFIG[m].billing.vatNumber)))
  })
})

describe('the price page on Empvibe’s site (UK-G, D-275)', () => {
  // what the page shows: the gb pack over English (lib/i18n/merge.ts), the pack holding only what differs
  const pris = (mergeMessages(en, gb).site as Record<string, unknown>).pris as { plans: { price: string }[]; included: { sizes: { price: string }[] }; free: { price: string } }

  it('draws the United Kingdom’s list, as Oppsett › Betaling charges it', () => {
    expect(planSizes('gb').map((s) => s.monthly)).toEqual([PLAN_PRICES.gb.small, PLAN_PRICES.gb.usual, null])
    expect(pris.plans.map((p) => p.price)).toEqual([`£${PLAN_PRICES.gb.small}`, `£${PLAN_PRICES.gb.usual}`, 'By agreement'])
    expect(pris.included.sizes.map((s) => s.price)).toEqual([`£${PLAN_PRICES.gb.small} per month`, `£${PLAN_PRICES.gb.usual} per month`, 'By agreement'])
    expect(pris.free.price).toBe('£0')
  })

  it('says a year as a month to the penny in pounds, in whole kroner in Norway', () => {
    expect(priceDigits('gb')).toBe(2)
    expect(priceDigits('no')).toBe(0)
    expect(yearly(PLAN_PRICES.gb.small, priceDigits('gb')).perMonth).toBe(20.83)
    expect(yearly(PLAN_PRICES.gb.usual, priceDigits('gb')).perMonth).toBe(45.83)
    expect(yearly(PLAN_PRICES.no.small).perMonth).toBe(221)
    expect(yearly(PLAN_PRICES.no.usual).perMonth).toBe(471)
  })

  it('leaves Norway’s page on Norway’s list, size for size', () => {
    expect(planSizes('no')).toEqual(PLAN_SIZES.map((s) => ({ ...s })))
    expect(planSizes('se')).toEqual(planSizes('no'))
  })

  it('is served at /pricing and named in the site’s menu and footer', () => {
    expect(EMPVIBE_PAGES as readonly string[]).toContain('/priser')
    expect(OWN_NAV.map((i) => i.href)).toContain('/priser')
    expect(OWN_FOOTERS.home.flatMap((c) => c.links.map((l) => l.href))).toContain('/priser')
  })

  it('tells a search engine the prices in the site’s currency, at the site’s address', () => {
    const site = { ...ORGPULS_LD, url: 'https://www.empvibe.com', absolute: (p: string) => `https://www.empvibe.com${p === '/priser' ? '/pricing' : p}`, offers: { prices: PLAN_PRICES.gb, names: { free: 'Free', small: 'Small', usual: 'Usual' } } }
    const offers = software('x', site).offers as { url: string; priceCurrency?: string; priceSpecification?: { price: string; priceCurrency: string } }[]
    expect(offers.every((o) => (o.priceCurrency ?? o.priceSpecification?.priceCurrency) === 'GBP')).toBe(true)
    expect(offers.map((o) => o.priceSpecification?.price ?? '0')).toEqual(['0', '25', '55', '250', '550'])
    expect(new Set(offers.map((o) => o.url))).toEqual(new Set(['https://www.empvibe.com/pricing']))
    // Norway's, as before
    const no = software('x').offers as { priceCurrency?: string; priceSpecification?: { price: string; priceCurrency: string } }[]
    expect(no.map((o) => o.priceSpecification?.price ?? '0')).toEqual(['0', '265', '565', '2650', '5650'])
  })
})
