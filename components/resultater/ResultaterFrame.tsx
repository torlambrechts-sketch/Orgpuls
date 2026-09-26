import Link from 'next/link'
import type { Route } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Workspace } from './Workspace'
import { PulseView } from './PulseView'
import { ResultaterShell } from './ResultaterShell'
import type { Participation } from '@/lib/participation/read'
import type { ResultsRecommendation, ResultsSummary } from '@/lib/results/read'
import { ORG, meanOf, trustLevel, type ResultaterModel, type RoundRef } from '@/lib/results/resultater'
import { deltaColour, fmtDelta } from '@/lib/results/tone'

/**
 * Resultater's frame (v3 2234-2330): the header with its round pickers and tabs, then the
 * key figures above the workspace. Server-rendered: every value in it is fixed for the
 * round in view, and the round is chosen by link.
 */
interface FrameProps {
  model: ResultaterModel
  /** closed grunnlinjer, newest first */
  grunnlinjer: RoundRef[]
  /** closed pulses, oldest first */
  pulses: RoundRef[]
  latestGrunnlinjeId: string | null
  summary: ResultsSummary | null
  recommendation: ResultsRecommendation | null
  participation: Participation | null
  nextPulseAt: string | null
  unanswered: number
  planCount: number
  /** the round's industry module, under the workspace (D-114) */
  after?: React.ReactNode
}

const href = (query: Record<string, string | undefined>) => {
  const q = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1]))
  const s = q.toString()
  return (s ? `/resultater?${s}` : '/resultater') as Route
}

export async function ResultaterFrame(props: FrameProps) {
  const { model, grunnlinjer, pulses, summary, recommendation, participation } = props
  const t = await getTranslations('resultater')
  const locale = await getLocale()
  const round = model.round
  const isPulse = round.kind === 'puls'

  const date = (iso: string | null, opts: Intl.DateTimeFormatOptions) =>
    iso
      ? new Intl.DateTimeFormat(locale, {
          timeZone: 'Europe/Oslo',
          ...opts,
        }).format(new Date(iso))
      : ''

  // the headline index: the round's own for a grunnlinje; for a puls, the mean of what it measured
  const index = isPulse ? pulseIndex(model, round.id) : (model.overall[round.id] ?? null)
  const against = isPulse ? null : (model.compare ?? model.previous)
  const againstIndex = isPulse ? pulseAgainst(model) : against ? (model.overall[against.id] ?? null) : null
  const delta =
    index === null || againstIndex === null ? null : isPulse ? index - againstIndex : later(round, index, against!, againstIndex)
  const deltaText =
    delta === null
      ? !isPulse && !model.previous && !model.compare
        ? t('delta.first')
        : null
      : isPulse
        ? t('delta.prevMeasure', { delta: fmtDelta(delta) })
        : model.compare
          ? t('delta.span', {
              delta: fmtDelta(delta),
              span: span(round, model.compare),
            })
          : t('delta.yearBefore', { delta: fmtDelta(delta) })
  const deltaCol = delta === null ? '#5F5849' : isPulse ? deltaColour(delta) : delta < 0 ? '#A33A16' : '#2F5D2A'

  const rate = participation ? `${participation.pct} %` : null
  const score = recommendation?.status === 'ok' ? fmtDelta(recommendation.score).replace('±', '') : null
  const isLatest = round.id === props.latestGrunnlinjeId
  const next = isLatest && props.nextPulseAt ? dayMonth(t, locale, props.nextPulseAt) : null

  const chip = (on: boolean) => (on ? 'border-ink bg-ink text-bg' : 'border-line bg-sf text-ink')
  const pulseChip = (on: boolean) => (on ? 'border-ink bg-ink text-bg' : 'border-sage bg-pulse text-ink')
  const cmpChip = (on: boolean) => (on ? 'border-greendeep bg-mint' : 'border-line bg-sf')
  const chipBase =
    'cursor-pointer rounded-pill border px-[13px] py-[6px] text-[12.5px] font-bold leading-[normal] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

  const stats = (
    <span className="flex flex-wrap gap-x-[26px] gap-y-[10px] pb-[4px] text-[12.5px] text-mut">
      {index !== null ? (
        <span className="whitespace-nowrap">
          {t('stat.index')} <strong className="text-[17px] text-ink">{index}</strong>{' '}
          {deltaText ? (
            <span className="font-bold" style={{ color: deltaCol }}>
              {deltaText}
            </span>
          ) : null}
        </span>
      ) : null}
      {rate ? (
        <span className="whitespace-nowrap">
          {t('stat.rate')} <strong className="text-[17px] text-ink">{rate}</strong>
        </span>
      ) : null}
      {score ? (
        <span className="whitespace-nowrap">
          {t('stat.recommend')} <strong className="text-[17px] text-ink">{score}</strong>
        </span>
      ) : null}
      {next ? (
        <span className="whitespace-nowrap">
          {t('stat.nextPulse')} <strong className="text-[17px] text-ink">{next}</strong>
        </span>
      ) : null}
    </span>
  )

  const chips = (
    <div className="mt-[14px] flex flex-wrap items-center gap-x-[22px] gap-y-[10px]">
      <span className="flex flex-wrap items-center gap-[6px]">
        <span className="mr-[2px] text-[11px] uppercase tracking-[.09em] text-mut">{t('chips.round')}</span>
        {grunnlinjer.map((g) => (
          <Link
            key={g.id}
            href={href({ maling: g.id, mot: model.compare?.id !== g.id ? model.compare?.id : undefined })}
            aria-current={g.id === round.id ? 'page' : undefined}
            className={`${chipBase} ${chip(g.id === round.id)}`}
          >
            {g.label}
          </Link>
        ))}
        {pulses.length ? (
          <>
            <span className="mx-[4px] h-[20px] w-px bg-line" aria-hidden />
            <span className="mr-[2px] text-[11px] uppercase tracking-[.09em] text-mut">{t('chips.pulse')}</span>
            {pulses.map((p) => (
              <Link
                key={p.id}
                href={href({ maling: p.id })}
                aria-current={p.id === round.id ? 'page' : undefined}
                className={`${chipBase} ${pulseChip(p.id === round.id)}`}
              >
                {p.label}
              </Link>
            ))}
          </>
        ) : null}
      </span>
      {!isPulse && grunnlinjer.length > 1 ? (
        <span className="flex flex-wrap items-center gap-[6px]">
          <span className="mr-[2px] text-[11px] uppercase tracking-[.09em] text-mut">{t('chips.compare')}</span>
          {[null, ...grunnlinjer.filter((g) => g.id !== round.id)].map((g) => {
            const on = (model.compare?.id ?? null) === (g?.id ?? null)
            return (
              <Link
                key={g?.id ?? 'none'}
                href={href({ maling: round.id, mot: g?.id })}
                aria-current={on ? 'true' : undefined}
                className={`${chipBase} text-ink ${cmpChip(on)}`}
              >
                {g?.label ?? t('chips.none')}
              </Link>
            )
          })}
        </span>
      ) : null}
    </div>
  )

  return (
    <ResultaterShell
      kicker={t(isPulse ? 'kickerPulse' : 'kicker', {
        date: date(round.closesAt, { day: 'numeric', month: 'long', year: 'numeric' }),
      })}
      title={round.title}
      stats={stats}
      chips={chips}
      active="result"
      resultHref={href({ maling: round.id === props.latestGrunnlinjeId ? undefined : round.id })}
      unanswered={props.unanswered}
      planCount={props.planCount}
    >
      {isPulse ? (
        <PulseView model={model} participation={participation} index={index} deltaText={deltaText} deltaCol={deltaCol} />
      ) : (
        <>
          <KeyFigures model={model} summary={summary} participation={participation} deltaText={deltaText} deltaCol={deltaCol} />
          <Workspace model={model} />
        </>
      )}
      {props.after}
    </ResultaterShell>
  )
}

/** The three key-figure cards (v3 2290-2318). */
async function KeyFigures({
  model,
  summary,
  participation,
  deltaText,
  deltaCol,
}: {
  model: ResultaterModel
  summary: ResultsSummary | null
  participation: Participation | null
  deltaText: string | null
  deltaCol: string
}) {
  const t = await getTranslations('resultater')
  const index = model.overall[model.round.id] ?? null
  const bands = { lav: 0, middels: 0, hoy: 0 }
  if (summary?.status === 'ok') for (const f of summary.factors) bands[f.band] += 1

  // the time line of grunnlinjer, oldest first, as the design's four bars
  const years = model.timeline.filter((r) => r.kind === 'grunnlinje' && !r.planned && model.overall[r.id] != null).slice(-6)

  const released = model.rows.filter((r) => r.id !== ORG)
  const overK = released.filter((r) => r.n >= model.threshold).length
  const card = 'rounded-note border border-line bg-sf'

  return (
    <div className="grid grid-cols-1 gap-[14px] md:grid-cols-[1.25fr_1fr_.8fr]">
      <div className={`${card} px-[22px] py-[20px]`}>
        <div className="text-[12.5px] font-semibold text-mut">
          {summary?.scope === 'group' && summary.scope_label
            ? t('kpi.indexScope', { scope: summary.scope_label })
            : t('kpi.index')}
        </div>
        {index !== null ? (
          <>
            <div className="mt-[6px] flex items-end gap-[14px]">
              <span className="font-display text-[60px] font-semibold leading-[.85]">{index}</span>
              {deltaText ? (
                <span className="pb-[6px]">
                  <span className="block text-[13.5px] font-bold" style={{ color: deltaCol }}>
                    {deltaText}
                  </span>
                </span>
              ) : null}
            </div>
            <div className="mt-[16px] flex h-[12px] gap-[3px] overflow-hidden rounded-[6px]">
              {(['lav', 'middels', 'hoy'] as const).map((b) =>
                bands[b] ? <span key={b} style={{ flex: bands[b], background: BAND_FILL[b] }} /> : null,
              )}
            </div>
            <div className="mt-[6px] flex justify-between text-[11.5px] text-mut">
              {(['lav', 'middels', 'hoy'] as const).map((b) =>
                bands[b] ? <span key={b}>{t(`kpi.band.${b}`, { count: bands[b] })}</span> : null,
              )}
            </div>
          </>
        ) : (
          <div className="mt-[10px] text-[12.5px] leading-[1.5] text-mut">
            {summary?.status === 'protected'
              ? t('kpi.protected', {
                  group: summary.scope_label ?? '',
                  n: summary.n,
                  threshold: model.threshold,
                })
              : t('kpi.withheld', { threshold: model.threshold })}
          </div>
        )}
      </div>

      <div className={`${card} px-[22px] py-[20px]`}>
        <div className="text-[12.5px] font-semibold text-mut">{t('kpi.trend')}</div>
        <div className="mt-[12px] flex h-[86px] items-end gap-[14px]">
          {years.map((y) => {
            const v = model.overall[y.id]!
            const on = y.id === model.round.id
            const cmp = y.id === model.compare?.id
            return (
              <span key={y.id} className="flex h-full flex-1 flex-col items-center justify-end gap-[6px]">
                <span className="text-[12px] font-bold">{v}</span>
                <span
                  className="block w-full rounded-[7px_7px_3px_3px]"
                  style={{
                    height: `${Math.max(4, Math.min(100, Math.round(((v - 50) / 20) * 100)))}%`,
                    background: on ? '#F5C64A' : cmp ? '#9DB8B3' : '#E8DFC9',
                  }}
                />
              </span>
            )
          })}
        </div>
        <div className="mt-[6px] flex gap-[14px]">
          {years.map((y) => (
            <span key={y.id} className="flex-1 text-center text-[11px] text-mut">
              {y.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-rows-[1fr_1fr] gap-[14px]">
        <div className={`${card} px-[18px] py-[14px]`}>
          <div className="text-[12px] font-semibold text-mut">{t('kpi.rate')}</div>
          {participation ? (
            <>
              <div className="mt-[2px] text-[24px] font-bold">{participation.pct} %</div>
              <div className="text-[11.5px] text-mut">
                {t('kpi.rateN', {
                  answered: participation.answered,
                  headcount: participation.headcount,
                })}
              </div>
            </>
          ) : null}
        </div>
        <div className={`${card} px-[18px] py-[14px]`}>
          <div className="text-[12px] font-semibold text-mut">{t('kpi.trust')}</div>
          {participation ? (
            <>
              <div className="mt-[2px] text-[24px] font-bold">{t(`trust.${trustLevel(participation.pct)}`)}</div>
              {released.length ? (
                <div className="text-[11.5px] text-mut">
                  {t('kpi.trustGroups', {
                    over: overK,
                    total: released.length,
                  })}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const BAND_FILL = {
  lav: '#B5DAD4',
  middels: '#F5DC96',
  hoy: '#EC9B77',
} as const

/** A puls has no index of its own (v3 2401): the mean of the factors it measured. */
function pulseIndex(model: ResultaterModel, roundId: string): number | null {
  const s = model.scores[roundId]?.[ORG]
  return s ? meanOf(Object.values(s)) : null
}

/**
 * The same factors, each at the last measurement before this puls that had it (the
 * design's `prevAll`); a factor measured for the first time counts as unchanged.
 */
function pulseAgainst(model: ResultaterModel): number | null {
  const now = model.scores[model.round.id]?.[ORG]
  if (!now) return null
  const pos = model.timeline.findIndex((c) => c.id === model.round.id)
  const earlier = model.timeline.slice(0, Math.max(0, pos)).reverse()
  const was = Object.entries(now).map(
    ([k, v]) => earlier.map((c) => model.scores[c.id]?.[ORG]?.[k]).find((x) => x !== undefined) ?? v,
  )
  return earlier.length ? meanOf(was) : null
}

function later(a: RoundRef, av: number, b: RoundRef, bv: number): number {
  return (a.closesAt ?? '') >= (b.closesAt ?? '') ? av - bv : bv - av
}

function span(a: RoundRef, b: RoundRef): string {
  return (a.closesAt ?? '') < (b.closesAt ?? '') ? `${a.label}→${b.label}` : `${b.label}→${a.label}`
}

function dayMonth(t: (k: string, v?: Record<string, string | number>) => string, locale: string, iso: string): string {
  const d = new Date(iso)
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', ...o }).format(d)
  return t('dayMonth', {
    day: f({ day: 'numeric' }).replace(/\.$/, ''),
    month: f({ month: 'short' }).replace(/\.$/, ''),
  })
}

export async function ResultaterEmpty() {
  const t = await getTranslations('resultater')
  return (
    <div className="mx-auto max-w-page px-[28px] pb-[60px] pt-[30px] max-sm:px-[16px]">
      <h1 className="font-display text-[32px] font-semibold leading-[1.1]">{t('empty.title')}</h1>
      <div className="mt-[18px] rounded-note border border-dashed border-rule px-[22px] py-[20px] text-[13px] leading-[1.55] text-mut">
        {t('empty.note')}
      </div>
    </div>
  )
}
