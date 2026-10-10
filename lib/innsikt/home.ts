import 'server-only'
import { getLocale, getTranslations } from 'next-intl/server'
import { isFreePlan } from '@/lib/billing/read'
import { getConversations, type Conversation } from '@/lib/conversations/read'
import { getMeasures, type Measure } from '@/lib/measures/read'
import { getCurrentOrgId } from '@/lib/org/current'
import { getOrgMarket } from '@/lib/org/market'
import { factorLawRef } from '@/lib/legal/pack'
import { DEFAULT_MARKET } from '@/lib/markets'
import { getGroups, getOrganization, getViewerRole } from '@/lib/org/read'
import { getResultsDigest } from '@/lib/results/digest'
import type { FactorResult } from '@/lib/results/read'
import { getRiskAssessment } from '@/lib/risk/read'
import { getRoundRows, type RoundRow } from '@/lib/rounds/read'
import { roundTitle } from '@/lib/rounds/title'
import { getRoundSetup } from '@/lib/setup/read'
import { getShellContext, getViewer } from '@/lib/shell/read'
import type { Band } from '@/components/ui/Risk'
import { place, spread, type QuadPoint } from './map'
export type { QuadPoint } from './map'
import { recordInnsiktVisit } from './visit'

/**
 * Innsikt's two views, from rows (D-244). The design (`IX()`, Orgpuls.dc.html 2928-3109) draws
 * literals; every figure here is a reader's, and a block with nothing behind it is left out or
 * drawn empty, never filled with a plausible number. What the design states that no row holds is
 * listed in docs/DEVIATIONS.md D-244.
 *
 * The round the page stands on is the latest closed grunnlinje, else the latest closed round
 * (D-46); its comparison is the previous closed round of the same kind, and none on the free
 * plan (D-217). Everything about results arrives through `results_digest` (0044), k-gated and
 * scoped to the caller in the database: an avdelingsleder's figures are their department's, and
 * «Anbefaler oss» and «betydning» are refused to them, which arrives here as null.
 */

type T = Awaited<ReturnType<typeof getTranslations>>
export type Tone = 'danger' | 'good' | 'muted'
export type Dot = 'red' | 'yellow' | 'green'

const DAY = 86_400_000
const toneOf = (d: number | null): Tone => (d === null ? 'muted' : d <= -3 ? 'danger' : d >= 3 ? 'good' : 'muted')
export const signed = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`
const iso = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(d)
const noon = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00Z`)

async function base() {
  const t = await getTranslations()
  const locale = await getLocale()
  const orgId = await getCurrentOrgId()
  const [org, role, rounds, viewer, shell, free] = await Promise.all([
    getOrganization(),
    getViewerRole(),
    getRoundRows(),
    getViewer(),
    getShellContext(),
    isFreePlan(orgId),
  ])

  const closed = rounds.filter((r) => r.status === 'lukket')
  const open = rounds.find((r) => r.status === 'apen') ?? null
  const current = closed.find((r) => r.kind === 'grunnlinje') ?? closed[0] ?? null
  const previous = current && !free ? (closed.find((r) => r !== current && r.kind === current.kind) ?? null) : null
  const planned = rounds.filter((r) => r.status === 'planlagt' && r.opensAt).sort((a, b) => (a.opensAt ?? '').localeCompare(b.opensAt ?? ''))

  const [digest, risk, measures, conversations, setup, groups] = await Promise.all([
    getResultsDigest({
      participation: [current?.id, previous?.id],
      summaries: [current?.id, previous?.id],
      workspace: current?.id ?? null,
    }),
    current ? getRiskAssessment(current.id) : null,
    getMeasures(),
    // a verneombud reads no comments: the call is refused, and arrives as null
    getConversations(null),
    current ? getRoundSetup(current.id) : null,
    getGroups(),
  ])

  const summary = current ? (digest.summaries.get(current.id) ?? null) : null
  const prior = previous ? (digest.summaries.get(previous.id) ?? null) : null
  const ok = summary?.status === 'ok' ? summary : null
  const before = prior?.status === 'ok' ? prior : null
  const rate = current ? (digest.participation.get(current.id) ?? null) : null
  const priorRate = previous ? (digest.participation.get(previous.id) ?? null) : null
  const workspace = digest.workspace
  const recommendation = workspace?.recommendation?.status === 'ok' ? workspace.recommendation : null
  const importance = workspace?.importance?.status === 'ok' ? workspace.importance : null
  const importanceMinimum = workspace?.importance?.minimum ?? null
  const groupsNow = workspace?.history.find((h) => h.round_id === current?.id)?.groups ?? null
  const groupsBefore = previous ? (workspace?.history.find((h) => h.round_id === previous.id)?.groups ?? null) : null

  const fmt = (day: string | null, opts: Intl.DateTimeFormatOptions) =>
    day ? new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', ...opts }).format(noon(day)) : ''
  // «14. september»; the year only when it is not this one
  const thisYear = iso(new Date()).slice(0, 4)
  const dayMonth = (day: string | null) =>
    fmt(day, { day: 'numeric', month: 'long', ...(day && day.slice(0, 4) !== thisYear ? { year: 'numeric' } : {}) })
  // «14. sep», without nb-NO's abbreviation dot (see the year rail, D-25)
  const short = (day: string | null) => fmt(day, { day: 'numeric', month: 'short' }).replace(/\.$/, '')
  const month = (day: string | null) => fmt(day, { month: 'short' }).replace(/\.$/, '').toUpperCase()
  const title = (r: RoundRow) => roundTitle(t, r)
  const factor = (key: string, form: 'label' | 'map' = 'label') => (t.has(`factor.${key}.${form}`) ? t(`factor.${key}.${form}`) : key)
  const lower = (s: string) => s.toLocaleLowerCase(locale)

  const delta = ok && before ? ok.index - before.index : null
  const was = new Map((before?.factors ?? []).map((f) => [f.key, f.index]))
  const imp = new Map((importance?.factors ?? []).map((f) => [f.key, f.r]))

  return {
    t,
    locale,
    orgId,
    org,
    role,
    viewer,
    shell,
    free,
    rounds,
    closed,
    open,
    current,
    previous,
    planned,
    risk,
    measures,
    conversations,
    setup,
    groups,
    summary,
    ok,
    before,
    rate,
    priorRate,
    recommendation,
    importance,
    importanceMinimum,
    groupsNow,
    groupsBefore,
    delta,
    was,
    imp,
    fmt,
    dayMonth,
    short,
    month,
    title,
    factor,
    lower,
  }
}

type Base = Awaited<ReturnType<typeof base>>

/* ------------------------------------------------------------------ shared by both views */

export interface ModeLabels {
  label: string
  /** the group's accessible name: the shell has a «Visning» switch of its own */
  group: string
  enkel: string
  avansert: string
}

function modeLabels(t: T): ModeLabels {
  return { label: t('innsikt.mode.label'), group: t('innsikt.mode.group'), enkel: t('innsikt.mode.enkel'), avansert: t('innsikt.mode.avansert') }
}

/**
 * Open measures: decided and not yet closed (the design's «4 åpne tiltak» over four measures from
 * besluttet to «gjennomført · venter på effekt», bundle 3041-3046). A measure whose effect has been
 * measured is still open until someone closes it.
 */
const isOpen = (m: Measure) => m.step !== 'foreslatt' && m.step !== 'lukket'
const waiting = (cs: Conversation[]) => cs.filter((c) => c.state === 'venter')

/* ------------------------------------------------------------------------------- Enkel */

export interface Kpi {
  key: string
  label: string
  value: string
  sub: string
  tone: Tone
}
export interface FeedItem {
  key: string
  date: string
  dot: Dot
  title: string
  meta: string
}
export interface Todo {
  key: string
  tone: Dot | 'grey'
  title: string
  meta: string
  cta: string
  href: string
  primary: boolean
}
export interface Strength {
  key: string
  label: string
  why: string | null
  index: number
  delta: string | null
  tone: Tone
}
export interface Improvement {
  key: string
  n: number
  title: string
  meta: string
}
export interface WheelPoint {
  key: string
  month: string
  label: string
  state: 'done' | 'current' | 'pending'
}
export interface LawChip {
  key: string
  text: string
  done: boolean
}

export interface EnkelView {
  mode: ModeLabels
  kicker: string
  greeting: string
  lead: string
  reportCta: string
  resultCta: string
  hasResult: boolean
  kpis: Kpi[]
  feedTitle: string
  lastSeen: string | null
  feed: FeedItem[]
  feedEmpty: string
  todoTitle: string
  todos: Todo[]
  todoEmpty: string
  strengthsTitle: string
  strengths: Strength[]
  improveTitle: string
  improve: Improvement[]
  wheelTitle: string
  wheel: WheelPoint[]
  lawTitle: string | null
  laws: LawChip[]
}

function greeting(t: T, name: string | null): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  const part = hour >= 5 && hour < 10 ? 'morning' : hour >= 10 && hour < 18 ? 'day' : 'evening'
  const first = name?.trim().split(/\s+/)[0] ?? ''
  return first ? t(`innsikt.greeting.${part}`, { name: first }) : t(`innsikt.greeting.${part}Plain`)
}

/** The year at a glance, five points at most (bundle 3019-3025), each from a row. */
function wheelOf(b: Base): WheelPoint[] {
  const { t, setup, current, risk, measures, open, planned, month, short, title } = b
  const out: WheelPoint[] = []
  const consulted = (setup?.consultations ?? []).filter((c) => c.confirmed)
  if (consulted.length > 0) {
    const held =
      consulted
        .map((c) => c.heldOn)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null
    out.push({ key: 'forankring', month: held ? month(held) : '', label: t('innsikt.wheel.forankring'), state: 'done' })
  }
  if (current) {
    out.push({ key: 'kartlegging', month: month(current.closesAt), label: t(`malinger.kind.${current.kind}`), state: 'done' })
    const running = measures.some((m) => m.step === 'pagar' || m.step === 'besluttet')
    out.push({
      key: 'now',
      month: t('innsikt.wheel.now'),
      label: t(risk && running ? 'innsikt.wheel.tiltak' : 'innsikt.wheel.risiko'),
      state: 'current',
    })
  }
  const next = open ?? planned[0] ?? null
  const after = planned.find((r) => r.id !== next?.id) ?? null
  if (next) {
    out.push({ key: 'next', month: short(next === open ? next.closesAt : next.opensAt).toUpperCase(), label: title(next), state: 'pending' })
  }
  if (after) out.push({ key: 'after', month: month(after.opensAt), label: title(after), state: 'pending' })
  return out
}

function lawsOf(b: Base): LawChip[] {
  const { t, shell, current, risk, setup, open, planned, measures, short } = b
  if (!shell.lawMode || !current) return []
  const consulted = (setup?.consultations ?? []).filter((c) => c.confirmed)
  const vo = consulted.find((c) => c.kind === 'verneombud_raad')
  const drøftet = consulted.find((c) => c.kind === 'droftet_tillitsvalgte')
  const chips: LawChip[] = [
    { key: '3-1', text: t(risk ? 'innsikt.law.assessed' : 'innsikt.law.assessPending'), done: !!risk },
    { key: '6-2', text: t(vo ? 'innsikt.law.verneombud' : 'innsikt.law.verneombudPending'), done: !!vo },
    {
      key: '9-2',
      text: drøftet
        ? drøftet.heldOn
          ? t('innsikt.law.droftetOn', { date: short(drøftet.heldOn) })
          : t('innsikt.law.droftet')
        : t('innsikt.law.droftetPending'),
      done: !!drøftet,
    },
  ]
  const next = open ?? planned[0] ?? null
  if (next && measures.some(isOpen)) {
    chips.push({ key: 'effekt', text: t('innsikt.law.effect', { date: short(next === open ? next.closesAt : next.opensAt) }), done: false })
  }
  return chips
}

function leadOf(b: Base): string {
  const { t, current, risk, measures, open, planned, title, role } = b
  const first = !current ? t('innsikt.lead.none') : t(risk ? 'innsikt.lead.assessed' : 'innsikt.lead.notAssessed', { kind: current.kind })
  const n = measures.filter(isOpen).length
  const next = open ?? planned[0] ?? null
  const today = noon(iso(new Date())).getTime()
  const days = next && next !== open && next.opensAt ? Math.max(0, Math.round((noon(iso(new Date(next.opensAt))).getTime() - today) / DAY)) : null
  const round = !next
    ? null
    : next === open
      ? t('innsikt.lead.roundOpen', { round: title(next) })
      : days !== null && days > 0
        ? t('innsikt.lead.roundIn', { round: title(next), days })
        : null
  const second =
    n > 0 && round
      ? t('innsikt.lead.measuresAnd', { count: n, round })
      : n > 0
        ? t('innsikt.lead.measures', { count: n })
        : round
          ? t('innsikt.lead.roundOnly', { round })
          : null
  // an avdelingsleder reads their own department, a verneombud no comments: each is told so
  const scope = role === 'avdelingsleder' || role === 'verneombud' ? t(`innsikt.lead.${role}`) : null
  return [first, second, scope].filter(Boolean).join(' ')
}

function feedOf(b: Base): FeedItem[] {
  const { t, measures, conversations, risk, current, closed, rate, open, planned, groups, ok, setup, factor, lower, title } = b
  const today = iso(new Date())
  const groupName = new Map(groups.map((g) => [g.id, g.name]))
  const next = open ?? planned[0] ?? null
  const items: FeedItem[] = []
  const meta = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ')

  for (const m of measures) {
    const where = m.groupIds
      .map((id) => groupName.get(id))
      .filter(Boolean)
      .join(', ')
    if (m.late && m.dueDate) {
      items.push({
        key: `late:${m.id}`,
        date: iso(new Date(noon(m.dueDate).getTime() + DAY)),
        dot: 'red',
        title: t('innsikt.feed.late', { title: m.title }),
        meta: meta(m.owner?.name, where),
      })
    }
    if (m.completedOn) {
      items.push({
        key: `done:${m.id}`,
        date: m.completedOn,
        dot: 'green',
        title: t('innsikt.feed.done', { title: m.title }),
        meta: next ? t('innsikt.feed.doneNext', { round: title(next) }) : meta(m.owner?.name, where),
      })
    }
  }
  for (const c of conversations?.items ?? []) {
    items.push({
      key: `thread:${c.id}`,
      date: c.openedHour.slice(0, 10),
      dot: c.state === 'venter' ? 'yellow' : 'green',
      title: t('innsikt.feed.comment', { factor: lower(factor(c.factorKey)) }),
      meta: t(`innsikt.feed.thread.${c.state}`),
    })
  }
  if (risk && current) {
    const high = ok ? ok.factors.filter((f) => f.band === 'hoy').length : null
    const vo = (setup?.consultations ?? []).some((c) => c.confirmed && c.kind === 'verneombud_raad')
    items.push({
      key: `risk:${risk.id}`,
      date: risk.assessedOn,
      dot: 'green',
      title: t('innsikt.feed.risk'),
      meta: meta(high !== null ? t('innsikt.feed.riskHigh', { count: high }) : null, vo ? t('innsikt.feed.riskVo') : null),
    })
  }
  for (const r of closed) {
    if (!r.closesAt) continue
    const p = r.id === current?.id ? rate : null
    const comments = conversations?.items.filter((c) => c.roundId === r.id).length ?? 0
    items.push({
      key: `closed:${r.id}`,
      date: iso(new Date(r.closesAt)),
      dot: 'green',
      title: t('innsikt.feed.closed', { round: title(r) }),
      meta: meta(
        p ? t('innsikt.feed.answered', { answered: p.answered, headcount: p.headcount }) : null,
        comments > 0 ? t('innsikt.feed.comments', { count: comments }) : null,
      ),
    })
  }
  return items
    .filter((i) => i.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))
    .slice(0, 6)
}

function todosOf(b: Base): Todo[] {
  const { t, measures, conversations, open, planned, dayMonth, title } = b
  const yesterday = iso(new Date(Date.now() - DAY))
  const out: Todo[] = []
  for (const m of measures.filter((m) => m.late).slice(0, 2)) {
    out.push({
      key: m.id,
      tone: 'red',
      title: m.title,
      meta: [
        m.owner?.name ?? t('tiltak.ownerUnset'),
        m.dueDate === yesterday ? t('innsikt.todo.lapsedYesterday') : t('innsikt.todo.lapsed', { date: dayMonth(m.dueDate) }),
      ].join(' · '),
      cta: t('innsikt.todo.update'),
      href: '/tiltak',
      primary: true,
    })
  }
  const w = waiting(conversations?.items ?? [])
  if (w.length > 0) {
    const oldest = Math.max(...w.map((c) => c.waitingDays))
    out.push({
      key: 'comments',
      tone: 'yellow',
      title: t('innsikt.todo.comments', { count: w.length }),
      meta: t('innsikt.todo.commentsOldest', { days: oldest }),
      cta: t('innsikt.todo.reply'),
      href: '/kommentarer',
      primary: out.length === 0,
    })
  }
  const next = open ?? planned[0] ?? null
  if (next && out.length < 3) {
    out.push({
      key: next.id,
      tone: 'grey',
      title: t(next === open ? 'innsikt.todo.openRound' : 'innsikt.todo.nextRound', { round: title(next) }),
      meta: t(next === open ? 'innsikt.todo.openRoundMeta' : 'innsikt.todo.nextRoundMeta', {
        count: next.questionCount,
        date: dayMonth(next === open ? next.closesAt : next.opensAt),
      }),
      cta: t('innsikt.todo.seeRound'),
      href: '/malinger',
      primary: out.length === 0,
    })
  }
  return out.slice(0, 3)
}

function kpisOf(b: Base): Kpi[] {
  const { t, ok, delta, previous, rate, priorRate, recommendation, measures, conversations } = b
  const out: Kpi[] = []
  if (ok) {
    out.push({
      key: 'index',
      label: t('innsikt.kpi.index'),
      value: String(ok.index),
      sub: delta !== null && previous ? t('innsikt.kpi.indexDelta', { delta: signed(delta), year: previous.year }) : '',
      tone: toneOf(delta),
    })
  }
  if (rate) {
    const d = priorRate ? rate.pct - priorRate.pct : null
    out.push({
      key: 'rate',
      label: t('innsikt.kpi.rate'),
      value: t('innsikt.kpi.pct', { pct: rate.pct }),
      sub:
        d !== null
          ? t('innsikt.kpi.rateSubDelta', { answered: rate.answered, headcount: rate.headcount, delta: signed(d) })
          : t('innsikt.kpi.rateSub', { answered: rate.answered, headcount: rate.headcount }),
      tone: d === null ? 'muted' : d > 0 ? 'good' : d < 0 ? 'danger' : 'muted',
    })
  }
  if (recommendation) {
    out.push({
      key: 'enps',
      label: t('innsikt.kpi.enps'),
      value: signed(recommendation.score).replace('±', ''),
      sub: t('innsikt.kpi.enpsSub'),
      tone: 'muted',
    })
  }
  const open = measures.filter(isOpen)
  const late = measures.filter((m) => m.late).length
  out.push({
    key: 'measures',
    label: t('innsikt.kpi.measures'),
    value: String(open.length),
    sub: late > 0 ? t('innsikt.kpi.measuresLate', { count: late }) : t('innsikt.kpi.measuresOnTime'),
    tone: late > 0 ? 'danger' : 'muted',
  })
  if (conversations) {
    const w = waiting(conversations.items)
    out.push({
      key: 'conversations',
      label: t('innsikt.kpi.conversations'),
      value: String(w.length),
      sub:
        w.length > 0 ? t('innsikt.kpi.conversationsOldest', { days: Math.max(...w.map((c) => c.waitingDays)) }) : t('innsikt.kpi.conversationsNone'),
      tone: w.some((c) => c.waitingDays >= 5) ? 'danger' : 'muted',
    })
  }
  return out
}

function strengthsOf(b: Base): Strength[] {
  const { t, ok, was, factor } = b
  if (!ok) return []
  return ok.factors
    .filter((f) => f.band === 'lav')
    .sort((a, c) => c.index - a.index || a.sort_order - c.sort_order)
    .slice(0, 3)
    .map((f) => {
      const p = was.get(f.key)
      const d = p === undefined ? null : f.index - p
      return {
        key: f.key,
        label: factor(f.key),
        why: t.has(`innsikt.why.${f.key}`) ? t(`innsikt.why.${f.key}`) : null,
        index: f.index,
        delta: d === null ? null : signed(d),
        tone: toneOf(d),
      }
    })
}

/**
 * «Her kan dere bli bedre»: the factors outside the safe band, those that move most with the whole
 * first (`results_importance`, 0037) and the lowest first where that cannot be computed. A factor
 * is named on a department when one is ten points or more below the organisation – the gap the
 * design's own rows show – and on the organisation otherwise. The design's «Løfter helheten +6» is
 * left out: no row or rule backs it (Tor, 7 October 2026).
 */
function improveOf(b: Base): Improvement[] {
  const { t, ok, was, imp, groupsNow, groupsBefore, conversations, current, factor } = b
  if (!ok) return []
  const candidates = ok.factors
    .filter((f) => f.band !== 'lav')
    .sort((a, c) => (imp.get(c.key) ?? -2) - (imp.get(a.key) ?? -2) || a.index - c.index || a.sort_order - c.sort_order)
    .slice(0, 3)
  return candidates.map((f, i) => {
    const cells = (groupsNow?.groups ?? [])
      .filter((g) => g.status === 'ok' && g.factors)
      .map((g) => ({ name: g.group_name, index: g.factors!.find((x) => x.key === f.key)?.index }))
      .filter((c): c is { name: string; index: number } => c.index !== undefined)
      .sort((a, c) => a.index - c.index)
    const low = cells[0] && f.index - cells[0].index >= 10 ? cells[0] : null
    if (low) {
      const g = groupsBefore?.groups.find((x) => x.group_name === low.name && x.status === 'ok')
      const p = g?.factors?.find((x) => x.key === f.key)?.index
      const parts = [String(low.index), p !== undefined ? changeText(t, low.index - p) : null, t('innsikt.improve.org', { index: f.index })]
      return {
        key: f.key,
        n: i + 1,
        title: t('innsikt.improve.inGroup', { factor: factor(f.key), group: low.name }),
        meta: parts.filter(Boolean).join(' · '),
      }
    }
    const p = was.get(f.key)
    const comments = conversations?.items.filter((c) => c.factorKey === f.key && c.roundId === current?.id).length ?? 0
    const parts = [
      String(f.index),
      p !== undefined ? changeText(t, f.index - p) : null,
      comments > 0 ? t('innsikt.improve.comments', { count: comments }) : null,
    ]
    return { key: f.key, n: i + 1, title: factor(f.key), meta: parts.filter(Boolean).join(' · ') }
  })
}

function changeText(t: T, d: number): string {
  return d < 0 ? t('innsikt.improve.fell', { n: -d }) : d > 0 ? t('innsikt.improve.rose', { n: d }) : t('innsikt.improve.same')
}

export async function enkelView(): Promise<EnkelView> {
  const b = await base()
  const { t, org, viewer, fmt, dayMonth, ok, shell } = b
  const lastSeen = await recordInnsiktVisit(b.orgId)
  const today = iso(new Date())
  return {
    mode: modeLabels(t),
    kicker: [
      org?.name ?? '',
      t('innsikt.ansatte', { count: org?.employee_count ?? 0 }),
      fmt(today, { weekday: 'long', day: 'numeric', month: 'long' }),
    ]
      .filter(Boolean)
      .join(' · '),
    greeting: greeting(t, viewer.name),
    lead: leadOf(b),
    reportCta: t('innsikt.reportCta'),
    resultCta: t('innsikt.resultCta'),
    hasResult: !!ok,
    kpis: kpisOf(b),
    feedTitle: t('innsikt.feed.title'),
    lastSeen: lastSeen ? t('innsikt.feed.lastSeen', { date: dayMonth(lastSeen) }) : null,
    feed: feedOf(b).map((f) => ({ ...f, date: b.short(f.date) })),
    feedEmpty: t('innsikt.feed.empty'),
    todoTitle: t('innsikt.todo.title'),
    todos: todosOf(b),
    todoEmpty: t('innsikt.todo.empty'),
    strengthsTitle: t('innsikt.strengths.title'),
    strengths: strengthsOf(b),
    improveTitle: t('innsikt.improve.title'),
    improve: improveOf(b),
    wheelTitle: t('innsikt.wheel.title'),
    wheel: wheelOf(b),
    lawTitle: shell.lawMode ? t('innsikt.law.title') : null,
    laws: lawsOf(b),
  }
}

/* ---------------------------------------------------------------------------- Avansert */

export interface FactorRowView {
  key: string
  label: string
  law: string
  index: number
  prev: number | null
  delta: string | null
  tone: Tone
  /** 0-100, the bar's width; null when importance cannot be computed */
  importance: number | null
  band: Band
  bandLabel: string
  next: { text: string; href: string; kind: 'measure' | 'suggest' | 'keep' }
}
export interface FactorGroupView {
  key: Band
  title: string
  note: string
  rows: FactorRowView[]
}

export interface AvansertView {
  mode: ModeLabels
  kicker: string
  h1: string
  lead: string
  roundLabel: string
  compare: { label: string; href: string } | null
  index: { label: string; value: number; delta: string | null; tone: Tone } | null
  bands: { key: Band; count: number; label: string }[]
  rate: { label: string; value: string } | null
  enps: { label: string; value: string } | null
  quad: {
    labels: { prioriter: string; behold: string; folg: string; rute: string; y: string; low: string; x: string; high: string }
    points: QuadPoint[]
    empty: string | null
  }
  table: {
    head: { factor: string; change: string; index: string; delta: string; importance: string; risk: string; next: string }
    groups: FactorGroupView[]
  }
  empty: string | null
}

/**
 * The design's placement (IX `quad`, bundle 3039-3041), as a rule rather than a literal: across by
 * score, 30 to 85; down by importance, the factors that move most with the whole in the top half.
 */
export async function avansertView(): Promise<AvansertView> {
  const b = await base()
  const {
    t,
    current,
    previous,
    ok,
    before,
    rate,
    recommendation,
    importance,
    importanceMinimum,
    was,
    imp,
    measures,
    factor,
    dayMonth,
    title,
    delta,
  } = b
  await recordInnsiktVisit(b.orgId)
  // each factor's reference is its market's law (lib/legal/pack.ts, D-257)
  const market = (await getOrgMarket()) ?? DEFAULT_MARKET

  const kicker = current
    ? [
        title(current),
        rate ? t('innsikt.adv.answered', { answered: rate.answered, headcount: rate.headcount }) : null,
        current.closesAt ? t('innsikt.adv.closed', { date: dayMonth(iso(new Date(current.closesAt))) }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const nextFor = (f: FactorResult): FactorRowView['next'] => {
    const mine = measures.filter((m) => m.factorKey === f.key)
    const running = mine.filter((m) => m.step === 'pagar').length
    const plannedN = mine.filter((m) => m.step === 'foreslatt' || m.step === 'besluttet').length
    if (running > 0) return { text: t('innsikt.adv.running', { count: running }), href: '/tiltak', kind: 'measure' }
    if (plannedN > 0) return { text: t('innsikt.adv.planned', { count: plannedN }), href: '/tiltak', kind: 'measure' }
    if (f.band !== 'lav') return { text: t('innsikt.adv.suggest'), href: '/tiltak', kind: 'suggest' }
    return { text: t('innsikt.adv.keep'), href: '/resultater', kind: 'keep' }
  }

  const rowOf = (f: FactorResult): FactorRowView => {
    const p = was.get(f.key) ?? null
    const d = p === null ? null : f.index - p
    const r = imp.get(f.key)
    return {
      key: f.key,
      label: factor(f.key),
      law: factorLawRef(market, f.key, f.law_ref),
      index: f.index,
      prev: p,
      delta: d === null ? null : signed(d),
      tone: toneOf(d),
      importance: importance ? Math.round((Math.min(0.7, Math.max(0, r ?? 0)) / 0.7) * 100) : null,
      band: f.band,
      bandLabel: t(`band.${f.band}`),
      next: nextFor(f),
    }
  }

  const factors = ok?.factors ?? []
  const asc = [...factors].sort((a, c) => a.index - c.index || a.sort_order - c.sort_order)
  const groups: FactorGroupView[] = (['hoy', 'middels', 'lav'] as Band[])
    .map((band) => {
      const list = asc.filter((f) => f.band === band)
      return {
        key: band,
        title: t(`innsikt.adv.group.${band}`, { count: list.length }),
        note: t(`innsikt.adv.groupNote.${band}`),
        rows: (band === 'lav' ? [...list].reverse() : list).map(rowOf),
      }
    })
    .filter((g) => g.rows.length > 0)

  const bands = ok
    ? (['lav', 'middels', 'hoy'] as Band[]).map((k) => {
        const count = factors.filter((f) => f.band === k).length
        return { key: k, count, label: t(`innsikt.adv.band.${k}`, { count }) }
      })
    : []

  return {
    mode: modeLabels(t),
    kicker,
    h1: t('innsikt.adv.h1'),
    lead: t('innsikt.adv.lead'),
    roundLabel: current ? title(current) : '',
    compare:
      previous && before && current
        ? { label: t('innsikt.adv.compare', { year: previous.year }), href: `/resultater?maling=${current.id}&mot=${previous.id}` }
        : null,
    index: ok
      ? {
          label: t('innsikt.kpi.index'),
          value: ok.index,
          delta: delta !== null && previous ? t('innsikt.kpi.indexDelta', { delta: signed(delta), year: previous.year }) : null,
          tone: toneOf(delta),
        }
      : null,
    bands,
    rate: rate ? { label: t('innsikt.kpi.rate'), value: t('innsikt.kpi.pct', { pct: rate.pct }) } : null,
    enps: recommendation ? { label: t('innsikt.kpi.enps'), value: signed(recommendation.score).replace('±', '') } : null,
    quad: {
      labels: {
        prioriter: t('innsikt.adv.quad.prioriter'),
        behold: t('innsikt.adv.quad.behold'),
        folg: t('innsikt.adv.quad.folg'),
        rute: t('innsikt.adv.quad.rute'),
        y: t('innsikt.adv.quad.y'),
        low: t('innsikt.adv.quad.low'),
        x: t('innsikt.adv.quad.x'),
        high: t('innsikt.adv.quad.high'),
      },
      points: importance
        ? spread(
            factors
              .filter((f) => imp.get(f.key) !== null && imp.get(f.key) !== undefined)
              .map((f) => ({ key: f.key, label: factor(f.key, 'map'), index: f.index, band: f.band, ...place(f.index, imp.get(f.key)!) })),
          )
        : [],
      empty:
        ok && !importance
          ? importanceMinimum !== null
            ? t('innsikt.adv.quad.empty', { minimum: importanceMinimum })
            : t('innsikt.adv.quad.emptyPlain')
          : null,
    },
    table: {
      head: {
        factor: t('innsikt.adv.head.factor'),
        change: previous && before && current ? `${previous.year} → ${current.year}` : current ? String(current.year) : '',
        index: t('innsikt.adv.head.index'),
        delta: t('innsikt.adv.head.delta'),
        importance: t('innsikt.adv.head.importance'),
        risk: t('innsikt.adv.head.risk'),
        next: t('innsikt.adv.head.next'),
      },
      groups,
    },
    empty: ok ? null : current ? t('innsikt.adv.insufficient', { threshold: b.summary?.threshold ?? current.threshold }) : t('innsikt.adv.none'),
  }
}
