import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { ResultaterEmpty, ResultaterFrame } from '@/components/resultater/ResultaterFrame'
import { getConversations } from '@/lib/conversations/read'
import { getMeasures } from '@/lib/measures/read'
import { getParticipation } from '@/lib/participation/read'
import { roundNamer } from '@/lib/rounds/design-name'
import { getRoundFactorKeys, getRoundRows, type RoundRow } from '@/lib/rounds/read'
import { getUnansweredCount } from '@/lib/shell/read'
import { getResultsWorkspace } from '@/lib/results/workspace'
import {
  ORG,
  VIEWS,
  type ResultaterModel,
  type RoundRef,
  type ScoreRow,
  type Scores,
  type Statement,
} from '@/lib/results/resultater'

/**
 * Resultater — design 3 (bundle `isResults`, v3 2234-2660; logic `v2()`/`v2p()`). D-72.
 *
 * One round in depth, every closed round beside it. The page reads:
 *
 *   rounds         the organisation's rounds, without participation (one query)
 *   workspace      `results_workspace` (0037): every closed round's summary and groups,
 *                  this round's statements, "Anbefaler oss" and Prioritet's importance,
 *                  each already gated by the reader it came from
 *   participation  this round's response rate and the group order
 *   conversations  this round's comments, for the drill-down's count and quote
 *   measures       which playbook suggestions are already measures, and the plan count
 *
 * and hands the workspace one model (lib/results/resultater.ts). Nothing is computed from
 * answers here; no client role can read them. A value the RPCs did not return is absent
 * from the model, and the screen draws the design's empty treatment over it.
 *
 * The round and the comparison are server state: links, so a changed round is one
 * request and a shared URL shows the same thing. The view, the group and the factor are
 * the workspace's, mirrored to the URL as they change, so a reload keeps the cell.
 */
export const dynamic = 'force-dynamic'

const Params = z.object({
  maling: z.string().uuid().optional().catch(undefined),
  mot: z.string().uuid().optional().catch(undefined),
  visning: z.enum(VIEWS).optional().catch(undefined),
  gruppe: z.string().max(120).optional().catch(undefined),
  faktor: z
    .string()
    .regex(/^[a-z]+$/)
    .optional()
    .catch(undefined),
})

export default async function ResultaterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const params = Params.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])))
  const t = await getTranslations()
  const locale = await getLocale()

  const rows = await getRoundRows()
  const byClose = (a: RoundRow, b: RoundRow) => (a.closesAt ?? '').localeCompare(b.closesAt ?? '')
  const closed = rows.filter((r) => r.status === 'lukket').sort(byClose)
  const grunnlinjer = closed.filter((r) => r.kind === 'grunnlinje')
  const latestGrunnlinje = grunnlinjer.at(-1) ?? null

  const selected = closed.find((r) => r.id === params.maling) ?? latestGrunnlinje ?? closed.at(-1) ?? null
  if (!selected) return <ResultaterEmpty />

  const ref = roundNamer(t, locale)

  const isPulse = selected.kind === 'puls'
  const compareRow =
    !isPulse && params.mot && params.mot !== selected.id ? (grunnlinjer.find((r) => r.id === params.mot) ?? null) : null
  const previousRow = [...(isPulse ? closed : grunnlinjer)].filter((r) => byClose(r, selected) < 0).at(-1) ?? null

  const [workspace, participation, factors, conversations, measures, unanswered] = await Promise.all([
    getResultsWorkspace(selected.id),
    getParticipation(selected.id),
    getRoundFactorKeys(selected.id),
    getConversations(selected.id),
    getMeasures(),
    getUnansweredCount(),
  ])

  const history = new Map((workspace?.history ?? []).map((h) => [h.round_id, h]))
  const current = history.get(selected.id)
  const summary = current?.summary ?? null
  const threshold = workspace?.items?.threshold ?? summary?.threshold ?? current?.groups?.threshold ?? 5

  // group order is the organisation's own (app.groups.sort_order, carried by participation)
  const order = new Map((participation?.groups ?? []).map((g) => [g.group_name, g.sort_order]))
  const rank = (name: string) => order.get(name) ?? Number.MAX_SAFE_INTEGER

  const orgRow: ScoreRow | null =
    summary && summary.scope === 'org'
      ? {
          id: ORG,
          name: t('resultater.heat.org'),
          n: summary.n,
          status: summary.status,
        }
      : null
  const groupRows: ScoreRow[] = (current?.groups?.groups ?? [])
    .map((g) => ({
      id: g.group_name,
      name: g.group_name,
      n: g.n,
      status: g.status,
    }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, locale))
  const scoreRows = orgRow ? [orgRow, ...groupRows] : groupRows

  // every closed round, per row, as the readers released it
  const scores: ResultaterModel['scores'] = {}
  const overall: ResultaterModel['overall'] = {}
  for (const h of workspace?.history ?? []) {
    const perRow: Record<string, Scores> = {}
    if (h.summary?.status === 'ok' && h.summary.scope === 'org') {
      perRow[ORG] = Object.fromEntries(h.summary.factors.map((f) => [f.key, f.index]))
    }
    for (const g of h.groups?.groups ?? []) {
      perRow[g.group_name] = g.status === 'ok' && g.factors ? Object.fromEntries(g.factors.map((f) => [f.key, f.index])) : null
    }
    scores[h.round_id] = perRow
    overall[h.round_id] = h.summary?.status === 'ok' ? h.summary.index : null
  }

  const measuredOf = (id: string) => {
    const perRow = scores[id]
    const scope = perRow?.[ORG] ?? Object.values(perRow ?? {}).find((v) => v) ?? null
    return scope ? Object.keys(scope) : []
  }
  const measured: ResultaterModel['measured'] = Object.fromEntries(closed.map((r) => [r.id, measuredOf(r.id)]))
  measured[selected.id] = factors

  // this round's statements, per row
  const items: ResultaterModel['items'] = {}
  const byFactor = (list: { key: string; ordinal: number; index: number }[]) => {
    const out: Record<string, Statement[]> = {}
    for (const i of list) (out[i.key] ??= []).push({ ordinal: i.ordinal, index: i.index })
    return out
  }
  const ws = workspace?.items
  if (ws?.status === 'ok' && ws.scope === 'org') items[ORG] = byFactor(ws.items)
  for (const g of ws?.groups ?? []) if (g.items) items[g.group_name] = byFactor(g.items)

  const importance =
    workspace?.importance?.status === 'ok'
      ? Object.fromEntries(workspace.importance.factors.flatMap((f) => (f.r === null ? [] : [[f.key, f.r] as const])))
      : null

  // comments (0018): the count per factor, and the most recent as the drill-down's quote
  const comments: ResultaterModel['comments'] = {}
  for (const c of [...(conversations?.items ?? [])].sort((a, b) => b.openedHour.localeCompare(a.openedHour))) {
    const entry = (comments[c.factorKey] ??= { count: 0, quote: c.opening })
    entry.count += 1
  }

  const timeline = [
    ...closed.map(ref),
    // the round after the last closed one, dashed on the time line as the design draws it
    ...rows
      .filter((r) => r.status !== 'lukket' && r.opensAt)
      .sort((a, b) => (a.opensAt ?? '').localeCompare(b.opensAt ?? ''))
      .slice(0, 1)
      .map(ref),
  ]

  const released = groupRows.filter((g) => g.status === 'ok')
  const now = scores[selected.id] ?? {}
  const lowest = (rowIds: string[]) =>
    rowIds
      .flatMap((id) => Object.entries(now[id] ?? {}).map(([key, v]) => ({ id, key, v })))
      .sort((a, b) => a.v - b.v || factors.indexOf(a.key) - factors.indexOf(b.key))[0]
  // a named row first; Prioritet opens on the whole organisation (Workspace's `choose`);
  // otherwise the lowest released cell, which is where the design opens
  const initialRow =
    scoreRows.find((r) => r.id === params.gruppe && now[r.id])?.id ??
    (params.visning === 'prioritet' && now[ORG] ? ORG : undefined)
  const fallback = lowest(released.map((g) => g.id)) ?? lowest(scoreRows.map((r) => r.id))
  const row = initialRow ?? fallback?.id ?? scoreRows[0]?.id ?? ORG
  const factor =
    params.faktor && factors.includes(params.faktor)
      ? params.faktor
      : initialRow
        ? (lowest([row])?.key ?? factors[0] ?? '')
        : (fallback?.key ?? factors[0] ?? '')

  const model: ResultaterModel = {
    round: ref(selected),
    compare: compareRow ? ref(compareRow) : null,
    previous: previousRow ? ref(previousRow) : null,
    threshold,
    factors,
    rows: scoreRows,
    scores,
    overall,
    measured,
    timeline,
    items,
    importance,
    importanceMinimum: workspace?.importance?.minimum ?? null,
    comments,
    adopted: measures.flatMap((m) => (m.playbookKey ? [m.playbookKey] : [])),
    plan: isPulse
      ? measures.flatMap((m) =>
          (m.step === 'pagar' || m.step === 'gjennomfort' || m.step === 'effekt_malt') && factors.includes(m.factorKey)
            ? [
                {
                  id: m.id,
                  title: m.title,
                  factorKey: m.factorKey,
                  owner: m.owner?.name ?? null,
                  step: m.step,
                },
              ]
            : [],
        )
      : [],
    questionCount: selected.questionCount,
    initial: { view: params.visning ?? 'varmekart', row, factor },
  }

  const nextPulse = rows
    .filter((r) => r.kind === 'puls' && r.status === 'planlagt' && r.opensAt)
    .sort((a, b) => (a.opensAt ?? '').localeCompare(b.opensAt ?? ''))[0]

  return (
    <ResultaterFrame
      model={model}
      grunnlinjer={[...grunnlinjer].reverse().map(ref)}
      pulses={closed.filter((r) => r.kind === 'puls').map(ref)}
      latestGrunnlinjeId={latestGrunnlinje?.id ?? null}
      summary={summary}
      recommendation={workspace?.recommendation ?? null}
      participation={participation}
      nextPulseAt={nextPulse?.opensAt ?? null}
      unanswered={unanswered}
      planCount={measures.filter((m) => m.step === 'besluttet' || m.step === 'pagar').length}
    />
  )
}
