import { MalingerScreen, type MalingerView } from '@/components/malinger/MalingerScreen'
import { getExtraQuestions, getFactors } from '@/lib/instrument/read'
import { getParticipation } from '@/lib/participation/read'
import { getRoundFactorKeys, getRounds } from '@/lib/rounds/read'
import { getRoundSetup } from '@/lib/setup/read'
import { getWheel, wheelMonths } from '@/lib/wheel/read'
import type { WheelStripView } from '@/components/malinger/WheelStrip'

/**
 * Målinger — the data half. Bundle lines 502-658; the rendering is in
 * components/malinger/MalingerScreen.tsx.
 *
 * Every figure comes out of the database: the question count is counted from
 * app.round_factors and app.round_extra_questions, the response rates from
 * public.participation(), the dates from app.rounds.closes_at.
 */
export const dynamic = 'force-dynamic'

export default async function MalingerPage() {
  const [rounds, factors, extras, wheel] = await Promise.all([
    getRounds(),
    getFactors(),
    getExtraQuestions(),
    getWheel(),
  ])

  // the Deltakelse card describes the latest result — "Grunnlinje 2026 — lukket" — which is
  // the round in the "Lukket" state, not whichever sorts first: once the year wheel plans
  // rounds, the first by closing date is one nobody has been sent (D-46)
  const current = rounds.find((r) => r.state === 'lukket') ?? null
  const participation = current ? await getParticipation(current.id) : null

  /*
   * The Årshjulet card, from the stored wheel (D-53). No wheel row, no card: the strip is
   * a picture of a schedule, and without one there is nothing to draw.
   */
  let strip: WheelStripView | null = null
  if (wheel) {
    const next =
      rounds
        .filter((r) => r.status === 'planlagt' && r.opensAt)
        .sort((a, b) => (a.opensAt ?? '').localeCompare(b.opensAt ?? ''))[0] ?? null
    const setup = next ? await getRoundSetup(next.id) : null

    // audiences told on the same day share a chip, as the design groups them
    const cascade: WheelStripView['cascade'] = []
    for (const step of wheel.ladder) {
      const last = cascade.at(-1)
      if (last && last.leadDays === step.leadDays) last.audiences.push(step.audience)
      else cascade.push({ audiences: [step.audience], leadDays: step.leadDays })
    }

    strip = {
      measured: wheelMonths(wheel.cadence, wheel.baselineMonth, wheel.skipFellesferie),
      forankring: ((wheel.baselineMonth + 10) % 12) + 1,
      ferie: wheel.skipFellesferie,
      next: next?.opensAt
        ? {
            kind: next.kind,
            month: Number(
              new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: 'Europe/Oslo' }).format(
                new Date(next.opensAt),
              ),
            ),
          }
        : null,
      cascade,
      // the schema's default when nothing is planned yet, as Årshjulet falls back to
      reminderDay: setup?.reminderDay ?? 2,
    }
  }

  // a puls is defined by what it measures, and the design says so on its row
  const pulses = rounds.filter((r) => r.kind === 'puls')
  const pulseKeys = await Promise.all(pulses.map((r) => getRoundFactorKeys(r.id)))
  const pulseFactors = Object.fromEntries(pulses.map((r, i) => [r.id, pulseKeys[i] ?? []]))

  const nextPlannedId =
    rounds
      .filter((r) => r.status === 'planlagt' && r.opensAt)
      .sort((a, b) => (a.opensAt ?? '').localeCompare(b.opensAt ?? ''))[0]?.id ?? null

  const view: MalingerView = { rounds, current, participation, factors, extras, strip, pulseFactors, nextPlannedId }
  return <MalingerScreen view={view} />
}
