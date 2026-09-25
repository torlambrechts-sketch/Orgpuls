import { countView } from '@/lib/analytics/product'
import {
  RapportScreen,
  type Audience,
  type RapportView,
  type ReportFactor,
  type ReportRun,
  type ReportScope,
} from '@/components/rapport/RapportScreen'
import { getExtraQuestions, getFactors } from '@/lib/instrument/read'
import { getOrganization, getViewerRole } from '@/lib/org/read'
import { getMeasures } from '@/lib/measures/read'
import { getResultsDigest } from '@/lib/results/digest'
import { getResultsByGroup } from '@/lib/results/read'
import { getRiskAssessment } from '@/lib/risk/read'
import {
  getInformation,
  getMeasureEffects,
  getScreeningCounts,
  getSigners,
  getTrainings,
} from '@/lib/report/tail'
import { getRoundFactorKeys, getRoundRows, withParticipation, type RoundListItem } from '@/lib/rounds/read'

/**
 * Rapport — the data half. Bundle lines 271-500; the rendering is in
 * components/rapport/RapportScreen.tsx.
 *
 * The document is the product's output, so the standard for a figure on it is higher
 * than anywhere else in the application, not lower: a number on a page an inspector
 * reads has to be one the database computed. The indices and bands come from
 * `results_summary`, the response rates from `participation`, the withheld groups from
 * `results_by_group`, the dates and question counts from `app.rounds` and its join
 * tables, and the organisation's identity from `app.organizations`.
 *
 * Sections 4 to 8 and the signature block are not rendered — see docs/DEVIATIONS.md
 * D-18, which names the table each one is waiting for.
 */
export const dynamic = 'force-dynamic'

const AUDIENCE_KEYS: Audience[] = ['tilsyn', 'amu', 'ledelse', 'ansatte']

export default async function RapportPage({
  searchParams,
}: {
  searchParams: Promise<{
    mottaker?: string
    ar?: string
    omfang?: string
    avdeling?: string
  }>
}) {
  const params = await searchParams

  const [org, rows, instrument, extras, measures, role] = await Promise.all([
    getOrganization(),
    getRoundRows(),
    getFactors(),
    getExtraQuestions(),
    getMeasures(),
    getViewerRole(),
    countView('report_viewed'),
  ])

  const audience: Audience = AUDIENCE_KEYS.includes(params.mottaker as Audience)
    ? (params.mottaker as Audience)
    : 'tilsyn'
  const scope: ReportScope = params.omfang === 'grunnlinje' ? 'grunnlinje' : 'ar'

  /**
   * The report's figures come from the year's grunnlinje, not from whatever closed
   * last: a puls measures two factors and cannot carry a "Kartlegging" section. The
   * comparison is the most recent closed grunnlinje of an earlier year.
   */
  const baselineOf = (y: number) =>
    rows.find((r) => r.year === y && r.kind === 'grunnlinje' && r.status === 'lukket') ?? null

  /**
   * The years the organisation has measured, most recent first. "Measured" means at least
   * one round has gone out: the year wheel plans a year ahead, and a year made only of
   * planned rounds has nothing to report. The report opens on the latest year with a
   * closed grunnlinje, because that is the year it can document — it used to open on the
   * latest year of any round, which since the wheel began planning was next year's, empty.
   * D-46.
   */
  const measured = [...new Set(rows.filter((r) => r.status !== 'planlagt').map((r) => r.year))]
  const years = (measured.length > 0 ? measured : [...new Set(rows.map((r) => r.year))]).sort(
    (a, b) => b - a,
  )
  const asked = Number(params.ar)
  const year = years.includes(asked)
    ? asked
    : (years.find((y) => baselineOf(y) !== null) ?? years[0] ?? new Date().getFullYear())

  const primaryRound = baselineOf(year)
  const prevYear = years.find((y) => y < year && baselineOf(y) !== null) ?? null
  const prevRound = prevYear === null ? null : baselineOf(prevYear)

  const inYear = rows.filter((r) => r.year === year)

  const [
    digest,
    byGroup,
    factorKeyLists,
    risk,
    effects,
    screening,
    information,
    trainings,
    signers,
  ] = await Promise.all([
    // the year's response rates and both indices in one call (0044)
    getResultsDigest({ participation: inYear.map((r) => r.id), summaries: [primaryRound?.id, prevRound?.id] }),
    primaryRound ? getResultsByGroup(primaryRound.id) : Promise.resolve(null),
    Promise.all(inYear.map((r) => getRoundFactorKeys(r.id))),
    primaryRound ? getRiskAssessment(primaryRound.id) : Promise.resolve(null),
    getMeasureEffects(),
    primaryRound ? getScreeningCounts(primaryRound.id) : Promise.resolve(null),
    primaryRound ? getInformation(primaryRound.id) : Promise.resolve([]),
    getTrainings(),
    getSigners(),
  ])
  const summary = primaryRound ? (digest.summaries.get(primaryRound.id) ?? null) : null
  const prior = prevRound ? (digest.summaries.get(prevRound.id) ?? null) : null

  const threshold = byGroup?.threshold ?? summary?.threshold ?? org?.threshold ?? 5

  const teams = (byGroup?.groups ?? [])
    .filter((g) => g.status === 'ok')
    .map((g) => ({ name: g.group_name, n: g.n }))
  const withheld = (byGroup?.groups ?? [])
    .filter((g) => g.status === 'insufficient_data')
    .map((g) => ({ name: g.group_name, n: g.n }))
  // enough answers, held back so the groups above cannot be recovered by subtraction (0034)
  const protectedGroups = (byGroup?.groups ?? [])
    .filter((g) => g.status === 'protected')
    .map((g) => ({ name: g.group_name, n: g.n }))

  const teamResult = params.avdeling
    ? (byGroup?.groups.find((g) => g.group_name === params.avdeling && g.status === 'ok') ?? null)
    : null
  const team = teamResult?.group_name ?? null

  const runOf = (r: RoundListItem, factors: number): ReportRun => ({
    id: r.id,
    kind: r.kind,
    year: r.year,
    pulseNo: r.pulseNo,
    status: r.status,
    opensAt: r.opensAt,
    closesAt: r.closesAt,
    questions: r.questionCount,
    factors,
    answered: r.participation?.answered ?? null,
    total: r.participation?.headcount ?? null,
    pct: r.participation?.pct ?? null,
    // a baseline-only report lists the year's other rounds and marks them left out,
    // which is the design's own treatment — the omission is part of the documentation
    included:
      r.status === 'lukket' && (scope === 'ar' || r.id === (primaryRound?.id ?? '')),
  })

  const runs = withParticipation(inYear, digest).map((r, i) => runOf(r, factorKeyLists[i]?.length ?? 0))
  const primary = primaryRound
    ? (runs.find((r) => r.id === primaryRound.id) ?? null)
    : null

  const lawOf = new Map(instrument.map((f) => [f.key, f.lawRef]))
  const positionOf = new Map(instrument.map((f, i) => [f.key, i]))
  const priorIndexOf = new Map(
    (prior?.status === 'ok' ? prior.factors : []).map((f) => [f.key, f.index]),
  )

  /**
   * A department's rows come from `results_by_group`, which has already applied k; the
   * organisation's come from `results_summary`. What a department has no equivalent of
   * is an overall index — the RPC returns factor rows and no headline figure, and this
   * side will not average them into one (D-15).
   */
  const source = team ? (teamResult?.factors ?? []) : summary?.status === 'ok' ? summary.factors : []

  /** the organisation's own index per factor, which is what section 4 quotes */
  const indexOf = new Map(
    (summary?.status === 'ok' ? summary.factors : []).map((f) => [f.key, f.index]),
  )

  const factors: ReportFactor[] = source
    .map((f) => ({
      key: f.key,
      lawRef: lawOf.get(f.key) ?? '',
      index: f.index,
      band: f.band,
      // the comparison column is the organisation's previous year; there is no
      // per-department history to compare a department against
      prevIndex: team ? null : (priorIndexOf.get(f.key) ?? null),
    }))
    .sort((a, b) => (positionOf.get(a.key) ?? 0) - (positionOf.get(b.key) ?? 0))

  const view: RapportView = {
    audience,
    year,
    scope,
    team,
    years,
    teams,
    org: org
      ? { name: org.name, orgNumber: org.org_number, employeeCount: org.employee_count }
      : null,
    threshold,
    runs,
    primary,
    index: team ? null : summary?.status === 'ok' ? summary.index : null,
    prevIndex: team ? null : prior?.status === 'ok' ? prior.index : null,
    prevYear: team ? null : prior?.status === 'ok' ? prevYear : null,
    factors,
    withheld,
    protectedGroups,
    teamAnswers: teamResult?.n ?? null,
    instrument: {
      factors: instrument.length,
      statementsPerFactor: instrument.map((f) => f.ordinals.length),
      extraQuestions: extras.length,
    },
    highRiskCount: factors.filter((f) => f.band === 'hoy').length,
    /*
     * Section 5 lists the measures the year's own measurements raised — the join the
     * table was built for. A measure whose round was deleted keeps its record but loses
     * its year, so it is not claimed by any period rather than being attached to all.
     */
    measures: measures
      .filter((m) => m.round?.year === year)
      .map((m) => ({
        id: m.id,
        factorKey: m.factorKey,
        title: m.title,
        owner: m.owner?.name ?? null,
        dueDate: m.dueDate,
        completedOn: m.completedOn,
        step: m.step,
        late: m.late,
      })),

    /*
     * Section 4, from the assessment of the round the figures come from.
     *
     * The index beside each factor is the one this report already prints in section 3,
     * looked up rather than restated — so the two sections cannot disagree, and a factor
     * assessed on a round whose result is withheld shows its assessment without a number
     * instead of borrowing one from elsewhere. The assessment is organisation-wide; a
     * departmental report prints it unchanged, because risk was assessed for the
     * undertaking and § 4-1's "samlet" is exactly that.
     */
    effects,
    screening,
    information,
    trainings,
    signers,
    // styling only: information_write_* and training_write_* (0026) check it themselves
    canRecord: role === 'daglig_leder' || role === 'verneombud',
    risk: risk
      ? {
          assessedOn: risk.assessedOn,
          assessor: risk.assessor?.name ?? null,
          summary: risk.summary,
          factors: risk.factors.map((f) => ({
            factorKey: f.factorKey,
            index: indexOf.get(f.factorKey) ?? null,
            probability: f.probability,
            consequence: f.consequence,
            assessment: f.assessment,
            conclusion: f.conclusion,
          })),
        }
      : null,
  }

  return <RapportScreen view={view} />
}
