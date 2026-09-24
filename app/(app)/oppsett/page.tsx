import { getLocale } from 'next-intl/server'
import { MembersPanel } from '@/components/oppsett/MembersPanel'
import { getMembers, getMembersLocked, getOpenInvites } from '@/lib/members/read'
import { OppsettScreen, TABS, type OppsettView, type Tab } from '@/components/oppsett/OppsettScreen'
import {
  countWithPhone,
  getCompany,
  getGroupStats,
  getLocations,
  getRoster,
} from '@/lib/settings/read'
import { getGroups, getOrganization, getViewerRole } from '@/lib/org/read'
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

  const [company, locations, groups, roster, factors, wheel, rounds, withPhone, role, org] =
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
      getOrganization(),
    ])

  if (!company) return null

  // the round the group counts are "svar sist" from: the most recent one that closed
  const closed = rounds.find((r) => r.state === 'lukket') ?? null
  const groupStats = await getGroupStats(closed?.id ?? null)

  /*
   * The Roller tab's people and open invitations. Read only on that tab, and only for a
   * daglig leder: `org_members` refuses anybody else, and the panel is not rendered for
   * them rather than rendered empty. D-51.
   */
  const members =
    tab === 'roller' && role === 'daglig_leder' ? await getMembers(company.id) : null
  const invites = members ? await getOpenInvites(company.id) : []
  const membersLocked = members ? await getMembersLocked(company.id) : false

  const view: OppsettView = {
    tab,
    company,
    locations,
    groups,
    groupStats,
    roster,
    withPhone,
    mailOn: org?.mail_enabled ?? false,
    factorKeys: factors.map((f) => f.key),
    baselineMonth: wheel?.baselineMonth ?? null,
    verneombud: roster.filter((p) => p.dutyRole === 'verneombud').map((p) => p.name),
    lastClosedRound: closed ? { kind: closed.kind, year: closed.year } : null,
    // styling only; every write policy on these tables is daglig_leder and checks itself
    canWrite: role === 'daglig_leder',
    members: members ? (
      <MembersPanel
        members={members}
        invites={invites}
        groups={groups}
        canWrite={role === 'daglig_leder'}
        locked={membersLocked}
        locale={await getLocale()}
      />
    ) : undefined,
  }

  return <OppsettScreen view={view} />
}
