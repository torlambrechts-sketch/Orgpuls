import type { Brand } from '@/lib/brand'
import type { Locale } from '@/lib/i18n/locales'

/**
 * The markets the product is sold in (D-251), mirroring app.markets (0214): the rows there are the
 * source, and tests/unit/markets.test.ts holds this list to the migrations that seed them.
 *
 * A market is a country, not a language: an organisation in Norway may read the product in
 * English, and a language may serve several markets. The host a person signs up on names the
 * market (lib/hosts.ts SITES); the database gives a new organisation that market's anonymity
 * floor, language and time zone, and only the platform moves it to another market afterwards.
 *
 * Norway, Sweden since 0218 (D-254), the United Kingdom since 0222 (D-264), sold as Empvibe
 * (X-111, lib/brand.ts), and Germany since 0236 (X-115, DE-B). No host names Germany until its site
 * opens (DE-F, DE-G), so nobody can join it before then. Edge-safe.
 */
export const MARKETS = ['no', 'se', 'gb', 'de'] as const
export type Market = (typeof MARKETS)[number]

export const DEFAULT_MARKET: Market = 'no'

/**
 * Everything the code knows about a market, in one place (docs/markets/PLAN.md rule 3: «a new country
 * is rows, modules, message files and documents, never a branch in a component»). A screen asks the
 * market for what it needs (`MARKET_CONFIG[market].billing.vatNumber`), never which market it is.
 * The maps below (REGISTRY_LOOKUP, MARKET_LANGS, …), lib/brand.ts MARKET_BRAND, lib/site/pricing.ts
 * PRICE_MARKET, lib/legal/dpa.ts DPA_MARKET and lib/i18n/market-overlay.ts PACK_LANGS are read from it,
 * and the edge functions' copy (supabase/functions/_shared/markets.ts) is generated from it
 * (`npm run markets:edge`, held by tests/unit/markets-edge.test.ts).
 *
 * What the database holds as well (the floor, the language, the time zone, the organisation number
 * rule, the agreement, the invoice form) is held to the migrations by tests/unit/markets.test.ts and
 * dpa.test.ts.
 */
export type MarketConfig = {
  /** the brand its organisations, their employees and their mail read (lib/brand.ts) */
  brand: Brand
  /**
   * The languages its site offers and an organisation there may default to (D-252, D-254, D-264,
   * DE-A): bokmål and English in Norway, Swedish and English in Sweden, English in the United
   * Kingdom, German and English in Germany. An organisation already on another language keeps it on
   * offer (components/oppsett/CompanyForm.tsx).
   */
  langs: readonly Locale[]
  /**
   * The languages its legal pack is written in, messages/market/<market>/<lang>.json (D-257): none in
   * Norway, whose law the message files themselves state
   */
  packLangs: readonly Locale[]
  /**
   * Its anonymity floor as the migrations set it (app.markets.k_floor: 0214, 0218, 0222, 0236), for
   * what a screen may offer: Norway the platform's 3; Sweden, the United Kingdom and Germany 5 (X-111,
   * X-115). The database is the rule and refuses anything under it.
   */
  kFloor: number
  /** its time zone as the migrations set it (app.markets.timezone), which a new organisation in it takes */
  timeZone: string
  /**
   * Whether sign-up can look a company up in its register: Brønnøysund in Norway. Sweden's
   * Bolagsverket needs an API agreement (SE-B4), so a Swedish sign-up names its company itself and
   * the number is held to Sweden's rule (lib/org-number.ts). Companies House has a free API with a key
   * (docs/markets/uk-legal.md § 7); until it is wired, a UK sign-up names its company itself too.
   */
  registryLookup: boolean
  /**
   * Whether its law is in the product: the report, the legal texts and the duties it prints. Norway's
   * is the message files themselves; Sweden's (arbetsmiljölagen, AFS 2023:1, AFS 2023:2) its pack since
   * SE-C (D-257), the United Kingdom's (HSWA 1974, the Management Regulations 1999, HSE's Management
   * Standards) since UK-C (D-265), Germany's since DE-C (D-290). A market without one promises no
   * report for its authority at sign-up (D-256).
   */
  legalPack: boolean
  /**
   * The price list it pays by (lib/site/pricing.ts PLAN_PRICES): Norway's in kroner, the United
   * Kingdom's in pounds (X-113). Sweden and Germany pay Norway's list until their own (SE-E, DE-E).
   */
  prices: 'no' | 'gb'
  /**
   * The data processing agreement an organisation there signs (lib/legal/dpa.ts DPA_IN_FORCE): its own
   * where one is published, else Norway's. Mirrors app.dpa_market (0226), which public.sign_dpa signs by.
   */
  dpa: 'no' | 'gb'
  /**
   * What Oppsett › Betaling asks for an invoice (X-113, D-274): a VAT number, for the reverse charge,
   * and EHF e-invoicing. public.save_billing holds the same (0227); tests/unit/markets.test.ts holds
   * the two equal. Sweden and Germany keep Norway's form until their own terms (SE-E, DE-E).
   */
  billing: { vatNumber: boolean; eInvoice: boolean }
  /**
   * Its own site, where its organisations' mail, SMS, Teams and Slack lead once it is open (UK-G, D-275;
   * SE-F, D-276; DE-G): the address (lib/hosts.ts takes its host, which an environment variable may
   * override) and whether it is served. Null for Norway, reached through the product's own address.
   * Germany's is built and closed until DE-G; `DE_SITE=open` opens it for one deployment.
   */
  site: { url: string; open: boolean } | null
  /**
   * The language of an Auth mail to someone whose sign-up named none, asked for on its site (D-255,
   * D-275): English, the language its leaders read mail in until the mail exists in theirs. Null: bokmål.
   */
  authLang: 'en' | null
  /**
   * Its brand's own mail domain (UK-G, D-275): its organisations' mail is sent from it once Brevo
   * reports it authenticated; until then from the product's address under the brand's name (X-111).
   */
  mailDomain: string | null
  /**
   * A mobile number written the market's own way, without its country code (supabase/functions/_shared
   * /sms.ts): the pattern, and the prefix that replaces its leading zero. Null for Norway, whose local
   * forms (eight digits, 47 in front) are read in Norway only; a number with its country code is read
   * in every market.
   */
  phone: { mobile: string; prefix: string } | null
  /**
   * The seal on the law drawing (components/marketing/art/LawArt.tsx) and its articles: § where the law
   * is cited by section, as in Norway, Sweden (3 kap. 2 § AML) and Germany (§ 5 ArbSchG); ✓ in the
   * United Kingdom, whose law is cited by section and regulation number, never by § (D-271).
   */
  lawSeal: '§' | '✓'
  /** utm_source of the safety representative's «Tips ledelsen» e-mail link (D-246, D-271): the role's own name */
  safetyRepSource: string
}

export const MARKET_CONFIG: Readonly<Record<Market, MarketConfig>> = {
  no: {
    brand: 'orgpuls',
    langs: ['no', 'en'],
    packLangs: [],
    kFloor: 3,
    timeZone: 'Europe/Oslo',
    registryLookup: true,
    legalPack: true,
    prices: 'no',
    dpa: 'no',
    billing: { vatNumber: false, eInvoice: true },
    site: null,
    authLang: null,
    mailDomain: null,
    phone: null,
    lawSeal: '§',
    safetyRepSource: 'verneombud',
  },
  se: {
    brand: 'orgpuls',
    langs: ['sv', 'en'],
    packLangs: ['sv', 'en'],
    kFloor: 5,
    timeZone: 'Europe/Stockholm',
    registryLookup: false,
    legalPack: true,
    prices: 'no',
    dpa: 'no',
    billing: { vatNumber: false, eInvoice: true },
    site: { url: 'https://se.orgpuls.com', open: true },
    authLang: 'en',
    mailDomain: null,
    phone: { mobile: '^07[02369]\\d{7}$', prefix: '+46' },
    lawSeal: '§',
    safetyRepSource: 'skyddsombud',
  },
  gb: {
    brand: 'empvibe',
    langs: ['en'],
    packLangs: ['en'],
    kFloor: 5,
    timeZone: 'Europe/London',
    registryLookup: false,
    legalPack: true,
    prices: 'gb',
    dpa: 'gb',
    billing: { vatNumber: true, eInvoice: false },
    site: { url: 'https://www.empvibe.com', open: true },
    authLang: 'en',
    mailDomain: 'empvibe.com',
    phone: { mobile: '^07([1-57-9]\\d{8}|624\\d{6})$', prefix: '+44' },
    lawSeal: '✓',
    safetyRepSource: 'safety-representative',
  },
  de: {
    brand: 'orgpuls',
    langs: ['de', 'en'],
    packLangs: ['de', 'en'],
    kFloor: 5,
    timeZone: 'Europe/Berlin',
    registryLookup: false,
    legalPack: true,
    prices: 'no',
    dpa: 'no',
    billing: { vatNumber: false, eInvoice: true },
    site: { url: 'https://de.orgpuls.com', open: false },
    authLang: 'en',
    mailDomain: null,
    // DE-B: a mobile number begins 015, 016 or 017 and has eleven or twelve digits with its leading zero
    phone: { mobile: '^01[5-7]\\d{8,9}$', prefix: '+49' },
    lawSeal: '§',
    safetyRepSource: 'betriebsrat',
  },
}

const each = <T>(pick: (c: MarketConfig) => T): Record<Market, T> =>
  Object.fromEntries(MARKETS.map((m) => [m, pick(MARKET_CONFIG[m])])) as Record<Market, T>

/** Whether sign-up can look a company up in the market's register (MarketConfig.registryLookup) */
export const REGISTRY_LOOKUP: Record<Market, boolean> = each((c) => c.registryLookup)

/** Whether the market's law is in the product (MarketConfig.legalPack) */
export const LEGAL_PACK: Record<Market, boolean> = each((c) => c.legalPack)

/** The languages a market's site offers and an organisation there may default to (MarketConfig.langs) */
export const MARKET_LANGS: Record<Market, readonly Locale[]> = each((c) => c.langs)

/** Each market's anonymity floor as the migrations set it (MarketConfig.kFloor) */
export const MARKET_K_FLOOR: Record<Market, number> = each((c) => c.kFloor)

/**
 * Each market's time zone as the migrations set it (MarketConfig.timeZone): the clock of a page that
 * knows the market but not the organisation (lib/i18n/dates-server.ts)
 */
export const MARKET_TIME_ZONE: Record<Market, string> = each((c) => c.timeZone)

/** The problem a sign-up shows for a number the market's rule refuses: Norway's says nine digits */
export const orgNumberProblem = (market: Market): string => (market === 'no' ? 'invalid_org_number' : `invalid_org_number_${market}`)

export function isMarket(value: unknown): value is Market {
  return typeof value === 'string' && (MARKETS as readonly string[]).includes(value)
}
