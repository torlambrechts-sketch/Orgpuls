import { getLocale, getTranslations } from 'next-intl/server'
import {
  InnsiktScreen,
  type InnsiktView,
  type LoopStep,
  type TodoItem,
  type YearPoint,
} from '@/components/innsikt/InnsiktScreen'
import { getMeasures, stepIndex } from '@/lib/measures/read'
import { getOrganization, getViewerRole } from '@/lib/org/read'
import { assessedOfRequired, getRiskAssessment } from '@/lib/risk/read'
import { getResultsDigest } from '@/lib/results/digest'
import { bandCounts } from '@/lib/results/read'
import { getRoundFactorKeys, getRoundRows } from '@/lib/rounds/read'
import { roundTitle } from '@/lib/rounds/title'
import { getRoundSetup } from '@/lib/setup/read'
import { getShellContext } from '@/lib/shell/read'
import { getShellPrefs } from '@/lib/shell/prefs.server'
import { Oversikt } from '@/components/oversikt/Oversikt'

/**
 * Innsikt — the data half. Bundle lines 152-268; the rendering is in
 * components/innsikt/InnsiktScreen.tsx.
 *
 * The screen is a picture of where the organisation stands in § 3-1 bokstav c, so every
 * block of it is a question to the database rather than a state of the page:
 *
 *   kartlagt       the most recent closed round, and when it closed
 *   risikovurdert  app.risk_assessments for that round — the table 0016 added, and the
 *                  reason three blocks here could not be rendered before
 *   tiltak løper   app.measures at step `pagar`, and how many are past their deadline
 *   effekt målt    the open round, which is what will measure whether they worked
 *
 * "Løper" is `pagar` specifically, not "not closed". A measure that is decided but not
 * started is not running, and one whose effect has been measured has stopped; the design
 * prints 2 over a fixture that holds four measures short of closed, and `pagar` is the
 * reading that produces it from data rather than from a literal.
 */
export const dynamic = 'force-dynamic'

export default async function InnsiktPage() {
  // Enkel's landing page is Oversikt at the same address (design 3: `isOverview` is the
  // home screen in Enkel), so the nav's first entry is one place in either view. D-71.
  if ((await getShellPrefs()).view === 'enkel') return <Oversikt />

  const t = await getTranslations()
  const locale = await getLocale()
  const [org, role, rounds] = await Promise.all([
    getOrganization(),
    getViewerRole(),
    getRoundRows(),
  ])

  const closed = rounds.filter((r) => r.status === 'lukket')
  // the round still taking answers: what will measure whether the measures worked
  const open = rounds.find((r) => r.status === 'apen') ?? null

  const current = closed[0] ?? null
  // "−3 siden i fjor": the comparison is the previous round of the SAME kind. A puls asks
  // about two factors and a grunnlinje about eleven, so an index across the two compares
  // different questions; the design's own Resultat pairs 61 with 64 and a puls with the
  // puls before it (bundle 2950-2953). Any closed round used to do, which was invisible
  // while the fixture had only grunnlinjer closed. D-46.
  const previous = current ? (closed.find((r) => r !== current && r.kind === current.kind) ?? null) : null

  // both indices and the response rate in one call (0044)
  const [digest, risk, measures, openFactorKeys, currentSetup, shell] = await Promise.all([
    getResultsDigest({ participation: [current?.id], summaries: [current?.id, previous?.id] }),
    current ? getRiskAssessment(current.id) : null,
    getMeasures(),
    open ? getRoundFactorKeys(open.id) : [],
    // the § 9-2 consultations recorded on that round: the rail's forankring point
    current ? getRoundSetup(current.id) : null,
    getShellContext(),
  ])

  const summary = current ? (digest.summaries.get(current.id) ?? null) : null
  const prior = previous ? (digest.summaries.get(previous.id) ?? null) : null
  const currentRate = current ? (digest.participation.get(current.id) ?? null) : null
  const ok = summary?.status === 'ok' ? summary : null
  const bands = ok ? bandCounts(ok.factors) : null
  const delta = ok && prior?.status === 'ok' ? ok.index - prior.index : null

  const running = measures.filter((m) => m.step === 'pagar').length
  const late = measures.filter((m) => m.late).length

  const date = (iso: string | null, opts: Intl.DateTimeFormatOptions = {}) =>
    iso
      ? new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', ...opts }).format(new Date(iso))
      : null

  /*
   * "14. sep", not "14. sep.".
   *
   * nb-NO's short month is an abbreviation and carries its own full stop, which after a
   * day number reads as a second sentence-ending dot. The design writes it without, on
   * both the Sløyfen and the year rail, so the abbreviation dot is trimmed — the only
   * character of the format this overrides, and only at the end.
   */
  const shortDate = (iso: string | null) =>
    date(iso, { day: 'numeric', month: 'short' })?.replace(/\.$/, '') ?? null

  /**
   * The Sløyfen: four steps, each either done, the one being worked, or not yet.
   *
   * The states are read off the data rather than fixed: nothing is "done" because it is
   * to the left of something else. A kartlegging that closed is kartlagt; a round with
   * an assessment row is risikovurdert and without one is not, however low its index.
   */
  const loop: LoopStep[] = [
    {
      key: 'kartlagt',
      mark: current ? '✓' : '',
      state: current ? 'done' : 'pending',
      when: shortDate(current?.closesAt ?? null),
    },
    {
      key: 'risikovurdert',
      mark: risk ? '✓' : '',
      state: risk ? 'done' : current ? 'current' : 'pending',
      when: risk ? shortDate(`${risk.assessedOn}T12:00:00Z`) : null,
    },
    {
      key: 'tiltak',
      mark: running > 0 ? String(running) : '',
      state: running > 0 ? 'current' : 'pending',
      when: late > 0 ? t('innsikt.overdue', { count: late }) : null,
      whenAlert: late > 0,
    },
    {
      key: 'effekt',
      mark: '',
      state: 'pending',
      when: shortDate(open?.closesAt ?? null),
    },
  ]

  /**
   * The year rail: the design's five points (bundle 4234), each from a row. D-25, D-59.
   *
   *   forankring   the § 9-2 consultations recorded on the kartlegging's round, when any is
   *                confirmed — dated by the latest meeting, named by who was consulted
   *   kartlegging  the round that closed, and its response rate
   *   now          its risk assessment, and how much of it is done
   *   next         the round open now, else the next one the year wheel has planned
   *   after        the planned round after that; a puls is what measures whether the
   *                measures worked, so it is captioned as the design's "virket tiltakene?"
   *
   * A point with no row behind it is left out, never drawn from the design's literals.
   */
  const highRisk = ok ? ok.factors.filter((f) => f.band === 'hoy').map((f) => f.key) : []
  const assessed = assessedOfRequired(risk, highRisk)
  const monthOf = (iso: string | null) => (date(iso, { month: 'short' }) ?? '').replace(/\.$/, '').toUpperCase()

  const year: YearPoint[] = []

  const consulted = (currentSetup?.consultations ?? []).filter((c) => c.confirmed)
  if (consulted.length > 0) {
    const held = consulted.map((c) => c.heldOn).filter((d): d is string => !!d).sort().at(-1) ?? null
    const who = new Set(consulted.map((c) => c.kind))
    year.push({
      key: 'forankring',
      month: held ? monthOf(`${held}T12:00:00Z`) : '',
      label: t(shell.lawMode ? 'innsikt.forankring.law' : 'innsikt.forankring.plain'),
      sub: t(
        who.size > 1
          ? 'innsikt.forankringSub.begge'
          : who.has('verneombud_raad')
            ? 'innsikt.forankringSub.verneombud'
            : 'innsikt.forankringSub.tillitsvalgte',
      ),
      state: 'done',
    })
  }
  if (current) {
    year.push({
      key: 'kartlegging',
      month: monthOf(current.closesAt),
      label: t(`malinger.kind.${current.kind}`),
      sub: currentRate
        ? t('innsikt.rateSub', { pct: currentRate.pct })
        : t('innsikt.closedSub'),
      state: 'done',
    })
  }
  if (risk) {
    year.push({
      key: 'risiko',
      month: t('innsikt.now'),
      label: t('innsikt.loop.risikovurdert'),
      sub: t('innsikt.assessedSub', { done: assessed.done, required: assessed.required }),
      state: 'current',
    })
  }

  const planned = rounds
    .filter((r) => r.status === 'planlagt' && r.opensAt)
    .sort((a, b) => (a.opensAt ?? '').localeCompare(b.opensAt ?? ''))
  const next = open ?? planned[0] ?? null
  const after = planned.find((r) => r.id !== next?.id) ?? null
  if (next) {
    year.push({
      key: 'next',
      // an open round by the day it closes, as the Sløyfen dates it; a planned one by the day it opens
      month: (shortDate(next === open ? next.closesAt : next.opensAt) ?? '').toUpperCase(),
      label: roundTitle(t, next),
      sub: t('innsikt.questionSub', { count: next.questionCount }),
      state: 'pending',
    })
  }
  if (after) {
    year.push({
      key: 'after',
      month: monthOf(after.opensAt),
      label: roundTitle(t, after),
      sub: after.kind === 'puls' ? t('innsikt.effectSub') : t('innsikt.questionSub', { count: after.questionCount }),
      state: 'pending',
    })
  }

  /**
   * "Venter på deg" — what the organisation owes, in the order the design tones it.
   *
   * The design's list is personal: "Du er ansvarlig", "Verneombudets saker". It cannot be
   * here, because nothing links a signed-in user to an employee row — the owner of a
   * measure is an `app.employees` id and the viewer is an `auth.users` id, and no column
   * joins them. So the rows name their owner instead of addressing the reader, and the
   * comment thread the design's second row points at has no reader yet. D-25.
   */
  const todo: TodoItem[] = []
  for (const m of measures.filter((m) => m.late).slice(0, 3)) {
    todo.push({
      key: m.id,
      tone: '#D4633A',
      title: m.title,
      meta: t('innsikt.todoMeasureMeta', {
        owner: m.owner?.name ?? t('tiltak.ownerUnset'),
        factor: t(`factor.${m.factorKey}.short`),
      }),
      cta: t('innsikt.todoMeasureCta'),
      href: '/tiltak',
      primary: true,
    })
  }
  if (open) {
    todo.push({
      key: open.id,
      tone: '#C4BCA8',
      title: t('innsikt.todoRoundTitle', {
        date: date(open.closesAt, { day: 'numeric', month: 'long' }) ?? '',
      }),
      meta: t('innsikt.todoRoundMeta', {
        count: open.questionCount,
        factors: openFactorKeys.map((k) => t(`factor.${k}.short`)).join(', '),
      }),
      cta: t('innsikt.todoRoundCta'),
      href: '/malinger',
      primary: false,
    })
  }

  const view: InnsiktView = {
    orgName: org?.name ?? '',
    employeeCount: org?.employee_count ?? 0,
    role,
    index: ok?.index ?? null,
    delta,
    bands,
    threshold: summary?.threshold ?? org?.threshold ?? 5,
    riskAssessed: risk !== null,
    loop,
    year,
    todo,
    running,
  }

  return <InnsiktScreen view={view} />
}
