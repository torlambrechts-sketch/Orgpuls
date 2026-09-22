import { notFound } from 'next/navigation'
import { ArshjuletScreen, type ArshjuletView, type YearPoint } from '@/components/arshjulet/ArshjuletScreen'
import { getViewerRole } from '@/lib/org/read'
import { getRounds } from '@/lib/rounds/read'
import { getRoundSetup } from '@/lib/setup/read'
import { getLastRun, getQueueCounts, getWheel, wheelMonths } from '@/lib/wheel/read'

/**
 * Årshjulet — the data half. Bundle lines 1253-1424; the rendering is in
 * components/arshjulet/ArshjuletScreen.tsx.
 *
 * The month strip is twelve points whatever the cadence, because the design draws a year
 * and a year has twelve months. Which of them carry a label comes from `wheelMonths`, the
 * same rule the scheduler plans from, plus two the design names that are not measurements:
 * the fellesferie the wheel steps around, and the forankring the month before the
 * baseline — § 9-2's drøfting has to happen before the kartlegging, so it has a place on
 * the year rather than being remembered.
 */
export const dynamic = 'force-dynamic'

export default async function ArshjuletPage() {
  const [wheel, role, rounds, lastRun, queue] = await Promise.all([
    getWheel(),
    getViewerRole(),
    getRounds(),
    getLastRun(),
    getQueueCounts(),
  ])

  if (!wheel) notFound()

  const measured = wheelMonths(wheel.cadence, wheel.baselineMonth, wheel.skipFellesferie)
  const labelOf = new Map(measured.map((m) => [m.month, m.kind as YearPoint['role']]))

  // the month before the baseline, wrapped: September's forankring is August
  const forankring = ((wheel.baselineMonth + 10) % 12) + 1
  if (!labelOf.has(forankring)) labelOf.set(forankring, 'forankring')
  if (wheel.skipFellesferie && !labelOf.has(7)) labelOf.set(7, 'ferie')

  const year: YearPoint[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    role: labelOf.get(i + 1) ?? null,
  }))

  /*
   * The next grunnlinje is a row, not a formula: the wheel has already planned it, so
   * this reads what exists rather than recomputing what should. If the scheduler has not
   * run yet there is nothing to show, and the screen says so.
   */
  const planlagt = rounds
    .filter((r) => r.status === 'planlagt' && r.opensAt)
    .sort((a, b) => (a.opensAt ?? '').localeCompare(b.opensAt ?? ''))

  const nextPlanned = planlagt[0] ?? null
  const nextBaselineRound = planlagt.find((r) => r.kind === 'grunnlinje')

  const nextRound = nextPlanned ? await getRoundSetup(nextPlanned.id) : null

  const view: ArshjuletView = {
    wheel,
    year,
    lastRun,
    queue,
    plannedPerYear: measured.length,
    nextBaseline: nextBaselineRound?.opensAt
      ? {
          month: new Date(nextBaselineRound.opensAt).getUTCMonth() + 1,
          year: new Date(nextBaselineRound.opensAt).getUTCFullYear(),
        }
      : null,
    // styling only; wheel_write is what decides
    canWrite: role === 'daglig_leder',
    /*
     * The timeline's days come from the round the wheel will actually open next, so it
     * prints that round's reminder and closing schedule rather than a pair of constants.
     * Falls back to the schema's own defaults when nothing is planned yet.
     */
    reminderDay: nextRound?.reminderDay ?? 2,
    closeAfterDays: nextRound?.closeAfterDays ?? 7,
  }

  return <ArshjuletScreen view={view} />
}
