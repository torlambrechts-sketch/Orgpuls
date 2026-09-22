import { notFound } from 'next/navigation'
import {
  MaleoppsettScreen,
  type GroupChoice,
  type MaleoppsettView,
} from '@/components/maleoppsett/MaleoppsettScreen'
import { getFactors } from '@/lib/instrument/read'
import { getGroups, getOrganization, getViewerRole } from '@/lib/org/read'
import { getParticipation } from '@/lib/participation/read'
import { getRounds } from '@/lib/rounds/read'
import { getLatestSetupOfKind, getOrgQuestions, getRoundSetup } from '@/lib/setup/read'

/**
 * Måleoppsett — the data half. Bundle lines 1425-1710; the rendering is in
 * components/maleoppsett/MaleoppsettScreen.tsx.
 *
 * The screen configures one round. Which one comes from the query string — the Målinger
 * list links here per row — and falls back to the most recent round of the kind asked
 * for, which is what the design shows when you open it to plan something new: a form
 * already filled in with what the last one was set up as, rather than with defaults
 * written in a component.
 *
 * The department list is the interesting read. Each group carries its headcount and how
 * many of them answered the PREVIOUS round of the same kind, which is the design's
 * "8 ansatte · 8 svarte sist" and also what decides whether the k warning appears. Both
 * numbers come from `participation`, the same RPC the Deltakelse card reads, rather than
 * from a count this page does itself — `thin` in particular is the server's, because it
 * is computed against the threshold the database enforces and a second opinion here would
 * eventually disagree with it.
 */
export const dynamic = 'force-dynamic'

const KINDS = ['grunnlinje', 'puls', 'oppfolging']

export default async function MaleoppsettPage({
  searchParams,
}: {
  searchParams: Promise<{ runde?: string; type?: string }>
}) {
  const params = await searchParams
  const kind = KINDS.includes(params.type ?? '') ? (params.type as string) : 'grunnlinje'

  const [org, role, rounds, instrument, orgQuestions, groupRows] = await Promise.all([
    getOrganization(),
    getViewerRole(),
    getRounds(),
    getFactors(),
    getOrgQuestions(),
    getGroups(),
  ])

  const setup = params.runde
    ? await getRoundSetup(params.runde)
    : await getLatestSetupOfKind(kind)

  // nothing to configure: no round of this kind has ever existed
  if (!setup || !org) notFound()

  /*
   * "8 svarte sist" is the previous round of the same kind, not this one. Configuring a
   * round that is still open and showing its own response counts would tell you how it is
   * going, which is Deltakelse's job; what this screen needs is what happened last time,
   * because that is what a decision about who to invite rests on.
   */
  const previous =
    rounds.find((r) => r.kind === setup.kind && r.id !== setup.id && r.status === 'lukket') ?? null
  const participation = previous ? await getParticipation(previous.id) : null

  /*
   * participation() returns group names, not ids — it is a k-applying RPC and an id is
   * not what it is for. The ids the checkboxes need come from app.groups, joined by name
   * inside this organisation, where (org_id, name) is unique by constraint.
   */
  const lastOf = new Map((participation?.groups ?? []).map((g) => [g.group_name, g]))

  const groups: GroupChoice[] = groupRows.map((g) => {
    const p = lastOf.get(g.name)
    return {
      id: g.id,
      name: g.name,
      headcount: p?.headcount ?? 0,
      answeredLast: p?.answered ?? null,
      thin: p?.thin ?? false,
    }
  })

  const selected = new Set(setup.factorKeys)

  const view: MaleoppsettView = {
    roundId: setup.id,
    kind: setup.kind,
    year: setup.year,
    status: setup.status,
    factors: instrument.map((f) => ({ key: f.key, selected: selected.has(f.key) })),
    // counted, not multiplied by an assumed three — the same reasoning lib/rounds/read.ts
    // gives for the rounds list's "37 spørsmål"
    questionCount:
      instrument
        .filter((f) => selected.has(f.key))
        .reduce((n, f) => n + f.ordinals.length, 0) + setup.extraKeys.length,
    extraCount: setup.extraKeys.length,
    commentPolicy: setup.commentPolicy,
    allowDialogue: setup.allowDialogue,
    reminderDay: setup.reminderDay,
    closeAfterDays: setup.closeAfterDays,
    evaluationCadence: setup.evaluationCadence,
    groups,
    invitedGroupIds: setup.groupIds,
    orgQuestions,
    consultations: setup.consultations,
    employeeCount: org.employee_count,
    threshold: participation?.threshold ?? org.threshold,
    // styling only; `round_group_write` and its siblings are what actually decide
    canWrite: role === 'daglig_leder' || role === 'avdelingsleder',
  }

  return <MaleoppsettScreen view={view} />
}
