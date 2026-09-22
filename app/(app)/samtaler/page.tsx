import { SamtalerScreen, type SamtalerView, type StatusFilter } from '@/components/samtaler/SamtalerScreen'
import { getConversations } from '@/lib/conversations/read'
import { getViewerRole } from '@/lib/org/read'

/**
 * Samtaler — the data half. Bundle lines 941-1025; the rendering is in
 * components/samtaler/SamtalerScreen.tsx.
 *
 * One RPC. `public.conversations()` has already applied k per thread and stripped the
 * group before anything reaches this file, so there is nothing here to withhold and
 * nothing to re-check — the filters below are presentation over what survived.
 *
 * The chip rows are built from the threads that exist rather than from a list written
 * here, which is also why a factor with nothing to say about it simply has no chip.
 */
export const dynamic = 'force-dynamic'

const STATUSES: StatusFilter[] = ['venter', 'dialog', 'lukket', 'alle']

export default async function SamtalerPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; maling?: string; faktor?: string }>
}) {
  const params = await searchParams
  const [conversations, role] = await Promise.all([getConversations(), getViewerRole()])

  const items = conversations?.items ?? []

  const status = STATUSES.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : 'venter'

  const rounds = [
    ...new Map(
      items.map((c) => [c.roundId, { id: c.roundId, kind: c.roundKind, year: c.roundYear }]),
    ).values(),
  ].sort((a, b) => b.year - a.year)

  const factorKeys = [...new Set(items.map((c) => c.factorKey))]

  const view: SamtalerView = {
    items,
    status,
    roundId: rounds.some((r) => r.id === params.maling) ? (params.maling ?? null) : null,
    factorKey: factorKeys.includes(params.faktor ?? '') ? (params.faktor ?? null) : null,
    rounds,
    factorKeys,
    threshold: conversations?.threshold ?? 5,
    // styling only; reply_to_thread checks the role itself against auth.uid()
    canWrite: role === 'daglig_leder' || role === 'avdelingsleder',
  }

  return <SamtalerScreen view={view} />
}
