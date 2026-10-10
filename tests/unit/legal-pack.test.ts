import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { committeeDuty, factorLawRef, healthServiceDuty, LEGAL_PACKS } from '@/lib/legal/pack'
import { PACK_LANGS, packLang } from '@/lib/i18n/market-overlay'
import { MARKET_K_FLOOR, MARKETS, REGISTRY_LOOKUP, type Market } from '@/lib/markets'

/**
 * Each market's legal pack (SE-C, D-257). The message files state Norway's law; an organisation in
 * another market reads its own market's pack over them (lib/i18n/market-overlay.ts). What would go
 * wrong silently, and is held here:
 *
 *  - a text that states Norwegian law with no counterpart in a market's pack, which a Swedish
 *    manager would then read as though it were the law that binds them;
 *  - a key the structure names (lib/legal/pack.ts) with no text, shown as `namespace.key`;
 *  - a key in a pack that nothing reads, which is a text nobody reviews;
 *  - a factor without its legal reference in the market.
 */
type Tree = { [k: string]: unknown }
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Tree
const flat = (tree: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> => {
  if (typeof tree === 'string') out[prefix] = tree
  else if (tree && typeof tree === 'object' && !Array.isArray(tree))
    for (const [k, v] of Object.entries(tree)) flat(v, prefix ? `${prefix}.${k}` : k, out)
  else if (Array.isArray(tree)) tree.forEach((v, i) => flat(v, `${prefix}.${i}`, out))
  return out
}

const no = flat(read('messages/no.json'))
const en = flat(read('messages/en.json'))
const pack = (market: Market, lang: string) => flat(read(`messages/market/${market}/${lang}.json`))

/** What states Norwegian law, names its bodies or its register */
const NORWEGIAN_LAW =
  /Arbeidstilsynet|arbeidsmiljøloven|\baml\b|§|\bAMU\b|arbeidsmiljøutvalg|forskrift|internkontroll|Brønnøysund|norske|Norge|Lovdata|bedriftshelse|\bBHT\b|STAMI|Datatilsynet|kontrolltiltak|kap(ittel|\.) 2A/i

/**
 * Where a Norwegian legal text is not a market's to replace, and why. Each is a place an
 * organisation in another market does not reach, or a document of its own phase.
 */
const NOT_IN_PACK: { prefix: string; why: string }[] = [
  { prefix: 'site.', why: 'the public site: a host without its own site redirects its pages to sign-up (D-256); a market with a site of its own carries its words in its pack, held by tests/unit/uk-site.test.ts (Empvibe, D-271); SE-F writes Sweden’s' },
  { prefix: 'seo.', why: 'the public site’s articles and landing pages, as site.' },
  { prefix: 'start.faq.', why: 'the public site’s questions (components/marketing/PageView.tsx), as site.' },
  { prefix: 'start.finalBody', why: 'the public site’s closing band, as site.' },
  { prefix: 'start.plan.small.item.', why: 'the public price page’s plan list (components/marketing/Plans.tsx); Oppsett › Betaling reads only names and prices' },
  { prefix: 'demo.', why: 'the demo is Demobedriften AS, a Norwegian company, on the Norwegian site' },
  { prefix: 'dpa.', why: 'the data processing agreement is a signed document with its own version and hash (0047); the Swedish PUB-avtal is SE-E' },
]

/**
 * The register lookup's own texts: shown only where the market has a register to ask (lib/markets.ts
 * REGISTRY_LOOKUP). Sign-up, Oppsett and the wizard say the `…Manual` texts instead (D-254).
 */
const REGISTRY_ONLY = [
  'registrer.step1Lead', 'registrer.orgNumberHint', 'registrer.foundHead', 'registrer.reassure1',
  'oppsett.selskap.fetch', 'oppsett.industry.registeredUnknown', 'oppsett.industry.changed',
  'veiviser.org.fetch', 'veiviser.org.fetched', 'veiviser.org.problem.unreachable',
]
/** The health service card's verdicts for a trade on the list: never shown where the law has no list */
const INDUSTRY_LIST_ONLY = ['oppsett.duty.bhtRequired', 'oppsett.duty.bhtUnknown']
const inPackScope = (market: Market, key: string) =>
  !NOT_IN_PACK.some((n) => key.startsWith(n.prefix)) &&
  (REGISTRY_LOOKUP[market] || !REGISTRY_ONLY.includes(key)) &&
  (LEGAL_PACKS[market].duties.healthServiceIndustries !== null || !INDUSTRY_LIST_ONLY.includes(key))

/** The keys a market's structure names, under their namespaces (lib/legal/pack.ts) */
function structureKeys(market: Market): string[] {
  const p = LEGAL_PACKS[market]
  return [
    ...p.provisions.flatMap((k) => [`oppsett.regelverk.legal.${k}.ref`, `oppsett.regelverk.legal.${k}.what`]),
    ...p.coverage.flatMap((c) => [`oppsett.regelverk.cover.${c.key}.ref`, ...(c.factors.length ? [] : [`oppsett.regelverk.cover.${c.key}.where`])]),
    ...p.gaps.map((g) => `oppsett.regelverk.gap.${g}`),
  ]
}

const norwayOnly = new Set(structureKeys('no'))
const FACTORS = [...new Set(Object.keys(no).filter((k) => /^factor\.[a-z]+\.label$/.test(k)).map((k) => k.split('.')[1]!))]
const PACKED = MARKETS.filter((m) => PACK_LANGS[m].length > 0)

describe('Norway', () => {
  it('reads its law from the message files and the database', () => {
    expect(PACK_LANGS.no).toEqual([])
    expect(LEGAL_PACKS.no.factorLawRefs).toBeNull()
    expect(factorLawRef('no', 'ytring', 'aml. § 4-3 · § 2A')).toBe('aml. § 4-3 · § 2A')
  })

  it('names only keys both its languages have', () => {
    for (const key of structureKeys('no')) {
      expect(no[key], key).toBeTruthy()
      expect(en[key], key).toBeTruthy()
    }
  })

  it('keeps the duties the design computes (D-33)', () => {
    expect(LEGAL_PACKS.no.duties).toMatchObject({ rep: 5, committee: 30, committeeMay: 10 })
    expect([9, 10, 29, 30].map((n) => committeeDuty('no', n))).toEqual(['none', 'may', 'may', 'required'])
    expect(healthServiceDuty('no', '43.210')).toBe('required')
    expect(healthServiceDuty('no', '62.010')).toBe('depends')
    expect(healthServiceDuty('no', null)).toBe('unknown')
  })
})

describe.each(PACKED)('the %s pack', (market) => {
  const langs = PACK_LANGS[market]

  it.each(langs)('exists in %s', (lang) => {
    expect(existsSync(`messages/market/${market}/${lang}.json`)).toBe(true)
  })

  it.each(langs)('in %s, replaces every text that states Norwegian law', (lang) => {
    const own = pack(market, lang)
    const missing = Object.entries(no)
      // Norway's own structure (its provisions, its coverage rows) is not shown where the market names its own
      .filter(([k, v]) => inPackScope(market, k) && NORWEGIAN_LAW.test(v) && (!norwayOnly.has(k) || structureKeys(market).includes(k)))
      .map(([k]) => k)
      .filter((k) => !(k in own))
    expect(missing).toEqual([])
  })

  it.each(langs)('in %s, offers no threshold under the market’s floor', (lang) => {
    // Norway's texts say a small team may go down to three; where the floor is higher they must not.
    // Oppsett's own note is chosen in code by the floor (oppsett.terskel.floorNoteAt, D-254)
    if (MARKET_K_FLOOR[market] <= 3) return
    const own = pack(market, lang)
    const missing = Object.entries(no)
      .filter(([k, v]) => inPackScope(market, k) && k !== 'oppsett.terskel.floorNote' && /ned til tre|gulvet er tre|fire eller tre/i.test(v))
      .map(([k]) => k)
      .filter((k) => !(k in own))
    expect(missing).toEqual([])
  })

  it.each(langs)('in %s, states no Norwegian law of its own', (lang) => {
    const stated = Object.entries(pack(market, lang))
      .filter(([, v]) => /Arbeidstilsynet|arbeidsmiljøloven|\baml\.|Brønnøysund|forskrift/i.test(v))
      .map(([k]) => k)
    expect(stated).toEqual([])
  })

  it.each(langs)('in %s, has every key its structure names', (lang) => {
    const own = pack(market, lang)
    expect(structureKeys(market).filter((k) => !own[k])).toEqual([])
  })

  it('names register texts that sign-up, Oppsett and the wizard still have', () => {
    for (const key of REGISTRY_ONLY) expect(no[key], key).toBeTruthy()
  })

  it.each(langs)('in %s, carries nothing a screen does not read', (lang) => {
    const named = new Set(structureKeys(market))
    // the public site's words are read by the market's own site, and checked page by page there (tests/unit/uk-site.test.ts)
    const site = (k: string) => /^(site|seo|start)\./.test(k)
    expect(Object.keys(pack(market, lang)).filter((k) => !(k in no) && !named.has(k) && !site(k))).toEqual([])
  })

  it('gives every factor its legal reference in the market', () => {
    const refs = LEGAL_PACKS[market].factorLawRefs
    expect(refs).not.toBeNull()
    expect(FACTORS.length).toBe(11)
    expect(FACTORS.filter((f) => !refs?.[f])).toEqual([])
    for (const f of FACTORS) expect(factorLawRef(market, f, 'database'), f).toBe(refs![f])
  })

  it('maps the law’s named factors onto factors the instrument has', () => {
    for (const row of LEGAL_PACKS[market].coverage) for (const f of row.factors) expect(FACTORS, `${row.key} → ${f}`).toContain(f)
  })

  it('is read in the nearest language it is written in', () => {
    for (const lang of langs) expect(packLang(market, lang)).toBe(lang)
    // Norwegian and the survey-only languages read the English pack: never Norway's law
    expect(packLang(market, 'no')).toBe('en')
    expect(packLang(market, 'pl')).toBe('en')
  })
})

describe('Sweden’s duties', () => {
  it('starts a skyddsombud at five and a skyddskommitté at fifty, or when the employees ask (AML 6 kap. 2 §, 8 §)', () => {
    expect(LEGAL_PACKS.se.duties).toMatchObject({ rep: 5, committee: 50, committeeMay: 1 })
    expect([1, 49, 50].map((n) => committeeDuty('se', n))).toEqual(['may', 'may', 'required'])
  })

  it('never says a health service is required by the industry: Swedish law has no list (AML 3 kap. 2 c §)', () => {
    expect(healthServiceDuty('se', '43.210')).toBe('depends')
    expect(healthServiceDuty('se', null)).toBe('depends')
  })
})

describe('the United Kingdom’s duties (docs/markets/uk-legal.md § 5)', () => {
  it('starts no representative and no committee by headcount: a committee only when two union representatives ask (SRSC reg 9)', () => {
    expect(LEGAL_PACKS.gb.duties.rep).toBe(Number.POSITIVE_INFINITY)
    expect([1, 49, 50, 5000].map((n) => committeeDuty('gb', n))).toEqual(['may', 'may', 'may', 'may'])
  })

  it('never says a health service is required by the industry: UK law has no list, only competent assistance (MHSWR reg 7)', () => {
    expect(healthServiceDuty('gb', '43.210')).toBe('depends')
    expect(healthServiceDuty('gb', null)).toBe('depends')
  })

  it('cites the risk assessment for every factor, and HSE’s Management Standards as guidance beside it', () => {
    for (const ref of Object.values(LEGAL_PACKS.gb.factorLawRefs ?? {})) expect(ref).toMatch(/^MHSWR reg 3( · HSE: [A-Z][a-z]+)?$/)
  })

  it('promises no module that is not built', () => {
    const own = pack('gb', 'en')
    expect(Object.entries(own).filter(([, v]) => /\bwill cover\b|Indicator Tool/i.test(v)).map(([k]) => k)).toEqual([])
  })
})
