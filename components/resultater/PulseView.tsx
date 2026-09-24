'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Participation } from '@/lib/participation/read'
import { ORG, type ResultaterModel, type RoundRef } from '@/lib/results/resultater'
import { deltaColour, fmtDelta, heatTone } from '@/lib/results/tone'

/**
 * A puls in Resultater (v3 2543-2640, logic `v2p()`). D-72.
 *
 * A puls measures the few factors the organisation has measures on, so it has no index of
 * its own: the headline is the mean of what it measured, and says so. Every factor card
 * shows the whole time line for that factor, so the puls is read against the grunnlinje
 * it follows up and the puls before it.
 *
 * Not drawn: the design's sentence on why this puls was sent ("Følger tiltakene fra
 * grunnlinje 2024 …") — no row records a reason — and a measure's effect per group, since
 * a measure's groups and the puls's released groups rarely coincide; the effect is read on
 * the whole organisation, and labelled so.
 */
export function PulseView({
  model,
  participation,
  index,
  deltaText,
  deltaCol,
}: {
  model: ResultaterModel
  participation: Participation | null
  index: number | null
  deltaText: string | null
  deltaCol: string
}) {
  const t = useTranslations()
  const round = model.round
  const measured = model.factors
  const rows = model.rows.filter((r) => model.scores[round.id]?.[r.id])
  const [seg, setSeg] = useState(rows[0]?.id ?? ORG)
  const pos = model.timeline.findIndex((c) => c.id === round.id)

  const at = (c: RoundRef, row: string, k: string) => model.scores[c.id]?.[row]?.[k]
  const before = (row: string, k: string) => {
    for (let j = pos - 1; j >= 0; j--) {
      const c = model.timeline[j]!
      const v = at(c, row, k)
      if (v !== undefined) return { v, c }
    }
    return null
  }
  const baseline = (row: string, k: string) => {
    for (let j = pos - 1; j >= 0; j--) {
      const c = model.timeline[j]!
      if (c.kind === 'grunnlinje' && !c.planned) {
        const v = at(c, row, k)
        return v === undefined ? null : { v, c }
      }
    }
    return null
  }
  const against = (c: RoundRef) =>
    c.kind === 'grunnlinje'
      ? t('resultater.pulse.againstBaseline', { year: c.label })
      : t('resultater.pulse.againstPulse', {
          title: c.title.toLocaleLowerCase(),
        })

  const card = 'rounded-note border border-line bg-sf'
  const statements = pulseStatements(model)

  return (
    <>
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className={`${card} px-[20px] py-[16px]`}>
          <div className="text-[12px] font-semibold text-mut">{t('resultater.pulse.index')}</div>
          <div className="mt-[4px] flex items-baseline gap-[10px]">
            <span className="font-display text-[40px] font-semibold leading-none">{index ?? '—'}</span>
            {deltaText ? (
              <span className="text-[12.5px] font-bold" style={{ color: deltaCol }}>
                {deltaText}
              </span>
            ) : null}
          </div>
          <div className="mt-[4px] text-[11.5px] text-mut">{t('resultater.pulse.indexNote')}</div>
        </div>
        <div className={`${card} px-[20px] py-[16px]`}>
          <div className="text-[12px] font-semibold text-mut">{t('resultater.kpi.rate')}</div>
          {participation ? (
            <>
              <div className="mt-[4px] text-[30px] font-bold">{participation.pct} %</div>
              <div className="text-[11.5px] text-mut">
                {t('resultater.kpi.rateN', {
                  answered: participation.answered,
                  headcount: participation.headcount,
                })}
              </div>
            </>
          ) : null}
        </div>
        <div className="rounded-note border border-sage bg-pulse px-[20px] py-[16px] sm:col-span-2">
          <div className="text-[12px] font-bold text-greendeep">
            {t('resultater.pulse.count', {
              factors: measured.length,
              questions: model.questionCount,
            })}
          </div>
          <div className="mt-[4px] text-[15px] font-bold">{measured.map((k) => t(`factor.${k}.name`)).join(' · ')}</div>
        </div>
      </div>

      <div className={`mt-[14px] ${card} px-[22px] py-[20px]`}>
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <span>
            <span className="block text-[17px] font-bold">{t('resultater.pulse.trendTitle')}</span>
            <span className="mt-[2px] block text-[12.5px] text-mut">{t('resultater.pulse.trendNote')}</span>
          </span>
          <span className="flex flex-wrap gap-[6px]">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={seg === r.id}
                onClick={() => setSeg(r.id)}
                className={`cursor-pointer rounded-pill border px-[12px] py-[6px] text-[12px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  seg === r.id ? 'border-ink bg-ink text-bg' : 'border-line bg-sf text-ink'
                }`}
              >
                {r.name}
              </button>
            ))}
          </span>
        </div>
        <div
          className="mt-[14px] grid gap-[14px]"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))',
          }}
        >
          {measured.map((k) => {
            const v = at(round, seg, k)
            const tone = heatTone(v ?? 50)
            const pr = v === undefined ? null : before(seg, k)
            const b = v === undefined ? null : baseline(seg, k)
            return (
              <div key={k} className="min-w-0 rounded-opt border border-line bg-bg px-[18px] py-[16px]">
                <div className="flex items-start justify-between gap-[12px]">
                  <span className="text-[15px] font-bold">{t(`factor.${k}.name`)}</span>
                  <span
                    className="flex-none rounded-bar px-[11px] py-[3px] text-[20px] font-bold"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {v ?? '—'}
                  </span>
                </div>
                <div className="mt-[6px] flex flex-wrap gap-x-[14px] gap-y-[6px] text-[12px]">
                  {pr && v !== undefined ? (
                    <span>
                      <strong style={{ color: deltaColour(v - pr.v) }}>{fmtDelta(v - pr.v)}</strong>{' '}
                      <span className="text-mut">{against(pr.c)}</span>
                    </span>
                  ) : null}
                  {b && v !== undefined && pr?.c.kind !== 'grunnlinje' ? (
                    <span>
                      <strong style={{ color: deltaColour(v - b.v) }}>{fmtDelta(v - b.v)}</strong>{' '}
                      <span className="text-mut">{against(b.c)}</span>
                    </span>
                  ) : null}
                </div>
                <div className="mt-[14px] flex h-[130px] items-end gap-[6px]">
                  {model.timeline.map((c) => {
                    const x = at(c, seg, k)
                    const on = c.id === round.id
                    const h = c.planned ? 34 : x === undefined ? 4 : Math.max(8, Math.round(((x - 20) / 70) * 100))
                    return (
                      <span key={c.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[4px]">
                        <span className="text-[11px] font-bold">{c.planned || x === undefined ? '' : x}</span>
                        <span
                          className="box-border block w-full rounded-[6px_6px_2px_2px]"
                          style={{
                            height: `${h}%`,
                            background: c.planned
                              ? 'transparent'
                              : x === undefined
                                ? 'rgba(25,21,16,.07)'
                                : on
                                  ? '#F5C64A'
                                  : c.kind === 'puls'
                                    ? '#9DB8B3'
                                    : '#D9CFB8',
                            border: c.planned ? '1.5px dashed #C4BCA8' : on ? '1.5px solid #191510' : '1.5px solid transparent',
                          }}
                        />
                      </span>
                    )
                  })}
                </div>
                <div className="mt-[6px] flex gap-[6px]">
                  {model.timeline.map((c) => (
                    <span
                      key={c.id}
                      className={`min-w-0 flex-1 whitespace-nowrap text-center text-[10px] text-mut ${c.id === round.id ? 'font-bold' : 'font-medium'}`}
                    >
                      {c.month}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-[12px] flex flex-wrap gap-[16px] text-[11.5px] text-mut">
          <Swatch className="bg-stone">{t('resultater.tl.grunnlinje')}</Swatch>
          <Swatch className="bg-sage">{t('resultater.tl.puls')}</Swatch>
          <Swatch className="border border-ink bg-ac">{t('resultater.pulse.this')}</Swatch>
          <Swatch className="border-[1.5px] border-dashed border-rule">{t('resultater.tl.planned')}</Swatch>
        </div>
      </div>

      <div
        className="mt-[14px] grid gap-[14px]"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))',
        }}
      >
        <div className={`${card} px-[22px] py-[20px]`}>
          <div className="text-[15px] font-bold">{t('resultater.pulse.groups')}</div>
          <div className="mt-[2px] text-[12px] text-mut">{t('resultater.pulse.groupsNote')}</div>
          <div
            className="mt-[12px] grid gap-[5px] text-[11.5px]"
            style={{
              gridTemplateColumns: `110px repeat(${measured.length}, minmax(0, 1fr))`,
            }}
          >
            <span />
            {measured.map((k) => (
              <span key={k} className="text-center font-semibold leading-[1.2] text-mut [overflow-wrap:anywhere]">
                {t(`factor.${k}.abbr`)}
              </span>
            ))}
            {model.rows.map((r) => (
              <PulseGroupRow key={r.id} name={r.name} strong={r.id === ORG}>
                {measured.map((k) => {
                  const v = at(round, r.id, k)
                  if (v === undefined)
                    return (
                      <span
                        key={k}
                        className="flex h-[48px] flex-col items-center justify-center rounded-[8px] bg-[rgba(25,21,16,.05)] text-[14px] font-bold leading-[1.15] text-faint"
                      >
                        —
                        <span className="text-[10px] font-semibold">
                          {t(r.status === 'protected' ? 'resultater.pulse.protected' : 'resultater.pulse.underK')}
                        </span>
                      </span>
                    )
                  const tone = heatTone(v)
                  const pr = before(r.id, k)
                  return (
                    <span
                      key={k}
                      className="flex h-[48px] flex-col items-center justify-center rounded-[8px] text-[14px] font-bold leading-[1.15]"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {v}
                      <span className="text-[10px] font-semibold">{pr ? fmtDelta(v - pr.v) : ''}</span>
                    </span>
                  )
                })}
              </PulseGroupRow>
            ))}
          </div>
        </div>
        <div className={`${card} px-[22px] py-[20px]`}>
          <div className="text-[15px] font-bold">{t('resultater.pulse.statements')}</div>
          <div className="mt-[12px] flex flex-col gap-[10px]">
            {statements.map((q) => (
              <div key={`${q.key}.${q.ordinal}`}>
                <div className="flex justify-between gap-[10px] text-[12.5px]">
                  <span>
                    <span className="text-[11px] font-bold uppercase tracking-[.06em] text-mut">{t(`factor.${q.key}.name`)}</span>
                    <span className="mt-px block">{t(`factor.${q.key}.s${q.ordinal}`)}</span>
                  </span>
                  <strong className="flex-none">{q.index}</strong>
                </div>
                <div className="mt-[5px] h-[6px] rounded-pill bg-[rgba(25,21,16,.07)]">
                  <div className="h-full rounded-pill bg-sage" style={{ width: `${q.index}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`mt-[14px] ${card} px-[22px] py-[20px]`}>
        <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
          <span className="text-[15px] font-bold">{t('resultater.pulse.plan')}</span>
          <Link
            href="/tiltak"
            className="text-[12.5px] font-bold text-link hover:text-linkhover focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            {t('resultater.openPlan')}
          </Link>
        </div>
        <div className="mt-[12px] flex flex-col gap-[8px]">
          {model.plan.map((m) => {
            const v = at(round, ORG, m.factorKey)
            const b = baseline(ORG, m.factorKey)
            const d = v !== undefined && b ? v - b.v : null
            return (
              <div
                key={m.id}
                className="grid grid-cols-1 items-center gap-[14px] rounded-cta border border-line bg-bg px-[14px] py-[12px] sm:grid-cols-[minmax(0,1.6fr)_110px_minmax(0,1fr)]"
              >
                <span>
                  <span className="block text-[13.5px] font-semibold">{m.title}</span>
                  <span className="mt-[2px] block text-[11.5px] text-mut">
                    {t(`factor.${m.factorKey}.name`)} · {m.owner ?? t('resultater.pulse.noOwner')}
                  </span>
                </span>
                <span>
                  <span
                    className="rounded-pill px-[10px] py-[3px] text-[11px] font-bold"
                    style={{
                      background: m.step === 'effekt_malt' ? '#DDEEEA' : '#FFF4D6',
                    }}
                  >
                    {t(`tiltak.step.${m.step}`)}
                  </span>
                </span>
                <span
                  className="text-[12.5px] font-bold sm:text-right"
                  style={{ color: d === null ? '#5F5849' : deltaColour(d) }}
                >
                  {d === null || !b
                    ? t('resultater.pulse.noEffect')
                    : `${fmtDelta(d)} ${t('resultater.pulse.againstBaseline', { year: b.c.label })}`}
                </span>
              </div>
            )
          })}
          {model.plan.length === 0 ? (
            <div className="rounded-cta border border-dashed border-rule p-[14px] text-center text-[12.5px] text-mut">
              {t('resultater.pulse.noPlan')}
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}

function Swatch({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-[6px]">
      <span className={`box-border h-[12px] w-[12px] rounded-[3px] ${className}`} />
      {children}
    </span>
  )
}

function PulseGroupRow({ name, strong, children }: { name: string; strong: boolean; children: React.ReactNode }) {
  return (
    <>
      <span className={`flex items-center text-[12.5px] ${strong ? 'font-bold' : 'font-semibold'}`}>{name}</span>
      {children}
    </>
  )
}

/** The puls's statements, first of every factor, then second (v3 `v2PItems`), five at most. */
function pulseStatements(model: ResultaterModel) {
  const scope = model.items[ORG] ?? model.items[model.rows[0]?.id ?? ''] ?? {}
  const out: { key: string; ordinal: number; index: number }[] = []
  const lists = model.factors.map((k) => ({
    k,
    list: [...(scope[k] ?? [])].sort((a, b) => a.ordinal - b.ordinal),
  }))
  for (let i = 0; out.length < 5 && lists.some((l) => l.list[i]); i++) {
    for (const l of lists) {
      const s = l.list[i]
      if (s && out.length < 5) out.push({ key: l.k, ordinal: s.ordinal, index: s.index })
    }
  }
  return out
}
