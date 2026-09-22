import { OppsettScreen, TABS, type OppsettView, type Tab } from '@/components/oppsett/OppsettScreen'
import {
  countWithPhone,
  getCompany,
  getGroupStats,
  getLocations,
  getRoster,
} from '@/lib/settings/read'
import { getGroups, getViewerRole } from '@/lib/org/read'
import { getFactors } from '@/lib/instrument/read'
import { getWheel } from '@/lib/wheel/read'
import { getRounds } from '@/lib/rounds/read'

/**
 * Oppsett — the data half. Bundle lines 1958-2472; the rendering is in
 * components/oppsett/OppsettScreen.tsx.
 *
 * Every read here is an ordinary RLS-scoped table read, because none of it is a result.
 * The one number that comes from a round — how many of each group answered — is counted
 * from `app.invitations`, which records that somebody was asked and that they came back,
 * and never what they said.
 *
 * The tab comes from the query string and is validated against the list rather than cast:
 * `?fane=noe-annet` falls back to Selskap instead of rendering nothing.
 */
export const dynamic = 'force-dynamic'

export default async function OppsettPage({
  searchParams,
}: {
  searchParams: Promise<{ fane?: string }>
}) {
  const params = await searchParams
  const tab: Tab = TABS.includes(params.fane as Tab) ? (params.fane as Tab) : 'selskap'

  const [company, locations, groups, roster, factors, wheel, rounds, withPhone, role] =
    await Promise.all([
      getCompany(),
      getLocations(),
      getGroups(),
      getRoster(),
      getFactors(),
      getWheel(),
      getRounds(),
      countWithPhone(),
      getViewerRole(),
    ])

  if (!company) return null

  // the round the group counts are "svar sist" from: the most recent one that closed
  const closed = rounds.find((r) => r.state === 'lukket') ?? null
  const groupStats = await getGroupStats(closed?.id ?? null)

  const view: OppsettView = {
    tab,
    company,
    locations,
    groups,
    groupStats,
    roster,
    withPhone,
    factorKeys: factors.map((f) => f.key),
    baselineMonth: wheel?.baselineMonth ?? null,
    verneombud: roster.filter((p) => p.dutyRole === 'verneombud').map((p) => p.name),
    lastClosedRound: closed ? { kind: closed.kind, year: closed.year } : null,
    // styling only; every write policy on these tables is daglig_leder and checks itself
    canWrite: role === 'daglig_leder',
  }

  return <OppsettScreen view={view} />
}
