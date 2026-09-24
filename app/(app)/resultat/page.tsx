import {
  ResultatScreen,
  type GroupChip,
  type HeatRow,
  type ResultatBody,
  type ResultatView,
  type Scope,
  type ScreenFactor,
} from '@/components/resultat/ResultatScreen'
import { getCommentThemes, getConversations, type Conversation } from '@/lib/conversations/read'
import { getFactors } from '@/lib/instrument/read'
import { getMeasures } from '@/lib/measures/read'
import { getViewerRole } from '@/lib/org/read'
import { getScreeningCounts } from '@/lib/report/tail'
import { screeningTally } from '@/lib/report/screening'
import { getShellContext } from '@/lib/shell/read'
import { themeTone } from '@/lib/conversations/rules'
import { getResultsByGroup, getResultsSummary } from '@/lib/results/read'
import { getRoundFactorKeys, getRounds } from '@/lib/rounds/read'

/**
 * Resultat — the data half. Bundle lines 692-908; the rendering is in
 * components/resultat/ResultatScreen.tsx.
 *
 * Every figure the screen prints comes back from a SECURITY DEFINER RPC that has
 * already applied k: the factor indices and the overall index from `results_summary`,
 * the group grid from `results_by_group`, the response rate from `participation`.
 * Nothing is computed from raw answers here, because no client role may read them —
 * app.responses and app.answers have RLS enabled with no policy and no grant.
 *
 * The k path is visible rather than hidden. Administrasjon answered 3 against a
 * threshold of 5, so `results_by_group` returns `insufficient_data` for it and no
 * factor rows at all: its line in the grid is dashes and selecting it shows the
 * design's "Skjult av terskelen" card. That is the product working, and the screen
 * says so instead of leaving a gap that reads as a defect.
 *
 * What the design shows and this screen does not, each because the schema cannot back
 * it and none of it replaced by a plausible placeholder — docs/DEVIATIONS.md D-10..D-17:
 * the industry benchmark, "Anbefaler oss" and "Åpenhet", the modelled lift per
 * proposal, the per-factor annotations, the quotes and comment threads, the screening
 * count, the per-statement distributions, and a department's own overall index.
 */
export const dynamic = 'force-dynamic'

export default async function ResultatPage({
  searchParams,
}: {
  searchParams: Promise<{ maling?: string; avdeling?: string }>
}) {
  const params = await searchParams
  const [rounds, instrument, measures] = await Promise.all([getRounds(), getFactors(), getMeasures()])
  // which playbook suggestions this organisation has already made into measures
  const adoptedKeys = measures.flatMap((m) => (m.playbookKey ? [m.playbookKey] : []))

  /**
   * Chip order. The design lists the rounds that have been run, most recent first, and
   * leaves the one that has not gone out at the end — so it is "closed first, then by
   * closing date", not the rounds list's plain date order. `getRounds` already returns
   * them by closing date, and Array.prototype.sort is stable, so this only moves the
   * unclosed ones to the back.
   *
   * The design's one unsent chip is the next round ("Puls 1 · 2026 — går ut 12. oktober").
   * Rounds planned beyond it are left out: the year wheel plans a year ahead, and four chips
   * for rounds with no answers and no date soon would crowd the ones that have results.
   */
  const ordered = [...rounds].filter((r) => r.state !== 'planlagt').sort(
    (a, b) => Number(a.status !== 'lukket') - Number(b.status !== 'lukket'),
  )
  const selected = ordered.find((r) => r.id === params.maling) ?? ordered[0]

  const chips = ordered.map((r) => ({
    id: r.id,
    kind: r.kind,
    year: r.year,
    pulseNo: r.pulseNo,
    closesAt: r.closesAt,
    closed: r.status === 'lukket',
  }))

  if (!selected) {
    return (
      <ResultatScreen
        view={{
          rounds: [],
          selectedId: '',
          groups: [],
          scope: { kind: 'org' },
          threshold: 5,
          body: { kind: 'masked', group: null, protected: false },
          adoptedKeys,
        }}
      />
    )
  }

  // the round to compare against: the most recent one of the same kind closed before this
  // one — a puls against the puls before it, a grunnlinje against the last grunnlinje, as
  // the design pairs them (bundle 2950-2953). D-46.
  const previous = ordered.find(
    (r) =>
      r.id !== selected.id &&
      r.kind === selected.kind &&
      r.status === 'lukket' &&
      !!r.closesAt &&
      !!selected.closesAt &&
      r.closesAt < selected.closesAt,
  )

  const [summary, prior, byGroup, priorByGroup, factorKeys] = await Promise.all([
    getResultsSummary(selected.id),
    previous ? getResultsSummary(previous.id) : Promise.resolve(null),
    getResultsByGroup(selected.id),
    previous ? getResultsByGroup(previous.id) : Promise.resolve(null),
    getRoundFactorKeys(selected.id),
  ])

  const participation = selected.participation
  const threshold = byGroup?.threshold ?? summary?.threshold ?? 5

  /**
   * Department order is the organisation's own (app.groups.sort_order, carried by
   * `participation`), not the alphabetical order `results_by_group` returns: the
   * design lists Drift, Prosjekt, Verksted, Administrasjon, which is the order the
   * groups were created in. The counts come from `results_by_group`, because the
   * number that governs masking is responses, not the people who were invited.
   */
  const results = new Map((byGroup?.groups ?? []).map((g) => [g.group_name, g]))
  const groupOrder = [...(participation?.groups ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((g) => g.group_name)
  for (const g of byGroup?.groups ?? []) {
    if (!groupOrder.includes(g.group_name)) groupOrder.push(g.group_name)
  }
  const groups: GroupChip[] = groupOrder.map((name) => ({
    name,
    n: results.get(name)?.n ?? 0,
  }))

  const groupResult = params.avdeling ? results.get(params.avdeling) : undefined
  const scope: Scope = groupResult
    ? { kind: 'group', name: groupResult.group_name }
    : { kind: 'org' }

  const frame = (body: ResultatBody): ResultatView => ({
    rounds: chips,
    selectedId: selected.id,
    groups,
    scope,
    threshold,
    body,
    adoptedKeys,
  })

  // a round nobody has been asked yet: the design's dashed empty card
  if (selected.status === 'planlagt') {
    return <ResultatScreen view={frame({ kind: 'notSent', factorKeys })} />
  }

  // below the threshold: the server withheld the figures, and the screen says which
  const withheld =
    scope.kind === 'group' ? groupResult?.status !== 'ok' : summary?.status !== 'ok'
  if (withheld) {
    // an avdelingsleder's own department comes back from results_summary, named by it
    const ownProtected =
      summary?.status === 'protected' && summary.scope_label
        ? { name: summary.scope_label, n: summary.n }
        : null
    return (
      <ResultatScreen
        view={frame({
          kind: 'masked',
          group: groupResult ? { name: groupResult.group_name, n: groupResult.n } : ownProtected,
          protected: groupResult
            ? groupResult.status === 'protected'
            : summary?.status === 'protected',
        })}
      />
    )
  }

  const scopeFactors =
    scope.kind === 'group'
      ? (groupResult?.factors ?? [])
      : summary?.status === 'ok'
        ? summary.factors
        : []

  const before = new Map<string, number>(
    (scope.kind === 'group'
      ? (priorByGroup?.groups.find((g) => g.group_name === scope.name)?.factors ?? [])
      : prior?.status === 'ok'
        ? prior.factors
        : []
    ).map((f) => [f.key, f.index]),
  )

  const ordinalsOf = new Map(instrument.map((f) => [f.key, f.ordinals]))
  const lawOf = new Map(instrument.map((f) => [f.key, f.lawRef]))
  const positionOf = new Map(instrument.map((f, i) => [f.key, i]))

  const factors: ScreenFactor[] = scopeFactors
    .map((f) => {
      const was = before.get(f.key)
      return {
        key: f.key,
        lawRef: lawOf.get(f.key) ?? '',
        index: f.index,
        band: f.band,
        delta: was === undefined ? null : f.index - was,
        ordinals: ordinalsOf.get(f.key) ?? [],
      }
    })
    // "Sortert etter risiko": lowest index first, the instrument's order breaking ties
    .sort(
      (a, b) =>
        a.index - b.index || (positionOf.get(a.key) ?? 0) - (positionOf.get(b.key) ?? 0),
    )

  const heat: HeatRow[] = groups.map((g) => {
    const row = results.get(g.name)
    return {
      name: g.name,
      n: g.n,
      values: row?.factors
        ? Object.fromEntries(row.factors.map((f) => [f.key, f.index]))
        : null,
      protected: row?.status === 'protected',
    }
  })

  const overallIndex = scope.kind === 'org' && summary?.status === 'ok' ? summary.index : null
  const priorIndex = prior?.status === 'ok' ? prior.index : null

  const n = scope.kind === 'group' ? (groupResult?.n ?? 0) : summary?.status === 'ok' ? summary.n : 0
  const pct =
    scope.kind === 'group'
      ? (participation?.groups.find((g) => g.group_name === scope.name)?.pct ?? null)
      : (participation?.pct ?? null)

  /*
   * The Samtaler column (D-54): this round's comments, from the same k-gated RPC Samtaler
   * reads. Only for the whole organisation — the RPC never says which department a
   * comment came from, so on a department's view the column could not honestly be
   * "the comments that belong to this selection", and it is left out rather than filled
   * with everyone's.
   *
   * The design's order: what is still waiting, longest first, then what has been
   * answered; three at most, the rest a click away on Samtaler.
   */
  const RANK: Record<Conversation['state'], number> = { venter: 0, dialog: 1, lukket: 2 }
  const [conversations, role, screeningCounts, shell, commentThemes] =
    scope.kind === 'org'
      ? await Promise.all([
          getConversations(selected.id),
          getViewerRole(),
          getScreeningCounts(selected.id),
          getShellContext(),
          getCommentThemes(selected.id),
        ])
      : [null, null, null, null, null]

  // "Hva de skrev" (D-56): counts only, and only what comment_themes released
  const written =
    commentThemes?.status === 'ok'
      ? {
          wrote: commentThemes.wrote,
          n: commentThemes.n,
          threshold: commentThemes.threshold,
          themes: commentThemes.themes.map((th) => ({
            key: th.key,
            comments: th.comments,
            people: th.people,
            tone: themeTone(th),
          })),
        }
      : null

  /*
   * The screening strip (D-55): the same k-gated counts section 7 of the report prints,
   * read by the same rule. Whole organisation only, as the RPC is — it has no group
   * parameter, by design — and only for a round that asked about krenkende atferd.
   */
  const screeningLines =
    screeningCounts?.status === 'ok'
      ? screeningCounts.questions.map((q) => ({ key: q.key, answered: q.answered, ...screeningTally(q.options) }))
      : []
  const krenkende = screeningLines.find((q) => q.key === 'krenkende')
  const screening = krenkende
    ? {
        krenkende,
        // violence is printed beside it only when somebody said yes; the design's strip is
        // krenkende atferd, and a "0 av 28" line under it would be noise
        vold: screeningLines.find((q) => q.key === 'vold' && q.yes > 0) ?? null,
        lawMode: shell?.lawMode ?? true,
      }
    : null
  const threads = (conversations?.items ?? [])
    .slice()
    .sort((a, b) => RANK[a.state] - RANK[b.state] || b.waitingDays - a.waitingDays)
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      factorKey: c.factorKey,
      text: c.opening,
      state: c.state,
      waitingDays: c.waitingDays,
      reply: c.messages.filter((m) => m.author === 'leder').at(-1)?.body ?? null,
    }))

  return (
    <ResultatScreen
      view={frame({
        kind: 'results',
        threads,
        written,
        screening,
        // styling only; reply_to_thread checks the role itself against auth.uid()
        canReply: role === 'daglig_leder' || role === 'avdelingsleder',
        n,
        headcount: participation?.headcount ?? null,
        pct,
        overallIndex,
        overallDelta:
          overallIndex !== null && priorIndex !== null ? overallIndex - priorIndex : null,
        hasPrevious: !!previous,
        factors,
        factorKeys,
        instrumentSize: instrument.length,
        heat,
      })}
    />
  )
}
