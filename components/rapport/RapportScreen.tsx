import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { roundTitle, type Titled } from '@/lib/rounds/title'
import { ButtonLink } from '@/components/ui/Button'
import { PrintButton } from '@/components/rapport/PrintButton'
import { Sheet } from '@/components/rapport/Sheet'
import { formatOrgNumber } from '@/lib/org/read'
import { stepIndex, type MeasureStep } from '@/lib/measures/read'
import type { Band } from '@/lib/results/read'
import type {
  InformationEvent,
  MeasureEffect,
  ScreeningCounts,
  Signer,
  Training,
} from '@/lib/report/tail'

/**
 * Rapport, the rendering. Bundle lines 271-500.
 *
 * The same basis, four recipients. The document is the product's output: what a labour
 * inspector reads, and what § 3-1 third paragraph means by documentation. So every
 * figure in it is the database's — the indices and bands from `results_summary`, the
 * response rates from `participation`, the withheld groups from `results_by_group`,
 * the dates from `app.rounds`, the organisation number from `app.organizations`.
 *
 * Sections 6 to 8 and the signature block print since migration 0023, and each of them
 * waited on a fact rather than on a component. Section 6 needed a link from a measure to
 * the round that measured its effect; section 7 a k-gated reader over `app.extra_answers`,
 * which no client may select from; section 8 a record that findings were shared and people
 * trained. The signature block needed to know who the verneombud and the tillitsvalgt are,
 * which `duty_role` now says.
 *
 * Every one of them still prints its own absence. A document that says "ingen
 * effektvurdering er registrert" is worth more to an inspector than one that computes a
 * sentence nobody wrote — which is D-18's rule, and the reason section 4 waited for 0016.
 */

export type Audience = 'tilsyn' | 'amu' | 'ledelse' | 'ansatte'
export type ReportScope = 'ar' | 'grunnlinje'

export const AUDIENCES: Audience[] = ['tilsyn', 'amu', 'ledelse', 'ansatte']

export interface ReportRun {
  id: string
  kind: string
  year: number
  pulseNo: number | null
  status: string
  opensAt: string | null
  closesAt: string | null
  questions: number
  factors: number
  answered: number | null
  total: number | null
  pct: number | null
  included: boolean
}

export interface ReportFactor {
  key: string
  lawRef: string
  index: number
  band: Band
  /** the same factor in the comparison year, or null when there is none */
  prevIndex: number | null
}

export interface RapportView {
  audience: Audience
  year: number
  scope: ReportScope
  team: string | null
  years: number[]
  teams: { name: string; n: number }[]
  org: { name: string; orgNumber: string | null; employeeCount: number } | null
  threshold: number
  runs: ReportRun[]
  /** the round the figures come from: the year's grunnlinje */
  primary: ReportRun | null
  index: number | null
  prevIndex: number | null
  prevYear: number | null
  factors: ReportFactor[]
  /** groups the server withheld, for the threshold paragraph */
  withheld: { name: string; n: number }[]
  /** responses in scope, when a department is selected */
  teamAnswers: number | null
  instrument: { factors: number; statementsPerFactor: number[]; extraQuestions: number }
  highRiskCount: number
  /** section 5: the measures the year's measurements raised */
  measures: ReportMeasure[]
  /** section 4: the stored risk assessment of the round the figures come from */
  risk: ReportRisk | null
  /** section 6: measures whose effect a later round was chosen to show */
  effects: MeasureEffect[]
  /** section 7: counts only, whole undertaking, never per group */
  screening: ScreeningCounts | null
  /** section 8 */
  information: InformationEvent[]
  trainings: Training[]
  /** the signature block, from duty_role on the register */
  signers: Signer[]
}

/**
 * A block of section 4.
 *
 * Every field was written by a person. The bundle derives all four from the factor's
 * index — `sanns: f.idx < 45 ? "Høy" : "Middels"` — which is why this section went
 * unprinted until 0016 stored them: a probability computed from a mean is a number, and
 * printing it under "Samlet vurdering" on a document an inspector reads would assert
 * that somebody made a judgement nobody made.
 */
export interface ReportRisk {
  assessedOn: string
  assessor: string | null
  summary: string | null
  factors: {
    factorKey: string
    index: number | null
    probability: string
    consequence: string
    assessment: string
    conclusion: string
  }[]
}

/** A row of section 5. The status is the report's own wording, not the screen's. */
export interface ReportMeasure {
  id: string
  factorKey: string
  title: string
  owner: string | null
  dueDate: string | null
  completedOn: string | null
  step: MeasureStep
  late: boolean
}

/** The risk pill in the document's table — fill only, the ink is the document's. */
const RISK_FILL: Record<Band, string> = {
  hoy: '#FBD5C4',
  middels: '#FBEBBE',
  lav: '#CFE7E4',
}

export async function RapportScreen({ view }: { view: RapportView }) {
  const t = await getTranslations()
  const locale = await getLocale()

  const long = (iso: string | null, withYear = true) =>
    iso
      ? new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'long',
          timeZone: 'Europe/Oslo',
          ...(withYear ? { year: 'numeric' } : {}),
        }).format(new Date(iso))
      : null

  const short = (iso: string | null, withYear = false) =>
    iso
      ? new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'short',
          timeZone: 'Europe/Oslo',
          ...(withYear ? { year: 'numeric' } : {}),
        }).format(new Date(iso))
      : null

  const dayOnly = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'Europe/Oslo' }).format(
          new Date(iso),
        )
      : null

  const sameMonth = (a: string | null, b: string | null) => {
    if (!a || !b) return false
    const x = new Date(a)
    const y = new Date(b)
    return x.getUTCFullYear() === y.getUTCFullYear() && x.getUTCMonth() === y.getUTCMonth()
  }

  const kindOf = (kind: string) => t(`malinger.kind.${kind}`)
  const runLabel = (r: Titled) => roundTitle(t, r)

  /**
   * The period the report covers. A whole year runs from 1 January to the end of the
   * year, or to today when the year is still running — the design prints
   * "1. januar – 21. september 2026", which is the day it was rendered. A baseline-only
   * report is the round's own window instead.
   */
  const now = new Date()
  const periodEnd =
    view.year === now.getFullYear() ? now.toISOString() : `${view.year}-12-31T12:00:00Z`

  const period =
    view.scope === 'grunnlinje' && view.primary
      ? t('rapport.periodBaseline', {
          kind: kindOf(view.primary.kind),
          year: view.primary.year,
          // "7.–14. september 2026" when one month holds both ends, full dates otherwise
          from: sameMonth(view.primary.opensAt, view.primary.closesAt)
            ? `${dayOnly(view.primary.opensAt)}.`
            : (long(view.primary.opensAt) ?? ''),
          to: long(view.primary.closesAt) ?? '',
        })
      : t('rapport.periodYear', { end: long(periodEnd) ?? '' })

  const scopeLabel = view.team ?? t('rapport.periodScopeAll')
  const includedCount = view.runs.filter((r) => r.included).length

  const chipQuery = (over: Partial<Record<string, string>>) => ({
    pathname: '/rapport' as const,
    query: {
      mottaker: view.audience,
      ar: String(view.year),
      omfang: view.scope,
      ...(view.team ? { avdeling: view.team } : {}),
      ...over,
    },
  })

  const isFormal = view.audience === 'tilsyn' || view.audience === 'amu'

  /**
   * Section 5's date column, in the design's own words: the label says what the date is
   * — a deadline, the day it was carried out, or the day it was closed — because the
   * column holds all three and a bare date would not say which. Same rule as the Tiltak
   * card, and the same relative phrasing for a deadline that lapsed yesterday.
   */
  const yesterday = (() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(d)
  })()
  const measureDate = (m: ReportMeasure) => {
    const i = stepIndex(m.step)
    if (i >= stepIndex('lukket') && m.completedOn)
      return t('tiltak.closedOn', { date: long(m.completedOn, false) ?? '' })
    if (i >= stepIndex('gjennomfort') && m.completedOn)
      return t('tiltak.completedOn', { date: long(m.completedOn, false) ?? '' })
    if (!m.dueDate) return t('tiltak.dueUnset')
    if (m.dueDate === yesterday) return t('tiltak.dueYesterday')
    return t('tiltak.due', { date: long(m.dueDate, false) ?? '' })
  }

  return (
    <main className="animate-entry">
      <div className="report-chrome mx-auto max-w-[1180px] px-[28px] pt-[26px]">
        <ButtonLink href="/innsikt" size="xxs" tone="ghost">
          {t('rapport.backToInnsikt')}
        </ButtonLink>

        <div className="mt-[16px] flex flex-wrap items-end justify-between gap-[20px]">
          <div className="min-w-0">
            <h1 className="m-0 font-display text-[30px] font-semibold leading-[1.1]">
              {t('rapport.title')}
            </h1>
            <p className="mt-[8px] max-w-[560px] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">
              {t('rapport.lead')}
            </p>
          </div>
          <PrintButton label={t('rapport.print')} />
        </div>

        <div className="mt-[18px] flex flex-wrap gap-[8px]">
          {AUDIENCES.map((a) => {
            const on = a === view.audience
            return (
              <Link
                key={a}
                href={chipQuery({ mottaker: a })}
                aria-current={on ? 'true' : undefined}
                className={`inline-flex h-[36px] flex-none items-center rounded-pill border px-[16px] text-[12.5px] font-semibold no-underline hover:no-underline ${
                  on
                    ? 'border-ink bg-ink text-bg hover:text-bg'
                    : 'border-line bg-transparent text-ink hover:text-ink'
                }`}
              >
                {t(`rapport.audience.${a}`)}
              </Link>
            )
          })}
        </div>
        <div className="mt-[10px] max-w-[620px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
          {t(`rapport.audienceNote.${view.audience}`)}
        </div>

        <div className="mt-[18px] grid gap-[14px] rounded-note border border-line bg-sf px-[20px] py-[16px] [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          <FilterGroup label={t('rapport.filterYear')}>
            {view.years.map((y) => (
              <FilterChip
                key={y}
                href={chipQuery({ ar: String(y) })}
                selected={y === view.year}
                label={String(y)}
              />
            ))}
          </FilterGroup>

          <FilterGroup label={t('rapport.filterScope')}>
            {(['ar', 'grunnlinje'] as const).map((s) => (
              <FilterChip
                key={s}
                href={chipQuery({ omfang: s })}
                selected={s === view.scope}
                label={t(`rapport.scope.${s}`)}
              />
            ))}
          </FilterGroup>

          <FilterGroup label={t('rapport.filterTeam')}>
            <FilterChip
              href={{ ...chipQuery({}), query: { ...chipQuery({}).query, avdeling: undefined } }}
              selected={view.team === null}
              label={t('rapport.wholeOrg')}
              small
            />
            {view.teams.map((g) => (
              <FilterChip
                key={g.name}
                href={chipQuery({ avdeling: g.name })}
                selected={view.team === g.name}
                label={g.name}
                small
              />
            ))}
          </FilterGroup>
        </div>

        <div className="mt-[11px] text-[12.5px] font-semibold">
          {t('rapport.periodLine', { period, scope: scopeLabel, count: includedCount })}
        </div>
      </div>

      <Sheet
        footer={
          view.org ? (
            <>
              <span>
                {t('rapport.footerLeft', {
                  org: view.org.name,
                  orgnr: formatOrgNumber(view.org.orgNumber) ?? '',
                  year: view.year,
                })}
              </span>
              <span>{t('rapport.footerRight')}</span>
            </>
          ) : null
        }
      >
        <div className="text-[10.5px] uppercase tracking-[0.12em] text-mut">
          {view.org ? `${view.org.name} · ${period}` : period}
        </div>
        <h1 className="mt-[10px] font-display text-[30px] font-semibold leading-[1.15]">
          {t(`rapport.docTitle.${view.audience}`, { year: view.year })}
          {view.team ? t('rapport.teamSuffix', { team: view.team }) : ''}
        </h1>
        <p className="mt-[12px] max-w-[34em] text-[13.5px] leading-[1.65] text-body">
          {t(`rapport.docLead.${view.audience}`)}
        </p>

        {isFormal ? formalBody() : null}
        {view.audience === 'ledelse' ? ledelseBody() : null}
        {view.audience === 'ansatte' ? (
          <div className="mt-[28px] rounded-cta bg-sbg px-[18px] py-[16px] text-[13px] leading-[1.65] [text-wrap:pretty]">
            {t('rapport.ansatteAnonymity')}
          </div>
        ) : null}
      </Sheet>
    </main>
  )

  /*
   * The two bodies are written as functions rather than components on purpose: they
   * are one screen's markup, they close over the formatters above, and a component
   * defined inside another component is remounted on every render for no benefit.
   */
  function formalBody() {
    const meta: [string, string][] = []
    if (view.org) {
      meta.push([t('rapport.metaVirksomhet'), view.org.name])
      const nr = formatOrgNumber(view.org.orgNumber)
      if (nr) meta.push([t('rapport.metaOrgnr'), nr])
    }
    meta.push([t('rapport.metaPeriode'), period])
    meta.push([
      t('rapport.metaOmfang'),
      view.team
        ? t('rapport.omfangTeam', { team: view.team, count: view.teamAnswers ?? 0 })
        : t('rapport.omfangOrg', { count: view.org?.employeeCount ?? 0 }),
    ])
    meta.push([t('rapport.metaUtarbeidet'), long(now.toISOString()) ?? ''])

    /**
     * The instrument paragraph is the design's own sentence, and it spells its numbers
     * out — "Elleve … tre påstander … ett anbefalingsspørsmål". It is printed only
     * while it is true of the seeded instrument: eleven factors, three statements each,
     * and the four questions outside the index. Change the instrument and the sentence
     * stops being printed rather than starts being wrong.
     */
    const instrumentHolds =
      view.instrument.factors === 11 &&
      view.instrument.statementsPerFactor.every((n) => n === 3) &&
      view.instrument.extraQuestions === 4

    return (
      <>
        <table className="mt-[22px] w-full border-collapse text-[12.5px]">
          <tbody>
            {meta.map(([k, v]) => (
              <tr key={k}>
                {/*
                  px-0 is not redundant: a browser's own stylesheet gives td 1px of
                  horizontal padding, and the design's `padding:7px 0` overrides it
                  where a vertical-only utility does not. Measured — without it every
                  cell in this table sat one pixel right of the baseline's.
                */}
                <td className="w-[38%] border-b border-line px-0 py-[7px] text-mut">{k}</td>
                <td className="border-b border-line px-0 py-[7px] font-semibold">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-[30px] font-display text-[19px] font-semibold">
          {t('rapport.section1')}
        </h2>

        {instrumentHolds ? (
          <MethodBlock head={t('rapport.instrumentHead')} body={t('rapport.instrumentBody')} />
        ) : null}

        {view.primary && view.primary.answered !== null && view.primary.total !== null ? (
          <MethodBlock
            head={t('rapport.gjennomforingHead')}
            body={t('rapport.gjennomforingBody', {
              kind: kindOf(view.primary.kind),
              sent: long(view.primary.opensAt) ?? '',
              closed: long(view.primary.closesAt, false) ?? '',
              answered: view.primary.answered,
              total: view.primary.total,
              pct: view.primary.pct ?? 0,
            })}
          />
        ) : null}

        <MethodBlock
          head={t('rapport.terskelHead')}
          body={
            t('rapport.terskelBody', { threshold: view.threshold }) +
            (view.withheld.length
              ? ' ' +
                t('rapport.terskelWithheld', {
                  groups: view.withheld
                    .map((g) => t('rapport.terskelGroup', { group: g.name, count: g.n }))
                    .join(', '),
                })
              : '')
          }
        />

        <h2 className="mt-[30px] font-display text-[19px] font-semibold">
          {t('rapport.section2')}
        </h2>
        <p className="mt-[8px] text-[12.5px] leading-[1.65] text-body">
          {t('rapport.section2Lead')}
        </p>
        <table className="mt-[12px] w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {[
                t('rapport.colMaling'),
                t('rapport.colGjennomfort'),
                t('rapport.colSvar'),
                t('rapport.colOmfang'),
                '',
              ].map((h, i) => (
                <th
                  key={i}
                  className="border-b-2 border-ink px-[6px] py-[8px] text-left text-[10.5px] uppercase tracking-[0.08em]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.runs.map((r) => (
              <tr key={r.id} className="[break-inside:avoid]">
                <td className="border-b border-line px-[6px] py-[7px] font-semibold">
                  {runLabel(r)}
                </td>
                <td className="border-b border-line px-[6px] py-[7px] text-mut">
                  {r.status === 'lukket'
                    ? t('rapport.runDone', {
                        sent: short(r.opensAt) ?? '',
                        closed: short(r.closesAt, true) ?? '',
                      })
                    : r.status === 'apen'
                      ? t('rapport.runOpen', { date: short(r.closesAt, true) ?? '' })
                      : t('rapport.runPlanned', { date: short(r.closesAt, true) ?? '' })}
                </td>
                <td className="border-b border-line px-[6px] py-[7px]">
                  {r.status === 'lukket' && r.answered !== null && r.total !== null
                    ? t('rapport.runAnswers', {
                        answered: r.answered,
                        total: r.total,
                        pct: r.pct ?? 0,
                      })
                    : t('rapport.runNotDone')}
                </td>
                <td className="border-b border-line px-[6px] py-[7px] text-mut">
                  {t('rapport.runScope', { questions: r.questions, factors: r.factors })}
                </td>
                <td className="border-b border-line px-[6px] py-[7px]">
                  <span
                    className="inline-block rounded-pill px-[9px] py-[2px] font-bold"
                    style={
                      r.included
                        ? { background: '#CFE7E4', color: '#20431C' }
                        : { background: 'rgba(25,21,16,.06)', color: '#5F5849' }
                    }
                  >
                    {t(r.included ? 'rapport.included' : 'rapport.excluded')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-[30px] font-display text-[19px] font-semibold">
          {t('rapport.section3')}
        </h2>
        <p className="mt-[8px] text-[12.5px] leading-[1.65] text-body">
          {view.team
            ? t('rapport.idxLineTeam', { threshold: view.threshold })
            : view.index === null
              ? t('rapport.noData', { year: view.year })
              : view.prevIndex !== null && view.prevYear !== null
                ? t('rapport.idxLine', {
                    index: view.index,
                    prev: view.prevIndex,
                    prevYear: view.prevYear,
                  })
                : t('rapport.idxLineFirst', { index: view.index })}
        </p>

        {view.factors.length ? (
          <table className="mt-[14px] w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="border-b-2 border-ink px-[6px] py-[8px] text-left text-[10.5px] uppercase tracking-[0.08em]">
                  {t('rapport.colFaktor')}
                </th>
                <th className="border-b-2 border-ink px-[6px] py-[8px] text-left text-[10.5px] uppercase tracking-[0.08em]">
                  {t('rapport.colHjemmel')}
                </th>
                <th className="border-b-2 border-ink px-[6px] py-[8px] text-right text-[10.5px] uppercase tracking-[0.08em]">
                  {view.year}
                </th>
                {view.prevYear !== null ? (
                  <th className="border-b-2 border-ink px-[6px] py-[8px] text-right text-[10.5px] uppercase tracking-[0.08em]">
                    {view.prevYear}
                  </th>
                ) : null}
                <th className="border-b-2 border-ink px-[6px] py-[8px] text-right text-[10.5px] uppercase tracking-[0.08em]">
                  {t('rapport.colRisiko')}
                </th>
              </tr>
            </thead>
            <tbody>
              {view.factors.map((f) => (
                <tr key={f.key} className="[break-inside:avoid]">
                  <td className="border-b border-line px-[6px] py-[7px] font-semibold">
                    {t(`factor.${f.key}.label`)}
                  </td>
                  <td className="border-b border-line px-[6px] py-[7px] text-mut">{f.lawRef}</td>
                  <td className="border-b border-line px-[6px] py-[7px] text-right font-bold tabular-nums">
                    {f.index}
                  </td>
                  {view.prevYear !== null ? (
                    <td className="border-b border-line px-[6px] py-[7px] text-right text-mut tabular-nums">
                      {f.prevIndex ?? '—'}
                    </td>
                  ) : null}
                  <td className="border-b border-line px-[6px] py-[7px] text-right">
                    <span
                      className="inline-block rounded-pill px-[9px] py-[2px] font-bold"
                      style={{ background: RISK_FILL[f.band] }}
                    >
                      {t(`band.${f.band}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <h2 className="mt-[30px] font-display text-[19px] font-semibold">
          {t('rapport.section4')}
        </h2>
        {view.risk === null ? (
          /*
           * No assessment, so the section says so rather than deriving one. This is the
           * whole reason 0016 exists: the design's own section 4 is computed from the
           * index, and a computed risk assessment on a statutory document is the
           * fabrication rule's worst case. An unassessed kartlegging is a real state and
           * an inspector reading "ikke risikovurdert" learns something true.
           */
          <p className="mt-[8px] text-[12.5px] leading-[1.65] text-body">
            {t('rapport.section4Empty')}
          </p>
        ) : (
          <>
            <p className="mt-[8px] text-[12.5px] leading-[1.65] text-body">
              {view.risk.summary ?? t('rapport.section4Lead')}
            </p>
            {view.risk.factors.map((r) => (
              <div
                key={r.factorKey}
                className="mt-[14px] rounded-ctl border border-line px-[16px] py-[14px] [break-inside:avoid]"
              >
                <div className="flex flex-wrap justify-between gap-[12px]">
                  <span className="text-[13.5px] font-bold">
                    {r.index === null
                      ? t(`factor.${r.factorKey}.label`)
                      : t('rapport.riskHead', {
                          factor: t(`factor.${r.factorKey}.label`),
                          index: r.index,
                        })}
                  </span>
                  <span className="text-[12px] text-mut">
                    {t('rapport.riskBands', {
                      probability: t(`risk.probability.${r.probability}`),
                      consequence: t(`risk.consequence.${r.consequence}`),
                    })}
                  </span>
                </div>
                <p className="mt-[7px] text-[12.5px] leading-[1.6] text-body">{r.assessment}</p>
                <div className="mt-[7px] text-[12px] font-bold">
                  {t('rapport.riskConclusion', {
                    conclusion: t(`risk.conclusion.${r.conclusion}`),
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        <h2 className="mt-[30px] font-display text-[19px] font-semibold">
          {t('rapport.section5')}
        </h2>
        {view.measures.length === 0 ? (
          <p className="mt-[8px] text-[12.5px] leading-[1.65] text-body">
            {t('rapport.section5Empty')}
          </p>
        ) : (
          <table className="mt-[12px] w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {[
                  t('rapport.colTiltak'),
                  t('rapport.colFaktor'),
                  t('rapport.colAnsvarlig'),
                  t('rapport.colFrist'),
                  t('rapport.colStatus'),
                ].map((h, i) => (
                  <th
                    key={i}
                    className="border-b-2 border-ink px-[6px] py-[8px] text-left text-[10.5px] uppercase tracking-[0.08em]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.measures.map((m) => (
                <tr key={m.id} className="[break-inside:avoid]">
                  <td className="border-b border-line px-[6px] py-[7px] font-semibold">{m.title}</td>
                  <td className="border-b border-line px-[6px] py-[7px] text-mut">
                    {t(`factor.${m.factorKey}.short`)}
                  </td>
                  <td className="border-b border-line px-[6px] py-[7px]">
                    {m.owner ?? t('tiltak.ownerUnset')}
                  </td>
                  <td className="border-b border-line px-[6px] py-[7px] text-mut">
                    {measureDate(m)}
                  </td>
                  <td className="border-b border-line px-[6px] py-[7px] font-semibold">
                    {/*
                      The report's own status wording (bundle line 4331), which is coarser
                      than the screen's six steps on purpose: a document says whether a
                      measure is closed, waiting on its effect, late, or running.
                    */}
                    {stepIndex(m.step) >= stepIndex('lukket')
                      ? t('tiltak.step.lukket')
                      : stepIndex(m.step) >= stepIndex('gjennomfort')
                        ? t('tiltak.statEffect')
                        : m.late
                          ? t('tiltak.overdue')
                          : t('tiltak.step.pagar')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ------------------------------------------------ 6. Effektvurdering */}
        <h2 className="mt-[30px] font-display text-[19px] font-semibold">
          {t('rapport.section6')}
        </h2>
        {view.effects.length === 0 ? (
          <p className="mt-[8px] text-[12.5px] leading-[1.65] text-body">
            {t('rapport.section6Empty')}
          </p>
        ) : (
          view.effects.map((e) => (
            <p key={e.id} className="mt-[11px] text-[12.5px] leading-[1.65] text-body">
              {/*
                The movement is computed from two k-gated summaries; the judgement about
                what it means was written by a person and is printed as written. A
                document that stated a conclusion nobody reached would be the same defect
                section 4 waited two migrations to avoid.
              */}
              <span className="font-semibold">{e.title}.</span>{' '}
              {e.before !== null && e.after !== null && e.fromYear !== null && e.toYear !== null
                ? t('rapport.effectMoved', {
                    factor: t(`factor.${e.factorKey}.label`),
                    from: e.before,
                    to: e.after,
                    fromYear: e.fromYear,
                    toYear: e.toYear,
                  })
                : t('rapport.effectWithheld', { factor: t(`factor.${e.factorKey}.label`) })}
              {e.note ? ` ${e.note}` : ''}
            </p>
          ))
        )}

        {/* ------------------- 7. Krenkende atferd, vold og trusler */}
        <h2 className="mt-[30px] font-display text-[19px] font-semibold">
          {t('rapport.section7')}
        </h2>
        {screeningParagraphs()}

        {/* ------------------------------------------ 8. Informasjon og opplæring */}
        <h2 className="mt-[30px] font-display text-[19px] font-semibold">
          {t('rapport.section8')}
        </h2>
        {view.information.length === 0 ? (
          <p className="mt-[8px] text-[12.5px] leading-[1.65] text-body">
            {t('rapport.section8EmptyInfo')}
          </p>
        ) : (
          <ul className="m-0 mt-[8px] list-none p-0">
            {view.information.map((i) => (
              <li key={i.id} className="mt-[6px] text-[12.5px] leading-[1.65] text-body">
                {t('rapport.informationLine', {
                  audience: t(`rapport.audienceName.${i.audience}`),
                  channel: t(`rapport.channel.${i.channel}`),
                  date: long(i.held_on) ?? i.held_on,
                })}
                {i.note ? ` ${i.note}` : ''}
              </li>
            ))}
          </ul>
        )}

        {view.trainings.length === 0 ? (
          <p className="mt-[10px] text-[12.5px] leading-[1.65] text-body">
            {t('rapport.section8EmptyTraining')}
          </p>
        ) : (
          <ul className="m-0 mt-[10px] list-none p-0">
            {view.trainings.map((tr) => (
              <li key={tr.id} className="mt-[6px] text-[12.5px] leading-[1.65] text-body">
                {t('rapport.trainingLine', {
                  title: tr.title,
                  audience: t(`rapport.audienceName.${tr.audience}`),
                  date: long(tr.held_on) ?? tr.held_on,
                })}
                {tr.next_due
                  ? ` ${t('rapport.trainingNext', { date: long(tr.next_due) ?? tr.next_due })}`
                  : ''}
              </li>
            ))}
          </ul>
        )}

        {/* ------------------------------------------------------- Signatur */}
        {view.signers.length === 0 ? null : (
          <div className="mt-[36px] [break-inside:avoid]">
            <div className="text-[10.5px] uppercase tracking-[0.1em] text-mut">
              {t('rapport.signature')}
            </div>
            <div className="mt-[22px] flex flex-wrap gap-[26px]">
              {view.signers.map((sgn) => (
                <span key={`${sgn.role}-${sgn.name}`} className="min-w-[150px] flex-1">
                  <span className="block h-[34px] border-b border-ink" />
                  <span className="mt-[6px] block text-[12px] font-bold">{sgn.name}</span>
                  <span className="block text-[11.5px] text-mut">
                    {t(`rapport.signerRole.${sgn.role}`)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  /**
   * Section 7, in sentences rather than a table.
   *
   * The design writes it as prose and the prose is right: a table of four options by two
   * questions invites a reader to look for a pattern, and the one thing this question may
   * never be broken down by is the thing a pattern would be about. So it says how many
   * answered yes out of how many answered, and nothing else.
   *
   * `vil ikke svare` is counted in the denominator, because "tre av 28" is a different
   * claim from "tre av 27".
   */
  function screeningParagraphs() {
    if (view.screening === null) {
      return (
        <p className="mt-[8px] text-[12.5px] leading-[1.65] text-body">
          {t('rapport.section7Empty')}
        </p>
      )
    }

    if (view.screening.status === 'insufficient_data') {
      return (
        <p className="mt-[8px] text-[12.5px] leading-[1.65] text-body">
          {t('rapport.section7Withheld', { threshold: view.screening.threshold })}
        </p>
      )
    }

    const questions = view.screening.questions
    if (questions.length === 0) {
      return (
        <p className="mt-[8px] text-[12.5px] leading-[1.65] text-body">
          {t('rapport.section7NotAsked')}
        </p>
      )
    }

    return (
      <>
        {questions.map((q) => {
          // option 1 is "Nei" and the last is "Vil ikke svare"; everything between is a yes
          const yes = q.options
            .filter((o) => o.ordinal > 1 && o.ordinal < q.options.length)
            .reduce((a, o) => a + o.n, 0)
          const declined = q.options.find((o) => o.ordinal === q.options.length)?.n ?? 0

          return (
            <p key={q.key} className="mt-[8px] text-[12.5px] leading-[1.65] text-body">
              {yes === 0
                ? t(`rapport.screening.${q.key}.none`, { answered: q.answered })
                : t(`rapport.screening.${q.key}.some`, { yes, answered: q.answered })}
              {declined > 0 ? ` ${t('rapport.screeningDeclined', { count: declined })}` : ''}
            </p>
          )
        })}
        <p className="mt-[10px] text-[12.5px] leading-[1.65] text-body">
          {t('rapport.screeningRule')}
        </p>
      </>
    )
  }

  function ledelseBody() {
    const delta =
      view.index !== null && view.prevIndex !== null ? view.index - view.prevIndex : null

    return (
      <div className="mt-[24px] flex flex-wrap gap-[26px]">
        {view.index !== null ? (
          <Figure
            value={String(view.index)}
            label={
              delta === null
                ? t('rapport.ledelseIndex')
                : delta < 0
                  ? t('rapport.ledelseIndexDown', { points: Math.abs(delta) })
                  : t('rapport.ledelseIndexUp', { points: delta })
            }
          />
        ) : null}
        {view.primary?.pct != null ? (
          <Figure
            value={t('malinger.percent', { pct: view.primary.pct })}
            label={t('rapport.ledelseRate')}
          />
        ) : null}
        <Figure value={String(view.highRiskCount)} label={t('rapport.ledelseHigh')} />
      </div>
    )
  }
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <span>
      <span className="block font-display text-[40px] font-semibold leading-none">{value}</span>
      <span className="mt-[3px] block text-[11.5px] text-mut">{label}</span>
    </span>
  )
}

function MethodBlock({ head, body }: { head: string; body: string }) {
  return (
    <div className="mt-[14px] [break-inside:avoid]">
      <div className="text-[13px] font-bold">{head}</div>
      <p className="mt-[4px] text-[12.5px] leading-[1.65] text-body">{body}</p>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="min-w-0">
      <span className="block text-[11px] uppercase tracking-[0.09em] text-mut">{label}</span>
      <span className="mt-[9px] flex flex-wrap gap-[7px]">{children}</span>
    </span>
  )
}

function FilterChip({
  href,
  selected,
  label,
  small = false,
}: {
  href: React.ComponentProps<typeof Link>['href']
  selected: boolean
  label: string
  small?: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? 'true' : undefined}
      className={`inline-flex h-[32px] flex-none items-center rounded-pill border text-ink no-underline hover:text-ink hover:no-underline ${
        small ? 'px-[13px] text-[12px]' : 'px-[14px] text-[12.5px]'
      } ${selected ? 'border-ink bg-sbg font-bold' : 'border-line bg-transparent font-medium'}`}
    >
      {label}
    </Link>
  )
}
