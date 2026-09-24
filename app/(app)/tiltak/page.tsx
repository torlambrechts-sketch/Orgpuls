import { TiltakScreen, type StatusFilter, type TiltakView } from '@/components/tiltak/TiltakScreen'
import { getFactors } from '@/lib/instrument/read'
import { getMeasures } from '@/lib/measures/read'
import { getEmployees, getGroups } from '@/lib/org/read'
import { getResultsSummary } from '@/lib/results/read'
import { getLatestClosedRoundId, getRounds } from '@/lib/rounds/read'

/**
 * Tiltak — the data half. Bundle lines 1712-1795; the rendering is in
 * components/tiltak/TiltakScreen.tsx.
 *
 * Every measure comes from app.measures through RLS, with its factor, its owner and the
 * round that raised it joined on. The filter chips are built from what is actually
 * there — the measurements that produced a measure, and the people who own one — rather
 * than from a list written here, so a new owner appears without anyone editing a
 * component.
 *
 * The handlingsplan needs four things the list alone cannot supply: everyone who could
 * own a measure, every department one could affect, the instrument's factors, and the
 * round a new measure would cite. All four are read here — the panel is a client
 * component, and a client component that fetched its own options would be holding a
 * database client in the browser.
 */
export const dynamic = 'force-dynamic'

const STATUSES: StatusFilter[] = ['apne', 'frist', 'effekt', 'lukket', 'alle']

export default async function TiltakPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; maling?: string; tildelt?: string; forslag?: string }>
}) {
  const params = await searchParams
  const [measures, employees, groups, factors, newMeasureRoundId, allRounds] = await Promise.all([
    getMeasures(),
    getEmployees(),
    getGroups(),
    getFactors(),
    getLatestClosedRoundId(),
    getRounds(),
  ])

  /*
   * "Forslag fra resultatene" orders the factors by the latest closed round's indices and
   * opens the lowest (D-61). With no closed round, or one under the threshold, there are
   * no indices: the chips then stand in the instrument's order and carry no score, and
   * the lead says so, rather than printing a number nothing measured.
   */
  const summary = newMeasureRoundId ? await getResultsSummary(newMeasureRoundId) : null
  const scored = summary?.status === 'ok' ? summary.factors : null
  const bankFactors = scored
    ? [...scored].sort((a, b) => a.index - b.index).map((f) => ({ key: f.key, index: f.index, band: f.band }))
    : factors.map((f) => ({ key: f.key, index: null, band: null }))
  const bankKey = bankFactors.some((f) => f.key === params.forslag) ? (params.forslag as string) : bankFactors[0]?.key ?? null

  const status = STATUSES.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : 'apne'

  // the rounds that actually raised a measure, newest first
  const rounds = [...new Map(measures.filter((m) => m.round).map((m) => [m.round!.id, m.round!])).values()].sort(
    (a, b) => b.year - a.year,
  )
  const owners = [...new Map(measures.filter((m) => m.owner).map((m) => [m.owner!.id, m.owner!])).values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'nb'),
  )

  const view: TiltakView = {
    measures,
    status,
    roundId: rounds.some((r) => r.id === params.maling) ? (params.maling ?? null) : null,
    ownerId: owners.some((o) => o.id === params.tildelt) ? (params.tildelt ?? null) : null,
    rounds,
    owners,
    employees,
    groups,
    factorKeys: factors.map((f) => f.key),
    newMeasureRoundId,
    bank: { factors: bankFactors, selectedKey: bankKey },
    // a round can be evidence only once it has closed and its result exists
    effectRounds: allRounds
      .filter((r) => r.status === 'lukket')
      .map((r) => ({ id: r.id, kind: r.kind, year: r.year, pulseNo: r.pulseNo, opensAt: r.opensAt })),
  }

  return <TiltakScreen view={view} />
}
