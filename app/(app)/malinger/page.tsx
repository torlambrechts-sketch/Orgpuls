import { MalingerScreen, type MalingerView } from '@/components/malinger/MalingerScreen'
import { getExtraQuestions, getFactors } from '@/lib/instrument/read'
import { getParticipation } from '@/lib/participation/read'
import { getRounds } from '@/lib/rounds/read'

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
  const [rounds, factors, extras] = await Promise.all([
    getRounds(),
    getFactors(),
    getExtraQuestions(),
  ])

  // the Deltakelse card describes the latest result — "Grunnlinje 2026 — lukket" — which is
  // the round in the "Lukket" state, not whichever sorts first: once the year wheel plans
  // rounds, the first by closing date is one nobody has been sent (D-46)
  const current = rounds.find((r) => r.state === 'lukket') ?? null
  const participation = current ? await getParticipation(current.id) : null

  const view: MalingerView = { rounds, current, participation, factors, extras }
  return <MalingerScreen view={view} />
}
