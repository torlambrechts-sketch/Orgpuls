import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import gb from '@/messages/market/gb/en.json'
import { PLAN_MAX } from '@/lib/billing/read'
import { MARKETS } from '@/lib/markets'
import { ANNUAL_MONTHS, PLAN_PRICES, PLAN_SIZES, PRICE_MARKET, planPrices } from '@/lib/site/pricing'
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

  it('is drawn only for a UK organisation, where EHF is drawn for Norway', () => {
    const tab = readFileSync('components/oppsett/BillingTab.tsx', 'utf8')
    expect(tab).toMatch(/const uk = market === 'gb'/)
    expect(tab).toMatch(/vat=\{\s*uk/)
  })
})
