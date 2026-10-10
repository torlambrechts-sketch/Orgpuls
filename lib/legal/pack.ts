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
 * The Swedish citations are recorded with their sources in docs/markets/se-legal.md.
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

export const LEGAL_PACKS: Record<Market, LegalPack> = { no: NORWAY, se: SWEDEN }

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
