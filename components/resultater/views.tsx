'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ORG, chronDelta, medianOf, type ResultaterModel, type RoundRef } from '@/lib/results/resultater'
import { deltaColour, fmtDelta, heatTone } from '@/lib/results/tone'
import type { Selection } from './Workspace'

/**
 * Resultater's four other views (v3 2358-2463). Each draws from the same model and sets the
 * same selection as the Varmekart, so the drill-down beside them follows.
 *
 * Two of the design's figures are not drawn (D-72): a group's own overall index, on
 * Segmentprofil's head and on Sammenlign's first two tiles for a group — no reader
 * computes one, and this side does not average factors into a headline (D-15) — and the
 * Ansiennitet dimension, which the schema does not carry (D3).
 */
type Pick = (s: Selection) => void
interface ViewProps {
  model: ResultaterModel
  sel: Selection
  pick: Pick
}

const chipClass = (on: boolean) =>
  `cursor-pointer rounded-pill border px-[12px] py-[6px] text-[12px] font-bold leading-[normal] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
    on ? 'border-ink bg-ink text-bg' : 'border-line bg-sf text-ink'
  }`

/** The rows a view can be scoped to: those with figures in every round it reads. */
function scopedRows(model: ResultaterModel, roundIds: string[]) {
  return model.rows.filter((r) => roundIds.every((id) => model.scores[id]?.[r.id]))
}

function RowChips({
  rows,
  current,
  onPick,
}: {
  rows: { id: string; name: string }[]
  current: string
  onPick: (id: string) => void
}) {
  return (
    <span className="flex flex-wrap gap-[6px]">
      {rows.map((r) => (
        <button
          key={r.id}
          type="button"
          aria-pressed={current === r.id}
          onClick={() => onPick(r.id)}
          className={chipClass(current === r.id)}
        >
          {r.name}
        </button>
      ))}
    </span>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-[14px] rounded-cta border border-dashed border-rule p-[14px] text-center text-[12.5px] leading-[1.5] text-mut">
      {text}
    </div>
  )
}

// ----------------------------------------------------------------------------- Prioritet

/**
 * Skår mot betydning (D4). Betydning is the factor's correlation with "anbefale oss", for
 * the whole organisation; the dots move with the chosen group's scores. The vertical
 * middle is the median r, the line `quadrantOf` classifies by, so a dot's quadrant on the
 * drawing and in the drill-down's chip agree.
 */
export function PriorityView({ model, sel, pick }: ViewProps) {
  const t = useTranslations()
  const rows = scopedRows(model, [model.round.id])
  const row = rows.find((r) => r.id === sel.row) ?? rows[0]
  const imp = model.importance
  const head = (
    <span className="text-[15px] font-bold">
      {t('resultater.prio.title', {
        scope: row?.id === ORG || !row ? t('resultater.recs.scopeOrg') : row.name,
      })}
    </span>
  )
  if (!imp || !row) {
    return (
      <>
        {head}
        <Empty
          text={
            model.importanceMinimum !== null
              ? t('resultater.prio.tooFew', {
                  minimum: model.importanceMinimum,
                })
              : t('resultater.prio.notYours')
          }
        />
      </>
    )
  }

  const vals = model.scores[model.round.id]?.[row.id] ?? {}
  const keys = model.factors.filter((k) => vals[k] !== undefined && imp[k] !== undefined)
  const median = medianOf(keys.map((k) => imp[k]!))
  // the median at the middle line, the factor furthest from it 38 % above or below, so the
  // dots use the drawing's height however wide this round's correlations spread
  const spread = Math.max(0.05, ...keys.map((k) => Math.abs(imp[k]! - median)))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        {head}
        <RowChips rows={rows} current={row.id} onPick={(id) => pick({ row: id, factor: sel.factor })} />
      </div>
      <div className="mt-[6px] text-[11.5px] text-mut">{t('resultater.prio.up')}</div>
      {/* the dots keep their size at any width, so a phone scrolls the drawing rather than the page */}
      <div className="-mx-[4px] overflow-x-auto px-[4px]">
        <div className="relative mt-[12px] h-[410px] min-w-[560px]">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-[4px]" aria-hidden>
            <span className="rounded-cta bg-peach px-[14px] py-[12px] text-[12px] font-bold text-dangerdeep">
              {t('resultater.quadrant.fiks')}
            </span>
            <span className="rounded-cta bg-mint px-[14px] py-[12px] text-right text-[12px] font-bold text-greendeep">
              {t('resultater.quadrant.hold')}
            </span>
            <span className="flex items-end rounded-cta bg-cream px-[14px] py-[12px] text-[12px] font-bold text-cautiondeep">
              {t('resultater.quadrant.folg')}
            </span>
            <span className="flex items-end justify-end rounded-cta bg-track px-[14px] py-[12px] text-[12px] font-bold text-mut">
              {t('resultater.quadrant.lav')}
            </span>
          </div>
          {keys.map((k) => {
            const v = vals[k]!
            const on = sel.row === row.id && sel.factor === k
            const x = Math.max(8, Math.min(92, ((v - 25) / 60) * 100))
            const y = 50 - ((imp[k]! - median) / spread) * 38
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                aria-label={t('resultater.prio.dotAria', {
                  factor: t(`factor.${k}.name`),
                  index: v,
                  r: imp[k]!.toFixed(2),
                })}
                onClick={() => pick({ row: row.id, factor: k })}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-pill border-2 py-[5px] pl-[5px] pr-[11px] text-[12px] font-bold leading-[normal] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  zIndex: on ? 3 : 1,
                  background: on ? '#FBEBBE' : '#FFFDF6',
                  borderColor: on ? '#191510' : '#E8DFC9',
                  boxShadow: on ? '0 0 0 3px #F5C64A' : '0 4px 12px -6px rgba(25,21,16,.4)',
                }}
              >
                <span
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-pill text-[11px] text-ink"
                  style={{ background: heatTone(v).bg }}
                >
                  {v}
                </span>
                {t(`factor.${k}.name`)}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-[10px] flex justify-between text-[11.5px] text-mut">
        <span>{t('resultater.prio.low')}</span>
        <span>{t('resultater.prio.high')}</span>
      </div>
    </>
  )
}

// ------------------------------------------------------------------------ Segmentprofil

/**
 * One group against the rest (v3 2438-2463). "Resten" is the other groups the readers
 * released, weighted by how many answered in each: the design's arithmetic over the
 * design's own rows, and nothing a withheld group contributes.
 */
export function SegmentView({ model, sel, pick }: ViewProps) {
  const t = useTranslations()
  const now = model.scores[model.round.id] ?? {}
  const groups = model.rows.filter((r) => r.id !== ORG)
  const released = groups.filter((g) => now[g.id])
  const current = released.find((g) => g.id === sel.row) ?? released[0]

  return (
    <>
      <div className="flex flex-wrap items-center gap-[12px]">
        <span className="flex rounded-btn bg-track p-[3px]">
          <span className="rounded-bar bg-sf px-[14px] py-[7px] text-[12.5px] font-bold text-ink">
            {t('resultater.seg.team')}
          </span>
        </span>
        <span className="flex flex-wrap gap-[6px]">
          {groups.map((g) => {
            const open = !!now[g.id]
            const on = open && current?.id === g.id
            return (
              <button
                key={g.id}
                type="button"
                disabled={!open}
                aria-pressed={on}
                onClick={() => pick({ row: g.id, factor: sel.factor })}
                className={`rounded-pill border px-[13px] py-[7px] text-[12.5px] leading-[normal] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  on
                    ? 'cursor-pointer border-ink bg-ink font-bold text-bg'
                    : open
                      ? 'cursor-pointer border-line bg-sf font-medium text-ink'
                      : 'cursor-not-allowed border-line bg-transparent font-medium text-faint'
                }`}
              >
                {g.name} · {g.n}
              </button>
            )
          })}
        </span>
      </div>
      {!current ? (
        <Empty text={t('resultater.seg.none', { threshold: model.threshold })} />
      ) : (
        <SegmentRows
          model={model}
          sel={sel}
          pick={pick}
          group={current.id}
          others={released.filter((g) => g.id !== current.id)}
        />
      )}
    </>
  )
}

function SegmentRows({ model, sel, pick, group, others }: ViewProps & { group: string; others: { id: string; n: number }[] }) {
  const t = useTranslations()
  const now = model.scores[model.round.id] ?? {}
  if (!others.length) return <Empty text={t('resultater.seg.alone')} />
  const here = now[group]!
  const rest = (k: string) => {
    const has = others.filter((o) => now[o.id]?.[k] !== undefined)
    const n = has.reduce((a, o) => a + o.n, 0)
    return n ? Math.round(has.reduce((a, o) => a + now[o.id]![k]! * o.n, 0) / n) : null
  }
  const cols = 'grid-cols-[minmax(110px,170px)_1fr_1fr_44px_50px]'
  return (
    <>
      <div
        className={`mt-[6px] grid ${cols} gap-[12px] border-b border-line px-[8px] pb-[8px] pt-[14px] text-[11px] uppercase tracking-[.08em] text-mut`}
      >
        <span>{t('resultater.seg.factor')}</span>
        <span className="text-right">{t('resultater.seg.below')}</span>
        <span>{t('resultater.seg.above')}</span>
        <span className="text-right">{t('resultater.seg.here')}</span>
        <span className="text-right">{t('resultater.seg.rest')}</span>
      </div>
      {model.factors.map((k) => {
        const v = here[k]
        const r = rest(k)
        if (v === undefined || r === null) return null
        const d = v - r
        const on = sel.row === group && sel.factor === k
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => pick({ row: group, factor: k })}
            className={`grid w-full ${cols} cursor-pointer items-center gap-[12px] rounded-[8px] border-0 border-b border-solid border-track px-[8px] py-[9px] text-left leading-[normal] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${
              on ? 'bg-sbg' : 'bg-transparent'
            }`}
          >
            <span className="text-[13px] font-semibold">{t(`factor.${k}.name`)}</span>
            <span className="flex h-[18px] justify-end border-r-2 border-ink">
              <span className="block rounded-l-[5px] bg-orange2" style={{ width: `${d < 0 ? Math.min(100, -d * 5) : 0}%` }} />
            </span>
            <span className="flex h-[18px]">
              <span className="block rounded-r-[5px] bg-mint3" style={{ width: `${d > 0 ? Math.min(100, d * 5) : 0}%` }} />
            </span>
            <span className="text-right text-[14px] font-bold">{v}</span>
            <span className="text-right text-[13px] text-mut">{r}</span>
          </button>
        )
      })}
    </>
  )
}

// --------------------------------------------------------------------------- Sammenlign

/**
 * One grunnlinje against another (v3 2404-2436): the one chosen under "Sammenlign med",
 * or the one before. The first two tiles are the organisation's own index, which the
 * reader computes; for a group they are left out rather than averaged here (D-15).
 */
export function CompareView({ model, sel, pick }: ViewProps) {
  const t = useTranslations()
  // the prototype keeps Sammenlign's group apart from the cell (`v2CmpSeg`): it opens on
  // the whole organisation whatever cell was pressed, and choosing a group moves the cell
  const [scope, setScope] = useState(ORG)
  const other = model.compare ?? model.previous
  if (!other) {
    return (
      <>
        <span className="text-[15px] font-bold">{t('resultater.cmp.titleNone')}</span>
        <Empty text={t('resultater.cmp.none')} />
      </>
    )
  }
  const rows = scopedRows(model, [model.round.id, other.id])
  const row = rows.find((r) => r.id === scope) ?? rows[0]
  const [early, late] = (model.round.closesAt ?? '') < (other.closesAt ?? '') ? [model.round, other] : [other, model.round]
  const spanText = `${early.label}→${late.label}`

  const a = row ? (model.scores[model.round.id]?.[row.id] ?? {}) : {}
  const b = row ? (model.scores[other.id]?.[row.id] ?? {}) : {}
  const lines = model.factors
    .filter((k) => a[k] !== undefined && b[k] !== undefined)
    .map((k) => ({
      k,
      a: a[k]!,
      b: b[k]!,
      d: chronDelta({ v: a[k]!, at: model.round.closesAt }, { v: b[k]!, at: other.closesAt }),
    }))
  const best = [...lines].sort((p, q) => q.d - p.d)[0]
  const worst = [...lines].sort((p, q) => p.d - q.d)[0]
  const ia = row?.id === ORG ? model.overall[model.round.id] : null
  const ib = row?.id === ORG ? model.overall[other.id] : null
  const cols = 'grid-cols-[minmax(110px,170px)_1fr_42px_42px_90px]'

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <span className="text-[15px] font-bold">{t('resultater.cmp.title', { a: model.round.title, b: other.title })}</span>
        <RowChips
          rows={rows}
          current={row?.id ?? ''}
          onPick={(id) => {
            setScope(id)
            pick({ row: id, factor: sel.factor })
          }}
        />
      </div>
      {!row || !lines.length ? (
        <Empty text={t('resultater.cmp.noRows')} />
      ) : (
        <>
          <div className="mt-[14px] grid grid-cols-2 gap-[10px] md:grid-cols-4">
            {ia != null && ib != null ? (
              <>
                <div className="rounded-cta bg-sbg px-[14px] py-[12px]">
                  <div className="text-[11px] font-semibold text-cautiondeep">{model.round.label}</div>
                  <div className="text-[24px] font-bold">{ia}</div>
                </div>
                <div className="rounded-cta bg-pulse px-[14px] py-[12px]">
                  <div className="text-[11px] font-semibold text-greendeep">{other.label}</div>
                  <div className="text-[24px] font-bold">{ib}</div>
                </div>
              </>
            ) : null}
            <div className="rounded-cta border border-line bg-bg px-[14px] py-[12px]">
              <div className="text-[11px] font-semibold text-mut">{t('resultater.cmp.best')}</div>
              <div className="mt-[5px] text-[13.5px] font-bold text-link">
                {t(`factor.${best!.k}.name`)} {fmtDelta(best!.d)}
              </div>
            </div>
            <div className="rounded-cta border border-line bg-bg px-[14px] py-[12px]">
              <div className="text-[11px] font-semibold text-mut">{t('resultater.cmp.worst')}</div>
              <div className="mt-[5px] text-[13.5px] font-bold text-danger">
                {t(`factor.${worst!.k}.name`)} {fmtDelta(worst!.d)}
              </div>
            </div>
          </div>
          <div className="-mx-[4px] overflow-x-auto px-[4px]">
            <div className="min-w-[480px]">
              <div
                className={`grid ${cols} gap-[12px] border-b border-line px-[8px] pb-[8px] pt-[14px] text-[11px] uppercase tracking-[.08em] text-mut`}
              >
                <span>{t('resultater.seg.factor')}</span>
                <span />
                <span className="text-right">{model.round.label}</span>
                <span className="text-right">{other.label}</span>
                <span className="whitespace-nowrap text-right">{t('resultater.cmp.change', { span: spanText })}</span>
              </div>
              {lines.map((l) => {
                const on = sel.factor === l.k
                return (
                  <button
                    key={l.k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick({ row: row.id, factor: l.k })}
                    className={`grid w-full ${cols} cursor-pointer items-center gap-[12px] rounded-[8px] border-0 border-b border-solid border-track p-[8px] text-left leading-[normal] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${
                      on ? 'bg-sbg' : 'bg-transparent'
                    }`}
                  >
                    <span className="text-[13px] font-semibold">{t(`factor.${l.k}.name`)}</span>
                    <span className="flex flex-col gap-[3px]">
                      <span className="h-[8px] rounded-pill bg-[rgba(25,21,16,.06)]">
                        <span className="block h-full rounded-pill bg-amberbar" style={{ width: `${l.a}%` }} />
                      </span>
                      <span className="h-[8px] rounded-pill bg-[rgba(25,21,16,.06)]">
                        <span className="block h-full rounded-pill bg-sage" style={{ width: `${l.b}%` }} />
                      </span>
                    </span>
                    <span className="text-right text-[14px] font-bold">{l.a}</span>
                    <span className="text-right text-[13px] text-mut">{l.b}</span>
                    <span className="text-right text-[13px] font-bold" style={{ color: deltaColour(l.d) }}>
                      {fmtDelta(l.d)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-[12px] flex gap-[16px] text-[11.5px] text-mut">
            <span className="flex items-center gap-[6px]">
              <span className="h-[6px] w-[14px] rounded-pill bg-amberbar" />
              {model.round.label}
            </span>
            <span className="flex items-center gap-[6px]">
              <span className="h-[6px] w-[14px] rounded-pill bg-sage" />
              {other.label}
            </span>
          </div>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------- Utvikling

/**
 * Every measurement over time (v3 2385-2402). A column per closed round and the next one
 * planned; a puls has figures only for the factors it measured, and no index of its own.
 * A cell opens that measurement, so it is a link: a different round is a different page.
 */
export function TimelineView({ model, sel }: ViewProps) {
  const t = useTranslations()
  const cols = model.timeline
  const rows = model.rows.filter((r) => cols.some((c) => model.scores[c.id]?.[r.id]))
  // its own group, opening on the whole organisation (the prototype's `v2TlSeg`)
  const [scope, setScope] = useState(ORG)
  const row = rows.find((r) => r.id === scope) ?? rows[0]
  const factors = model.factors

  const cell = (c: RoundRef, v: number | null | undefined, withheld: boolean, query: Record<string, string>) => {
    if (c.planned)
      return <span key={c.id} className="h-[36px] rounded-[7px] border-[1.5px] border-dashed border-rule" aria-hidden />
    if (v === null || v === undefined)
      return (
        <span
          key={c.id}
          className={`flex h-[36px] items-center justify-center rounded-[7px] border-[1.5px] border-transparent text-[12.5px] font-bold ${
            withheld ? 'bg-[rgba(25,21,16,.05)] text-faint' : 'bg-[rgba(25,21,16,.03)] text-rule'
          }`}
        >
          {withheld ? '—' : '·'}
        </span>
      )
    const tone = heatTone(v)
    const q = new URLSearchParams({ maling: c.id, ...query })
    return (
      <Link
        key={c.id}
        href={`/resultater?${q.toString()}` as Route}
        className="flex h-[36px] items-center justify-center rounded-[7px] border-[1.5px] border-transparent text-[12.5px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
        style={{ background: tone.bg, color: tone.fg }}
      >
        {v}
      </Link>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <span className="text-[15px] font-bold">{t('resultater.tl.title')}</span>
        {row ? <RowChips rows={rows} current={row.id} onPick={setScope} /> : null}
      </div>
      {!row ? (
        <Empty text={t('resultater.drill.none', { threshold: model.threshold })} />
      ) : (
        <div className="-mx-[4px] overflow-x-auto px-[4px]">
          <div
            className="mt-[14px] grid min-w-[600px] gap-[4px] text-[11px]"
            style={{
              gridTemplateColumns: `150px repeat(${cols.length}, minmax(0, 1fr))`,
            }}
          >
            <span />
            {cols.map((c) => (
              <span
                key={c.id}
                className={`rounded-[7px] px-[2px] py-[5px] text-center leading-[1.2] ${
                  c.planned
                    ? 'border border-dashed border-rule'
                    : `border border-transparent ${c.kind === 'puls' ? 'bg-pulse' : 'bg-track'}`
                }`}
              >
                <span className="block font-bold text-ink">{c.month}</span>
                <span className="block text-[10px] text-mut">
                  {t(c.open ? 'resultater.tl.open' : c.planned ? 'resultater.tl.planned' : `resultater.tl.${c.kind}`)}
                </span>
              </span>
            ))}
            {row.id === ORG ? (
              <>
                <span className="flex items-center text-[12.5px] font-bold">{t('resultater.tl.index')}</span>
                {cols.map((c) =>
                  cell(c, c.kind === 'grunnlinje' ? model.overall[c.id] : null, false, { gruppe: row.id, faktor: sel.factor }),
                )}
              </>
            ) : null}
            {factors.map((k) => (
              <TimelineRow key={k} label={t(`factor.${k}.name`)}>
                {cols.map((c) => {
                  const perRow = model.scores[c.id]
                  const measured = model.measured[c.id]?.includes(k) ?? false
                  const withheld = measured && perRow?.[row.id] === null
                  return cell(c, perRow?.[row.id]?.[k], withheld, {
                    gruppe: row.id,
                    faktor: k,
                  })
                })}
              </TimelineRow>
            ))}
          </div>
        </div>
      )}
      <div className="mt-[12px] text-[11.5px] leading-[1.5] text-mut">{t('resultater.tl.note')}</div>
    </>
  )
}

function TimelineRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="flex items-center text-[12.5px] font-semibold">{label}</span>
      {children}
    </>
  )
}
