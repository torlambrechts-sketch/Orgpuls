import type { Market } from '@/lib/markets'

/**
 * Each market's price list: a month of each plan, excluding VAT, in the market's currency. Norway's
 * in kroner (D-190); the United Kingdom's in pounds, decided by the owner (X-113): Small £25, Usual
 * £55, Several companies by agreement. The database stores a plan and an interval, never an amount
 * (0227); these are the numbers Oppsett › Betaling shows and the UK terms state, which
 * tests/unit/uk-site.test.ts holds to this list. Sweden is invoiced as Norway until its own (SE-E).
 */
export const PLAN_PRICES = {
  no: { currency: 'NOK', small: 265, usual: 565 },
  gb: { currency: 'GBP', small: 25, usual: 55 },
} as const
export type PriceList = (typeof PLAN_PRICES)[keyof typeof PLAN_PRICES]

/** Which list an organisation in each market pays by */
export const PRICE_MARKET: Record<Market, keyof typeof PLAN_PRICES> = { no: 'no', se: 'no', gb: 'gb', de: 'no' }

export const planPrices = (market: Market): PriceList => PLAN_PRICES[PRICE_MARKET[market]]

/**
 * The three plans as /priser sizes them (D-190), the numbers billing keeps: Liten up to 25
 * employees at 265 kr a month, Vanlig up to 100 at 565 kr, Flere selskaper by agreement at any size
 * (supabase/migrations/0048_billing.sql, `save_billing` refuses a plan below the headcount). The
 * page's words are `site.pris`; these are the numbers its size read-out computes with: Norway's list,
 * since /priser is Norway's page.
 */
export const PLAN_SIZES = [
  { key: 'small', max: 25, monthly: PLAN_PRICES.no.small },
  { key: 'usual', max: 100, monthly: PLAN_PRICES.no.usual },
  { key: 'group', max: Infinity, monthly: null },
] as const

/**
 * The three plans with a market's prices: /priser on Norway's site, /pricing on Empvibe's (UK-G,
 * D-275), and the price list a signed-in organisation's market pays by wherever it reads the page,
 * as its words are that market's too (lib/i18n/request.ts).
 */
export const planSizes = (market: Market) => {
  const prices = planPrices(market)
  return PLAN_SIZES.map((s) => ({ ...s, monthly: s.key === 'group' ? null : prices[s.key] }))
}
export type PlanSize = ReturnType<typeof planSizes>[number]

/**
 * A year costs this many months' price: two months free (0201, D-217). app.annual_months() is the
 * same number in the database, and Oppsett › Betaling reads it through lib/billing/read.
 */
export const ANNUAL_MONTHS = 10

/**
 * A plan's yearly price, and that price as a month: in whole kroner, or to the penny (`digits` 2),
 * where a whole pound would be a different price (£250 a year is £20.83 a month, not £21)
 */
export const yearly = (monthly: number, digits = 0) => {
  const perMonth = (monthly * ANNUAL_MONTHS) / 12
  return { year: monthly * ANNUAL_MONTHS, perMonth: digits ? Number(perMonth.toFixed(digits)) : Math.round(perMonth) }
}

/** The decimals a market's amounts per month and per head are shown with: none in kroner, pence in pounds */
export const priceDigits = (market: Market) => (planPrices(market).currency === 'NOK' ? 0 : 2)

/** The read-out's range (the design's slider) and where it starts */
export const SIZE_RANGE = { min: 1, max: 150, start: 18 } as const

/** Which plan a headcount fits: 0 Liten, 1 Vanlig, 2 Flere selskaper */
export const fitOf = (n: number) => PLAN_SIZES.findIndex((p) => n <= p.max)
