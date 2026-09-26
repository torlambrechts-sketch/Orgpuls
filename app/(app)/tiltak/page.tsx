import { countView } from '@/lib/analytics/product'
import { getLocale, getTranslations } from 'next-intl/server'
import type { BoardCard, BoardModel, Column, MeasurePoint } from '@/components/tiltak/Board'
import { TiltakScreen, type StatusFilter, type TiltakView } from '@/components/tiltak/TiltakScreen'
import { playbookEntry, playbookFor } from '@/lib/playbook/registry'
import { getResultsDigest, type ResultsDigest } from '@/lib/results/digest'
import { getRoundFactorKeys, type RoundRow } from '@/lib/rounds/read'
import type { Measure } from '@/lib/measures/read'
import { getFactors } from '@/lib/instrument/read'
import { getMeasures } from '@/lib/measures/read'
import { getEmployees, getGroups } from '@/lib/org/read'
import { getModuleMeasures } from '@/lib/modules/measures'
import { STEP_KEYS } from '@/lib/measures/read'
import { ModuleMeasures } from '@/components/tiltak/ModuleMeasures'
import { getLatestClosedRoundId, getRoundRows } from '@/lib/rounds/read'

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
  searchParams: Promise<{ status?: string; maling?: string; tildelt?: string; forslag?: string; fane?: string; kort?: string }>
}) {
  const params = await searchParams
  const [measures, employees, groups, factors, newMeasureRoundId, allRounds] = await Promise.all([
    getMeasures(),
    getEmployees(),
    getGroups(),
    getFactors(),
    getLatestClosedRoundId(),
    getRoundRows(),
    countView('measures_viewed'),
  ])
  const tab = params.fane === 'liste' ? 'liste' : 'tavle'

  // Forslag's indices and the Tavle's scores in one call (0044). The Tavle reads the latest
  // grunnlinje's workspace, whose history already holds every closed round's summary, so
  // the latest closed round's is asked for separately only when there is no workspace.
  const latestG =
    tab === 'tavle'
      ? (allRounds
          .filter((r) => r.status === 'lukket' && r.kind === 'grunnlinje')
          .sort((a, b) => (a.closesAt ?? '').localeCompare(b.closesAt ?? ''))
          .at(-1) ?? null)
      : null
  const digest = await getResultsDigest({
    summaries: latestG ? [] : [newMeasureRoundId],
    workspace: latestG?.id ?? null,
  })

  /*
   * "Forslag fra resultatene" orders the factors by the latest closed round's indices and
   * opens the lowest (D-61). With no closed round, or one under the threshold, there are
   * no indices: the chips then stand in the instrument's order and carry no score, and
   * the lead says so, rather than printing a number nothing measured.
   */
  const summary = newMeasureRoundId
    ? (digest.summaries.get(newMeasureRoundId) ??
      digest.workspace?.history.find((h) => h.round_id === newMeasureRoundId)?.summary ??
      null)
    : null
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

  const board = tab === 'tavle' ? await buildBoard(measures, groups, allRounds, digest, params.kort ?? null) : null

  const view: TiltakView = {
    tab,
    board,
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

  // measures from an industry module, beside the board (D-115)
  const moduleMeasures = await getModuleMeasures()
  const tt = await getTranslations()
  return (
    <>
      <TiltakScreen view={view} />
      {moduleMeasures.length ? (
        <div className="mx-auto max-w-page px-[16px] pb-[60px] md:px-[28px]">
          <ModuleMeasures
            rows={moduleMeasures.map((m) => ({
              id: m.id,
              title: m.title,
              goal: m.goal,
              step: m.step,
              dueDate: m.dueDate,
              ownerId: m.ownerId,
              factor: tt('tiltak.module.factor', { module: m.moduleName, factor: m.factorName }),
              remeasure: tt('tiltak.module.remeasure', { code: m.statement.code, statement: m.statement.text }),
            }))}
            steps={STEP_KEYS.map((k) => ({ value: k, label: tt(`tiltak.step.${k}`) }))}
            owners={employees.map((e) => ({ value: e.id, label: e.name }))}
            labels={{
              head: tt('tiltak.module.head'),
              lead: tt('tiltak.module.lead'),
              step: tt('tiltak.fieldStatus'),
              due: tt('tiltak.fieldDue'),
              owner: tt('tiltak.fieldOwner'),
              ownerUnset: tt('tiltak.ownerUnset'),
              saved: tt('tiltak.module.saved'),
              problems: {
                invalid: tt('tiltak.module.problem.denied'),
                denied: tt('tiltak.module.problem.denied'),
                closingRule: tt('tiltak.module.problem.closingRule'),
              },
            }}
          />
        </div>
      ) : null}
    </>
  )
}

const COLUMN_OF: Partial<Record<Measure['step'], Column>> = {
  foreslatt: 'funn',
  besluttet: 'fokus',
  pagar: 'pagar',
  gjennomfort: 'pagar',
  effekt_malt: 'effekt',
}

/**
 * The Tavle's model (D-75). Scores come from the latest grunnlinje through
 * `results_workspace` (0037), which the page reads in its one `results_digest` call (0044):
 * a measure for one released department is scored on that department, anything else on the
 * whole organisation. A finding is a factor nobody has a measure on, at its lowest released
 * score — the three lowest make the Funn column.
 */
async function buildBoard(
  measures: Measure[],
  groups: { id: string; name: string }[],
  rounds: RoundRow[],
  digest: ResultsDigest,
  kort: string | null,
): Promise<BoardModel> {
  const t = await getTranslations()
  const locale = await getLocale()
  const closed = rounds.filter((r) => r.status === 'lukket').sort((a, b) => (a.closesAt ?? '').localeCompare(b.closesAt ?? ''))
  const latestG = closed.filter((r) => r.kind === 'grunnlinje').at(-1) ?? null
  const previousG = closed.filter((r) => r.kind === 'grunnlinje').at(-2) ?? null
  // measurement points are the rounds still to come; one already open is being measured now
  const upcoming = rounds
    .filter((r) => r.status === 'planlagt' && r.opensAt)
    .sort((a, b) => (a.opensAt ?? '').localeCompare(b.opensAt ?? ''))

  const workspace = latestG ? digest.workspace : null
  const upcomingKeys = await Promise.all(
    upcoming.map((r) => (r.kind === 'puls' ? getRoundFactorKeys(r.id) : Promise.resolve(null))),
  )

  const history = new Map((workspace?.history ?? []).map((h) => [h.round_id, h]))
  const now = latestG ? history.get(latestG.id) : undefined
  const before = previousG ? history.get(previousG.id) : undefined
  const orgNow = now?.summary?.status === 'ok' && now.summary.scope === 'org' ? now.summary.factors : []
  const orgBefore = before?.summary?.status === 'ok' ? before.summary.factors : []
  const groupNow = new Map((now?.groups?.groups ?? []).filter((g) => g.status === 'ok' && g.factors).map((g) => [g.group_name, g.factors!]))
  const orgVal = (k: string) => orgNow.find((f) => f.key === k)?.index ?? null
  const groupVal = (name: string, k: string) => groupNow.get(name)?.find((f) => f.key === k)?.index ?? null
  const items = workspace?.items
  const statementsOf = (scope: string | null, k: string) =>
    (scope === null ? (items?.scope === 'org' ? items.items : []) : (items?.groups.find((g) => g.group_name === scope)?.items ?? [])).filter(
      (i) => i.key === k,
    )

  const nameOf = new Map(groups.map((g) => [g.id, g.name]))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date())
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date(Date.now() - 86_400_000))
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', ...o }).format(new Date(iso)).replace(/(\p{L})\.$/u, '$1')

  const scoreOf = (k: string, groupIds: string[]) => {
    const name = groupIds.length === 1 ? nameOf.get(groupIds[0]!) : undefined
    const g = name ? groupVal(name, k) : null
    const o = orgVal(k)
    if (name && g !== null) return { score: g, scope: name, delta: o !== null ? { value: g - o, against: 'avg' as const } : null }
    const was = orgBefore.find((f) => f.key === k)?.index
    return { score: o, scope: null, delta: o !== null && was !== undefined ? { value: o - was, against: 'year' as const } : null }
  }
  const followed = (k: string, scope: string | null, playbookKey: string | null) => {
    const list = statementsOf(scope, k)
    const watch = playbookKey ? playbookEntry(playbookKey)?.watch : undefined
    const pick = watch !== undefined ? list.find((i) => i.ordinal === watch) : [...list].sort((a, b) => a.index - b.index)[0]
    if (pick) return { ordinal: pick.ordinal, index: pick.index }
    return watch !== undefined ? { ordinal: watch, index: null } : null
  }

  const cards: BoardCard[] = measures.flatMap((m) => {
    const column = COLUMN_OF[m.step]
    if (!column) return []
    const s = scoreOf(m.factorKey, m.groupIds)
    const due = m.dueDate
      ? {
          text:
            m.dueDate === yesterday && m.late
              ? t('tiltak.board.dueYesterday')
              : m.late
                ? t('tiltak.board.dueLapsed', { date: fmt(`${m.dueDate}T12:00:00Z`, { day: 'numeric', month: 'long' }) })
                : t('tiltak.board.dueOn', { date: fmt(`${m.dueDate}T12:00:00Z`, { day: 'numeric', month: 'long' }) }),
          late: m.late,
        }
      : null
    return [
      {
        id: m.id,
        measureId: m.id,
        column,
        step: m.step,
        factorKey: m.factorKey,
        score: s.score,
        groups: m.groupIds.map((id) => nameOf.get(id) ?? '').filter(Boolean),
        groupIds: m.groupIds,
        delta: s.delta,
        title: m.title,
        suggestionKey: null,
        owner: m.owner?.name ?? null,
        due,
        effectNote: m.effectNote,
        target: m.target,
        playbookKey: m.playbookKey,
        statement: followed(m.factorKey, s.scope, m.playbookKey),
        start: m.createdAt,
        // a late measure is still being carried out: its bar runs to today, not to the lapsed date
        dueDate: m.late && m.dueDate && m.dueDate < today ? today : m.dueDate,
      },
    ]
  })

  // findings: factors nobody has a measure on, at their lowest released score
  const adopted = measures.flatMap((m) => (m.playbookKey ? [m.playbookKey] : []))
  const covered = new Set(measures.filter((m) => m.step !== 'lukket').map((m) => m.factorKey))
  const findings = orgNow
    .filter((f) => !covered.has(f.key))
    .map((f) => {
      const low = [...groupNow.entries()]
        .map(([name, fs]) => ({ name, v: fs.find((x) => x.key === f.key)?.index ?? null }))
        .filter((x): x is { name: string; v: number } => x.v !== null)
        .sort((a, b) => a.v - b.v)[0]
      return low && low.v < f.index ? { key: f.key, v: low.v, group: low.name } : { key: f.key, v: f.index, group: null as string | null }
    })
    .sort((a, b) => a.v - b.v)
    .slice(0, 3)
  for (const f of findings) {
    const groupId = f.group ? groups.find((g) => g.name === f.group)?.id : undefined
    const s = scoreOf(f.key, groupId ? [groupId] : [])
    cards.push({
      id: `funn:${f.key}`,
      measureId: null,
      column: 'funn',
      step: null,
      factorKey: f.key,
      score: s.score,
      groups: f.group ? [f.group] : [],
      groupIds: groupId ? [groupId] : [],
      delta: s.delta,
      title: null,
      suggestionKey: playbookFor(f.key).find((e) => !adopted.includes(e.key))?.key ?? null,
      owner: null,
      due: null,
      effectNote: null,
      target: null,
      playbookKey: null,
      statement: followed(f.key, s.scope, null),
      start: null,
      dueDate: null,
    })
  }

  // the measurement points: what is open or planned, in order
  const points: MeasurePoint[] = upcoming.map((r, i) => {
    const at = r.opensAt!
    const thisYear = at.slice(0, 4) === today.slice(0, 4)
    return {
      at,
      label: thisYear ? fmt(at, { day: 'numeric', month: 'short' }) : fmt(at, { month: 'short', year: 'numeric' }),
      title: t(`malinger.kind.${r.kind === 'puls' ? 'puls' : 'grunnlinje'}`),
      meta: r.kind === 'puls' ? t('malinger.questionCount', { count: r.questionCount }) : t('tiltak.board.allFactors'),
      factors: upcomingKeys[i] ?? null,
    }
  })

  // the plan: this month and the four after it, named by the season it opens in
  const [y, mo] = today.split('-').map(Number) as [number, number]
  const monthStart = (k: number) => new Date(Date.UTC(y, mo - 1 + k, 1)).toISOString()
  const season = ['vinter', 'vinter', 'var', 'var', 'var', 'sommer', 'sommer', 'sommer', 'host', 'host', 'host', 'vinter'][mo - 1]!
  const window = {
    start: monthStart(0),
    end: monthStart(5),
    months: Array.from({ length: 5 }, (_, k) => {
      const m = fmt(monthStart(k), { month: 'short' })
      return m.charAt(0).toLocaleUpperCase(locale) + m.slice(1)
    }),
    title: t('tiltak.board.planTitle', { season: t(`tiltak.board.season.${season}`), year: y }),
  }

  const pagar = cards.filter((c) => c.column === 'pagar')
  const initial =
    (kort && cards.some((c) => c.id === kort) ? kort : null) ??
    pagar.find((c) => c.due?.late)?.id ??
    pagar[0]?.id ??
    cards[0]?.id ??
    null

  return { cards, groups, adopted, roundId: latestG?.id ?? null, points, window, initial }
}

