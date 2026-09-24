'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { adoptPlaybookMeasure } from '@/app/(app)/tiltak/actions'
import { PLAYBOOK_KIND_BG, playbookFor } from '@/lib/playbook/registry'
import {
  ORG,
  QUADRANT_TONE,
  VIEWS,
  chronDelta,
  medianOf,
  quadrantOf,
  type ResultaterModel,
  type ViewKey,
} from '@/lib/results/resultater'
import { fmtDelta, heatTone } from '@/lib/results/tone'
import { CompareView, PriorityView, SegmentView, TimelineView } from './views'

/**
 * Resultater's workspace (v3 2320-2540): the view switcher, the view, the drill-down beside
 * it and "Forslag basert på resultatene" under both.
 *
 * A selection is a (row, factor) pair: a heat-map cell, a dot on Prioritet, a row on
 * Sammenlign. Every view reads and sets the same pair, so the drill-down and the
 * suggestions follow whatever was pressed last, as the prototype's `v2T`/`v2F` do. It is
 * mirrored to the URL with `replaceState`, so a reload or a copied link keeps the cell
 * without a server round trip per press.
 *
 * Only released rows can be selected. A withheld row is drawn and cannot be pressed: there
 * is nothing behind it to drill into.
 */
export interface Selection {
  row: string
  factor: string
}

export function Workspace({ model }: { model: ResultaterModel }) {
  const t = useTranslations()
  const [view, setView] = useState<ViewKey>(model.initial.view)
  const [sel, setSel] = useState<Selection>({
    row: model.initial.row,
    factor: model.initial.factor,
  })
  const [flash, setFlash] = useState<string | null>(null)
  const [justAdopted, setJustAdopted] = useState<string[]>([])

  const now = model.scores[model.round.id] ?? {}
  const value = (row: string, factor: string) => now[row]?.[factor] ?? null

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('visning', view)
    url.searchParams.set('gruppe', sel.row)
    url.searchParams.set('faktor', sel.factor)
    if (view === 'varmekart') url.searchParams.delete('visning')
    window.history.replaceState(window.history.state, '', url)
  }, [view, sel])

  const adopted = useMemo(() => new Set([...model.adopted, ...justAdopted]), [model.adopted, justAdopted])
  const pick = (next: Selection) => {
    setSel(next)
    setFlash(null)
  }
  const onAdopted = (key: string, title: string) => {
    setJustAdopted((a) => [...a, key])
    setFlash(t('resultater.flash', { title }))
  }

  /**
   * Prioritet opens on the whole organisation and Segmentprofil on a group, as the
   * prototype's view buttons set `v2T`: each view starts where it reads best, and the
   * drill-down follows it there.
   */
  const choose = (v: ViewKey) => {
    setView(v)
    if (v === 'prioritet' && now[ORG]) pick({ row: ORG, factor: sel.factor })
    if (v === 'segment' && (sel.row === ORG || !now[sel.row])) {
      const g = model.rows.find((r) => r.id !== ORG && now[r.id])
      if (g) pick({ row: g.id, factor: sel.factor })
    }
  }

  const rowName = (id: string) => model.rows.find((r) => r.id === id)?.name ?? ''

  return (
    <>
      <div className="mt-[20px] flex flex-wrap items-center justify-between gap-[16px]">
        <span
          className="flex max-w-full overflow-x-auto rounded-cta border border-line bg-track p-[3px]"
          role="tablist"
          aria-label={t('resultater.viewsAria')}
        >
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => choose(v)}
              className={`shrink-0 cursor-pointer rounded-bar border-none px-[16px] py-[8px] text-[13px] font-bold leading-[normal] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${
                view === v ? 'bg-ink text-bg' : 'bg-transparent text-ink'
              }`}
            >
              {t(`resultater.view.${v}`)}
            </button>
          ))}
        </span>
        <span className="text-[12.5px] text-mut">{t(`resultater.hint.${view}`)}</span>
      </div>

      <div className="mt-[12px] grid grid-cols-1 items-stretch gap-[14px] lg:grid-cols-[1.55fr_1fr]">
        <div className="min-h-[520px] min-w-0 rounded-note border border-line bg-sf px-[22px] py-[20px]" role="tabpanel">
          {view === 'varmekart' ? <HeatView model={model} sel={sel} pick={pick} /> : null}
          {view === 'prioritet' ? <PriorityView model={model} sel={sel} pick={pick} /> : null}
          {view === 'segment' ? <SegmentView model={model} sel={sel} pick={pick} /> : null}
          {view === 'sammenlign' ? <CompareView model={model} sel={sel} pick={pick} /> : null}
          {view === 'utvikling' ? <TimelineView model={model} sel={sel} pick={pick} /> : null}
        </div>
        <Drill model={model} sel={sel} value={value(sel.row, sel.factor)} adopted={adopted} onAdopted={onAdopted} flash={flash} />
      </div>

      <Suggestions
        model={model}
        sel={sel}
        scopeName={sel.row === ORG ? t('resultater.recs.scopeOrg') : rowName(sel.row)}
        pick={pick}
        adopted={adopted}
        onAdopted={onAdopted}
        flash={flash}
      />
    </>
  )
}

type Pick = (s: Selection) => void

/** Varmekart (v3 2332-2356): every row × every factor of the round, with its legend. */
function HeatView({ model, sel, pick }: { model: ResultaterModel; sel: Selection; pick: Pick }) {
  const t = useTranslations()
  const now = model.scores[model.round.id] ?? {}
  const was = model.compare ? (model.scores[model.compare.id] ?? {}) : null
  const anyProtected = model.rows.some((r) => r.status === 'protected')

  return (
    <>
      <div className="text-[15px] font-bold">{t('resultater.heat.title')}</div>
      <div className="-mx-[4px] overflow-x-auto px-[4px] pb-[2px]">
        <div
          className="mt-[14px] grid min-w-[560px] gap-[4px] text-[11px]"
          style={{
            gridTemplateColumns: `132px repeat(${model.factors.length}, minmax(0, 1fr))`,
          }}
        >
          <span />
          {model.factors.map((k) => (
            <span key={k} className="flex min-w-0 justify-center whitespace-nowrap leading-[1.2] text-mut">
              {t(`factor.${k}.abbr`)}
            </span>
          ))}
          {model.rows.map((r) => {
            const vals = now[r.id] ?? null
            return (
              <HeatRow
                key={r.id}
                label={r.name}
                n={t('resultater.heat.n', { n: r.n })}
                strong={r.id === ORG}
                masked={!vals}
                cells={model.factors.map((k) => {
                  const v = vals?.[k]
                  if (v === undefined) return { key: k, v: null }
                  const b = was?.[r.id]?.[k]
                  const d =
                    b === undefined || !model.compare
                      ? null
                      : chronDelta({ v, at: model.round.closesAt }, { v: b, at: model.compare.closesAt })
                  return { key: k, v, d }
                })}
                sel={sel}
                rowId={r.id}
                pick={pick}
                aria={(k, v) =>
                  t('resultater.heat.cellAria', {
                    group: r.name,
                    factor: t(`factor.${k}.name`),
                    index: v,
                  })
                }
                maskedAria={t(r.status === 'protected' ? 'results.protectedAria' : 'results.maskedAria', {
                  threshold: model.threshold,
                })}
              />
            )
          })}
        </div>
      </div>
      <div className="mt-[16px] flex flex-wrap gap-[14px] text-[11.5px] text-mut">
        {LEGEND.map(([key, fill]) => (
          <span key={key} className="flex items-center gap-[6px]">
            <span className="h-[14px] w-[14px] rounded-[4px]" style={{ background: fill }} />
            {t(`resultater.legend.${key}`)}
          </span>
        ))}
        <span className="ml-auto">{t('resultater.heat.masked', { threshold: model.threshold })}</span>
      </div>
      {anyProtected ? (
        <div className="mt-[8px] text-right text-[11.5px] leading-[1.5] text-mut">{t('resultater.heat.protected')}</div>
      ) : null}
    </>
  )
}

const LEGEND: Array<[string, string]> = [
  ['under40', '#E38258'],
  ['from40', '#EC9B77'],
  ['from50', '#F5DC96'],
  ['from62', '#CFE7E4'],
  ['from72', '#B5DAD4'],
]

function HeatRow({
  label,
  n,
  strong,
  masked,
  cells,
  sel,
  rowId,
  pick,
  aria,
  maskedAria,
}: {
  label: string
  n: string
  strong: boolean
  masked: boolean
  cells: { key: string; v: number | null; d?: number | null }[]
  sel: Selection
  rowId: string
  pick: Pick
  aria: (key: string, v: number) => string
  maskedAria: string
}) {
  return (
    <>
      <span
        className={`flex flex-col justify-center text-[12.5px] ${strong ? 'font-bold' : 'font-semibold'} ${masked ? 'text-faint' : 'text-ink'}`}
      >
        {label}
        <span className="text-[10.5px] font-medium text-mut">{n}</span>
      </span>
      {cells.map((c) => {
        if (c.v === null)
          return (
            <span
              key={c.key}
              role="img"
              aria-label={maskedAria}
              className="flex h-[52px] items-center justify-center rounded-[8px] border-2 border-transparent bg-[rgba(25,21,16,.05)] text-[13.5px] font-bold text-faint"
            >
              —
            </span>
          )
        const tone = heatTone(c.v)
        const on = sel.row === rowId && sel.factor === c.key
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            aria-label={aria(c.key, c.v)}
            onClick={() => pick({ row: rowId, factor: c.key })}
            className="flex h-[52px] cursor-pointer flex-col items-center justify-center gap-px rounded-[8px] border-2 text-[13.5px] font-bold leading-[1.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
            style={{
              background: tone.bg,
              color: tone.fg,
              borderColor: on ? '#191510' : 'transparent',
            }}
          >
            {c.v}
            {c.d !== null && c.d !== undefined ? (
              <span className="text-[10px] font-semibold opacity-80">{fmtDelta(c.d)}</span>
            ) : null}
          </button>
        )
      })}
    </>
  )
}

interface AdoptProps {
  adopted: ReadonlySet<string>
  onAdopted: (key: string, title: string) => void
}

/** The drill-down (v3 2466-2508): the selected cell, its statements, a comment, the playbook. */
function Drill({
  model,
  sel,
  value,
  adopted,
  onAdopted,
  flash,
}: {
  model: ResultaterModel
  sel: Selection
  value: number | null
  flash: string | null
} & AdoptProps) {
  const t = useTranslations()
  const k = sel.factor
  const row = model.rows.find((r) => r.id === sel.row)
  const card = 'flex flex-col rounded-note border border-line bg-sf px-[22px] py-[20px] text-ink'
  if (value === null || !row || !k) {
    return (
      <div className={card}>
        <span className="text-[12.5px] leading-[1.5] text-mut">{t('resultater.drill.none', { threshold: model.threshold })}</span>
      </div>
    )
  }

  const tone = heatTone(value)
  const scores = (id: string | undefined, rowId: string) => (id ? model.scores[id]?.[rowId]?.[k] : undefined)
  const org = sel.row === ORG ? undefined : scores(model.round.id, ORG)
  const cmp = scores(model.compare?.id, sel.row)
  const prev = scores(model.previous?.id, sel.row)

  let comp: string | null = null
  if (model.compare && cmp !== undefined) {
    const d = chronDelta({ v: value, at: model.round.closesAt }, { v: cmp, at: model.compare.closesAt })
    comp = t('resultater.drill.span', {
      span: spanOf(model.round, model.compare),
      delta: fmtDelta(d),
      year: model.compare.label,
      value: cmp,
    })
  } else if (org !== undefined) {
    const diff = value - org
    comp = t(diff < 0 ? 'resultater.drill.below' : 'resultater.drill.above', {
      diff: Math.abs(diff),
      org,
    })
  } else if (prev !== undefined) {
    comp = t('resultater.drill.yearBefore', { delta: fmtDelta(value - prev) })
  } else if (!model.previous) {
    comp = t('resultater.drill.firstBaseline')
  }

  const imp = model.importance
  const r = imp?.[k]
  const quad =
    imp && r !== undefined
      ? quadrantOf(value, r, medianOf(model.factors.flatMap((f) => (imp[f] === undefined ? [] : [imp[f]!]))))
      : null

  const statements = [...(model.items[sel.row]?.[k] ?? [])].sort((a, b) => a.ordinal - b.ordinal)
  const comment = model.comments[k]
  // D2: a comment never travels with a group, so the quote stands only under the whole organisation
  const quote = sel.row === ORG ? (comment?.quote ?? null) : null

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-[10px]">
        <span className="text-[11px] uppercase tracking-[.11em] text-mut">{row.name}</span>
        {quad ? (
          <span
            className="rounded-pill px-[10px] py-[3px] text-[11px] font-bold"
            style={{
              background: QUADRANT_TONE[quad].bg,
              color: QUADRANT_TONE[quad].fg,
            }}
          >
            {t(`resultater.quadrant.${quad}`)}
          </span>
        ) : null}
      </div>
      <div className="mt-[8px] flex items-baseline justify-between gap-[12px]">
        <h2 className="font-display text-[25px] font-semibold leading-[1.15]">{t(`factor.${k}.name`)}</h2>
        <span className="rounded-ctl px-[12px] py-[4px] text-[24px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
          {value}
        </span>
      </div>
      {comp ? <div className="mt-[4px] text-[12.5px] text-mut">{comp}</div> : null}
      {statements.length ? (
        <div className="mt-[16px] flex flex-col gap-[9px]">
          {statements.map((s) => (
            <div key={s.ordinal}>
              <div className="flex justify-between gap-[10px] text-[12px]">
                <span className="text-body">{t(`factor.${k}.s${s.ordinal}`)}</span>
                <span className="font-bold">{s.index}</span>
              </div>
              <div className="mt-[4px] h-[5px] rounded-pill bg-[rgba(25,21,16,.08)]">
                <div className="h-full rounded-pill bg-amberbar" style={{ width: `${s.index}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {quote ? (
        <div className="mt-[14px] rounded-btn border-l-[3px] border-line bg-bg px-[13px] py-[11px] text-[12.5px] italic leading-[1.5]">
          «{quote}»
        </div>
      ) : null}
      {comment?.count ? (
        <Link
          href={`/kommentarer?maling=${model.round.id}&faktor=${k}` as Route}
          className="mt-[8px] self-start py-[2px] text-[12.5px] font-bold text-link hover:text-linkhover focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          {t('resultater.drill.comments', { count: comment.count })}
        </Link>
      ) : null}
      <div className="mt-[18px] text-[11px] uppercase tracking-[.11em] text-mut">{t('resultater.drill.suggested')}</div>
      <div className="mt-[8px] flex flex-col gap-[7px]">
        {playbookFor(k).map((e) => (
          <div
            key={e.key}
            className="flex items-center gap-[10px] rounded-btn border border-line bg-bg px-[12px] py-[10px] text-ink"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{t(`playbook.${k}.m${e.n}.title`)}</span>
              <span className="block text-[11px] text-mut">
                {t(`playbook.kind.${e.kind}`)} · {t(`playbook.${k}.m${e.n}.time`)}
              </span>
            </span>
            <AdoptButton
              playbookKey={e.key}
              title={t(`playbook.${k}.m${e.n}.title`)}
              roundId={model.round.id}
              adopted={adopted.has(e.key)}
              onAdopted={onAdopted}
              className="flex-none"
            />
          </div>
        ))}
      </div>
      {flash ? <Flash text={flash} /> : null}
    </div>
  )
}

/** "Forslag basert på resultatene" (v3 2509-2540): the three lowest factors of the selected row. */
function Suggestions({
  model,
  sel,
  scopeName,
  pick,
  adopted,
  onAdopted,
  flash,
}: {
  model: ResultaterModel
  sel: Selection
  scopeName: string
  pick: Pick
  flash: string | null
} & AdoptProps) {
  const t = useTranslations()
  const vals = model.scores[model.round.id]?.[sel.row]
  if (!vals) return null
  const lowest = Object.entries(vals)
    .sort((a, b) => a[1] - b[1] || model.factors.indexOf(a[0]) - model.factors.indexOf(b[0]))
    .slice(0, 3)

  return (
    <div className="mt-[16px] rounded-note border border-line bg-sf px-[22px] py-[20px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
        <h2 className="text-[17px] font-bold">{t('resultater.recs.title', { scope: scopeName })}</h2>
        <span className="text-[12.5px] text-mut">{t('resultater.recs.hint')}</span>
      </div>
      <div
        className="mt-[14px] grid gap-[12px]"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
        }}
      >
        {lowest.map(([k, v]) => {
          const tone = heatTone(v)
          const on = sel.factor === k
          return (
            <div
              key={k}
              className="flex min-w-0 flex-col gap-[10px] rounded-opt border bg-bg px-[16px] pb-[14px] pt-[16px]"
              style={{ borderColor: on ? '#191510' : '#E8DFC9' }}
            >
              <button
                type="button"
                aria-pressed={on}
                onClick={() => pick({ row: sel.row, factor: k })}
                className="flex cursor-pointer items-center justify-between gap-[10px] border-none bg-transparent p-0 text-left leading-[normal] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span className="text-[15px] font-bold">{t(`factor.${k}.name`)}</span>
                <span
                  className="flex-none rounded-[8px] px-[10px] py-[3px] text-[15px] font-bold"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  {v}
                </span>
              </button>
              <div className="text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">{t(`playbook.${k}.ev`)}</div>
              {playbookFor(k).map((e) => (
                <div key={e.key} className="rounded-btn border border-line bg-sf px-[12px] py-[11px]">
                  <div className="flex items-center gap-[8px]">
                    <span
                      className="flex-none rounded-pill px-[9px] py-[2px] text-[10.5px] font-bold"
                      style={{ background: PLAYBOOK_KIND_BG[e.kind] }}
                    >
                      {t(`playbook.kind.${e.kind}`)}
                    </span>
                    <span className="text-[11px] text-mut">{t(`playbook.${k}.m${e.n}.time`)}</span>
                  </div>
                  <div className="mt-[6px] text-[13px] font-bold leading-[1.35]">{t(`playbook.${k}.m${e.n}.title`)}</div>
                  <div className="mt-[4px] text-[12px] leading-[1.5] text-body [text-wrap:pretty]">
                    {t(`playbook.${k}.m${e.n}.how`)}
                  </div>
                  <AdoptButton
                    playbookKey={e.key}
                    title={t(`playbook.${k}.m${e.n}.title`)}
                    roundId={model.round.id}
                    adopted={adopted.has(e.key)}
                    onAdopted={onAdopted}
                    className="mt-[9px]"
                  />
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {flash ? <Flash text={flash} wrap /> : null}
    </div>
  )
}

/**
 * "Legg i plan" (v3 2496, 2530). A real button posting to the same server action as
 * Tiltak's "Gjør til tiltak" (0031): the suggestion becomes a measure at `foreslatt`, and
 * "I planen ✓" is then read from the organisation's measures, not remembered here.
 */
function AdoptButton({
  playbookKey,
  title,
  roundId,
  adopted,
  onAdopted,
  className,
}: {
  playbookKey: string
  title: string
  roundId: string
  adopted: boolean
  onAdopted: (key: string, title: string) => void
  className: string
}) {
  const t = useTranslations()
  const [pending, start] = useTransition()
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <span className={`inline-flex flex-col items-start ${className}`}>
      <button
        type="button"
        disabled={adopted || pending}
        aria-pressed={adopted}
        onClick={() =>
          start(async () => {
            const data = new FormData()
            data.set('key', playbookKey)
            data.set('roundId', roundId)
            const result = await adoptPlaybookMeasure(data)
            if (result.ok) onAdopted(playbookKey, title)
            setProblem(result.ok ? null : result.problem)
          })
        }
        className={`h-[30px] cursor-pointer whitespace-nowrap rounded-[8px] border border-ink px-[12px] text-[11.5px] font-bold text-ink disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
          adopted ? 'bg-mint' : 'bg-ac'
        }`}
      >
        {adopted ? t('resultater.drill.inPlan') : t('resultater.drill.add')}
      </button>
      {problem ? (
        <span className="mt-[6px] text-[11.5px] leading-[1.4] text-danger">{t(`tiltak.problem.${problem}`)}</span>
      ) : null}
    </span>
  )
}

function Flash({ text, wrap = false }: { text: string; wrap?: boolean }) {
  const t = useTranslations()
  return (
    <div
      role="status"
      className={`mt-[12px] flex items-center gap-[10px] rounded-btn bg-mint px-[13px] py-[11px] text-[12.5px] text-greendeep ${
        wrap ? 'flex-wrap' : 'leading-[1.5]'
      }`}
    >
      <span className={`flex-1 ${wrap ? 'min-w-[200px]' : ''}`}>{text}</span>
      <Link
        href="/tiltak"
        className="inline-flex h-[28px] flex-none items-center rounded-[8px] border border-greendeep bg-transparent px-[11px] text-[11.5px] font-bold text-greendeep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {t('resultater.openPlan')}
      </Link>
    </div>
  )
}

export function spanOf(a: { label: string; closesAt: string | null }, b: { label: string; closesAt: string | null }): string {
  return (a.closesAt ?? '') < (b.closesAt ?? '') ? `${a.label}→${b.label}` : `${b.label}→${a.label}`
}
