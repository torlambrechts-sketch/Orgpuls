import type { Market } from '@/lib/markets'

/**
 * The shape of each market's law, where it is a rule rather than a text (SE-C, D-257). The texts
 * are the market's pack of messages (lib/i18n/market-overlay.ts); this is what decides which of
 * them a screen shows: the headcounts a duty starts at, the provisions Oppsett › Regelverk lists,
 * how the law's named factors map onto the instrument, and each factor's legal reference.
 *
 * Data, as a market is (docs/markets/PLAN.md rule 3): a screen reads its market's row and never
 * asks which country it is in. Each key named here is a message under the namespace its comment
 * gives, in the language files for Norway and in the market's pack for every other market;
 * tests/unit/legal-pack.test.ts holds every one to existing. Edge-safe and pure.
 *
 * The Swedish citations are recorded with their sources in docs/markets/se-legal.md, the United
 * Kingdom's in docs/markets/uk-legal.md.
 */
export type LegalPack = {
  duties: {
    /** headcount from which a safety representative is required: verneombud, skyddsombud */
    rep: number
    /** from which a joint committee is required: AMU, skyddskommitté */
    committee: number
    /** from which one may be demanded (oppsett.duty.amuMay); at or above `committee` it is required */
    committeeMay: number
    /**
     * The NACE divisions in which an occupational health service is required by the industry alone,
     * or null where the law has no such list and the duty follows from the risks (Sweden, AML 3 kap.
     * 2 c §): then the card says it depends, never that it is required.
     */
    healthServiceIndustries: readonly string[] | null
  }
  /** Oppsett › Regelverk, the provisions the product answers to: oppsett.regelverk.legal.<key>.{ref,what} */
  provisions: readonly string[]
  /**
   * The factors the law names, each against the instrument's factors that measure it:
   * oppsett.regelverk.cover.<key>.{ref,where}. An empty list is one the instrument screens for
   * rather than measures, and shows «!».
   */
  coverage: readonly { key: string; factors: readonly string[] }[]
  /** What the law asks that the product does not do: oppsett.regelverk.gap.<key> */
  gaps: readonly string[]
  /** Each factor's legal reference, or null for the database's (app.factors.law_ref, Norway's) */
  factorLawRefs: Readonly<Record<string, string>> | null
}

const NORWAY: LegalPack = {
  // arbeidsmiljøloven § 6-1 and § 7-1 (D-33)
  duties: {
    rep: 5,
    committee: 30,
    committeeMay: 10,
    // forskrift om organisering, ledelse og medvirkning § 13-1, the NACE sections it lists (D-33)
    healthServiceIndustries: ['41', '42', '43', '05', '06', '07', '08', '09', '35', '37', '38', '39', '86', '87', '88'],
  },
  provisions: ['aml31c', 'aml91', 'aml23', 'aml43', 'forskrift1a', 'aml62'],
  // the regulation's nine named factors onto the eleven QPS factors, two of them two-to-one, and the
  // last two onto the screening questions outside the index
  coverage: [
    { key: 'unclear', factors: ['rolle', 'motstrid'] },
    { key: 'emotional', factors: ['emosjon'] },
    { key: 'workload', factors: ['mengde'] },
    { key: 'support', factors: ['leder', 'kollega'] },
    { key: 'control', factors: ['medvirk'] },
    { key: 'integrity', factors: ['integritet', 'ytring'] },
    { key: 'contact', factors: ['kontakt'] },
    { key: 'harassment', factors: [] },
    { key: 'violence', factors: [] },
  ],
  gaps: ['vernerunde', 'samtaler', 'informasjon', 'opplaering', 'bht'],
  factorLawRefs: null,
}

const SWEDEN: LegalPack = {
  // AML 6 kap. 2 § and 8 §: a skyddsombud where at least five work regularly; a skyddskommitté from
  // fifty, and below that when the employees ask for one
  duties: { rep: 5, committee: 50, committeeMay: 1, healthServiceIndustries: null },
  provisions: ['aml32a', 'afs20231', 'afs20232', 'aml64', 'mbl', 'gdpr'],
  // AFS 2023:2 2 kap.'s areas onto the eleven factors. The föreskrift names no «role clarity» or
  // «conflicting demands»: 7 § (tasks, result, priorities, whom to ask) is what they measure. Working
  // time (9 §) has no factor yet (SE-D), and is shown as a gap rather than as covered.
  coverage: [
    { key: 'workload', factors: ['mengde'] },
    { key: 'tasks', factors: ['rolle', 'motstrid'] },
    { key: 'straining', factors: ['emosjon'] },
    { key: 'support', factors: ['leder', 'kollega', 'mening'] },
    { key: 'control', factors: ['medvirk'] },
    { key: 'social', factors: ['kontakt', 'ytring', 'integritet'] },
    { key: 'harassment', factors: [] },
    { key: 'violence', factors: [] },
    { key: 'worktime', factors: [] },
  ],
  gaps: ['skyddsrond', 'policy', 'mal', 'rutin', 'chefer', 'uppfoljning', 'bht'],
  factorLawRefs: {
    ytring: 'AFS 2023:2 2 kap. 3 §',
    mengde: 'AFS 2023:2 2 kap. 6 §',
    motstrid: 'AFS 2023:2 2 kap. 7 §',
    kontakt: 'AFS 2023:2 2 kap. 3 §',
    emosjon: 'AFS 2023:2 2 kap. 8 §',
    leder: 'AFS 2023:2 2 kap. 3, 7 §§',
    medvirk: 'AML 2 kap. 1 §',
    integritet: 'AFS 2023:2 2 kap. 10 §',
    rolle: 'AFS 2023:2 2 kap. 7 §',
    kollega: 'AFS 2023:2 2 kap. 3 §',
    mening: 'AFS 2023:2 2 kap. 3 §',
  },
}

const UNITED_KINGDOM: LegalPack = {
  // No headcount starts either duty (docs/markets/uk-legal.md § 5). Where a union is recognised its
  // safety representatives are appointed by the union (SRSC 1977 reg 3); elsewhere the employer
  // consults the employees directly or through elected representatives (HSCER 1996 reg 4), and may
  // lawfully have none. A safety committee is required only when two union representatives ask in
  // writing (SRSC reg 9), which no headcount decides: so neither is ever «required» by a number, and
  // the committee card says it may be (oppsett.duty.amuMay in the pack, reg 9).
  duties: { rep: Number.POSITIVE_INFINITY, committee: Number.POSITIVE_INFINITY, committeeMay: 1, healthServiceIndustries: null },
  provisions: ['hswa2', 'mhswr3', 'mhswr5', 'hseStandards', 'consultation', 'ukgdpr'],
  // HSE's Management Standards are guidance on meeting MHSWR reg 3 for work-related stress, not law;
  // their areas onto the eleven factors, as the report's instrument text says (the mapping is the
  // product's own). Change has one statement (medvirk s2, being heard before a change) and is shown
  // as a gap rather than as covered.
  coverage: [
    { key: 'demands', factors: ['mengde', 'emosjon'] },
    { key: 'control', factors: ['medvirk'] },
    { key: 'support', factors: ['leder', 'kollega'] },
    { key: 'relationships', factors: ['integritet', 'kontakt', 'ytring'] },
    { key: 'role', factors: ['rolle', 'motstrid'] },
    { key: 'change', factors: [] },
    { key: 'harassment', factors: [] },
    { key: 'violence', factors: [] },
  ],
  gaps: ['policy', 'arrangements', 'procedures', 'environment', 'competent', 'consultation'],
  // the duty each factor serves is the risk assessment (MHSWR 1999 reg 3); the area of HSE's
  // Management Standards that guides it follows the dot
  factorLawRefs: {
    ytring: 'MHSWR reg 3 · HSE: Relationships',
    mengde: 'MHSWR reg 3 · HSE: Demands',
    motstrid: 'MHSWR reg 3 · HSE: Role',
    kontakt: 'MHSWR reg 3 · HSE: Relationships',
    emosjon: 'MHSWR reg 3 · HSE: Demands',
    leder: 'MHSWR reg 3 · HSE: Support',
    medvirk: 'MHSWR reg 3 · HSE: Control',
    integritet: 'MHSWR reg 3 · HSE: Relationships',
    rolle: 'MHSWR reg 3 · HSE: Role',
    kollega: 'MHSWR reg 3 · HSE: Support',
    mening: 'MHSWR reg 3',
  },
}

/**
 * Germany (DE-B, X-115; docs/markets/de-legal.md). No headcount requires an employees' representative:
 * a Betriebsrat is the employees' right from five (§ 1 BetrVG), never the employer's duty, and the
 * Sicherheitsbeauftragte from fifty (§ 22 SGB VII) support the employer rather than represent anyone. The
 * Arbeitsschutzausschuss is required from more than twenty employees (§ 11 ASiG), with no «may be
 * demanded» band under it. No industry list starts the Betriebsarzt or the Fachkraft (§§ 2, 5 ASiG).
 *
 * The statute names the category, not the factors: «psychische Belastungen bei der Arbeit» is one source
 * of Gefährdung the assessment must cover (§ 5 Abs. 3 Nr. 6 ArbSchG), and § 4 Nr. 4 lists the fields a
 * measure joins up — Arbeitsorganisation, sonstige Arbeitsbedingungen, soziale Beziehungen. The coverage
 * rows are those fields, the mapping is the product's own (de-legal.md § 4), and the texts say so. The
 * physical environment as a source of psychological load and working time (§ 5 Abs. 3 Nr. 4, ArbZG) have
 * no factor, and are shown as gaps rather than as covered (a module for Germany is DE-D).
 */
const GERMANY: LegalPack = {
  duties: { rep: Number.POSITIVE_INFINITY, committee: 21, committeeMay: 21, healthServiceIndustries: null },
  provisions: ['arbschg5', 'arbschg3', 'arbschg6', 'betrvg', 'asig', 'agg', 'dsgvo'],
  coverage: [
    { key: 'arbeitsinhalt', factors: ['rolle', 'medvirk', 'mening'] },
    { key: 'arbeitsorganisation', factors: ['mengde', 'motstrid', 'kontakt'] },
    { key: 'soziale', factors: ['leder', 'kollega', 'ytring', 'integritet'] },
    { key: 'emotional', factors: ['emosjon'] },
    { key: 'belaestigung', factors: [] },
    { key: 'gewalt', factors: [] },
    { key: 'arbeitsumgebung', factors: [] },
    { key: 'arbeitszeit', factors: [] },
  ],
  gaps: ['gesamt', 'unterweisung', 'betriebsrat', 'betreuung', 'beschwerde'],
  // every factor serves the assessment of psychological load (§ 5 Abs. 3 Nr. 6 ArbSchG); the provision
  // closest to what the factor measures follows the dot (de-legal.md § 4)
  factorLawRefs: {
    ytring: '§ 5 Abs. 3 Nr. 6 ArbSchG · § 17 Abs. 1 ArbSchG',
    mengde: '§ 5 Abs. 3 Nr. 6 ArbSchG · § 5 Abs. 3 Nr. 4 ArbSchG, § 3 ArbZG',
    motstrid: '§ 5 Abs. 3 Nr. 6 ArbSchG · § 4 Nr. 4 ArbSchG',
    kontakt: '§ 5 Abs. 3 Nr. 6 ArbSchG · § 4 Nr. 4 ArbSchG',
    emosjon: '§ 5 Abs. 3 Nr. 6 ArbSchG · § 4 Nr. 1 ArbSchG',
    leder: '§ 5 Abs. 3 Nr. 6 ArbSchG · § 3 Abs. 2 Nr. 2 ArbSchG',
    medvirk: '§ 5 Abs. 3 Nr. 6 ArbSchG · § 17 Abs. 1 ArbSchG, § 80 Abs. 1 Nr. 3 BetrVG',
    integritet: '§ 5 Abs. 3 Nr. 6 ArbSchG · §§ 3, 7, 12 AGG',
    rolle: '§ 5 Abs. 3 Nr. 6 ArbSchG · § 12 Abs. 1 ArbSchG',
    kollega: '§ 5 Abs. 3 Nr. 6 ArbSchG · § 4 Nr. 4 ArbSchG',
    mening: '§ 5 Abs. 3 Nr. 6 ArbSchG · § 2 Abs. 1 ArbSchG',
  },
}

export const LEGAL_PACKS: Record<Market, LegalPack> = { no: NORWAY, se: SWEDEN, gb: UNITED_KINGDOM, de: GERMANY }

/** A factor's legal reference in a market: its own, or the database's where the market uses that */
export function factorLawRef(market: Market, factorKey: string, fromDatabase: string): string {
  return LEGAL_PACKS[market].factorLawRefs?.[factorKey] ?? fromDatabase
}

/** The duty a headcount carries in a market: whether a joint committee is required, may be, or is not */
export function committeeDuty(market: Market, employees: number): 'required' | 'may' | 'none' {
  const d = LEGAL_PACKS[market].duties
  return employees >= d.committee ? 'required' : employees >= d.committeeMay ? 'may' : 'none'
}

/** Whether an occupational health service is required by the industry alone, may be, or cannot be told */
export function healthServiceDuty(market: Market, naceCode: string | null): 'required' | 'depends' | 'unknown' {
  const list = LEGAL_PACKS[market].duties.healthServiceIndustries
  if (!list) return 'depends'
  if (naceCode === null) return 'unknown'
  return list.includes(naceCode.slice(0, 2)) ? 'required' : 'depends'
}
