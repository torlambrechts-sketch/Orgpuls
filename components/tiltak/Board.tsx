'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { adoptPlaybookMeasure, advanceMeasure, type MeasureActionResult } from '@/app/(app)/tiltak/actions'
import { playbookFor } from '@/lib/playbook/registry'
import { heatTone } from '@/lib/results/tone'

/**
 * Tiltak › Tavle (v3 2850-3010). D-75.
 *
 * Four columns from finding to effect. A card is a measure, placed by its step:
 *
 *   Funn           a measure only suggested (`foreslatt`), and the findings: the lowest
 *                  released scores of the latest grunnlinje on factors nobody has a measure on
 *   Valgt fokus    `besluttet`
 *   Tiltak pågår   `pagar` and `gjennomfort` — carried out, its effect not measured yet
 *   Effekt målt    `effekt_malt`
 *
 * A closed measure has left the board; the Liste holds it. Every move is one of the
 * measure writes the Liste already uses (`advanceMeasure`, `adoptPlaybookMeasure`), so the
 * rules in 0013 and 0015 decide what may happen, not this component.
 *
 * The page builds the model (app/(app)/tiltak/page.tsx): scores, deltas and statements come
 * from `results_workspace` for the latest grunnlinje, k-gated there.
 */
export type Column = 'funn' | 'fokus' | 'pagar' | 'effekt'
export const COLUMNS: Column[] = ['funn', 'fokus', 'pagar', 'effekt']
const COLUMN_BG: Record<Column, string> = { funn: '#F2EAD6', fokus: '#FBEBBE', pagar: '#FFF4D6', effekt: '#DDEEEA' }

export interface BoardCard {
  /** a measure's id, or `funn:<factor>` for a finding */
  id: string
  measureId: string | null
  column: Column
  step: string | null
  factorKey: string
  score: number | null
  /** the departments it concerns, by name; empty is the whole organisation */
  groups: string[]
  groupIds: string[]
  delta: { value: number; against: 'avg' | 'year' } | null
  title: string | null
  /** a finding's first suggestion not yet taken */
  suggestionKey: string | null
  owner: string | null
  due: { text: string; late: boolean } | null
  effectNote: string | null
  target: number | null
  playbookKey: string | null
  /** the statement it is followed up on, and where it stands now */
  statement: { ordinal: number; index: number | null } | null
  start: string | null
  dueDate: string | null
}

export interface MeasurePoint {
  at: string
  label: string
  title: string
  meta: string
  /** null: it measures every factor */
  factors: string[] | null
}

export interface BoardModel {
  cards: BoardCard[]
  groups: { id: string; name: string }[]
  adopted: string[]
  roundId: string | null
  points: MeasurePoint[]
  window: { start: string; months: string[]; end: string; title: string }
  initial: string | null
}

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function Board({ model }: { model: BoardModel }) {
  const t = useTranslations('tiltak')
  const tf = useTranslations()
  const [filter, setFilter] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(model.initial)
  // a measure a press just created: the refreshed model carries it a render after the press returns
  const [follow, setFollow] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const pick = (id: string) => {
    setFollow(null)
    setSelId(id)
  }

  const shown = model.cards.filter((c) => filter === null || c.groupIds.length === 0 || c.groupIds.includes(filter))
  const sel = model.cards.find((c) => c.id === follow) ?? model.cards.find((c) => c.id === selId) ?? shown[0] ?? null

  // null state, so the router takes the address as its own and a refresh keeps it
  useEffect(() => {
    if (!sel) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('kort') === sel.id) return
    url.searchParams.set('kort', sel.id)
    window.history.replaceState(null, '', url)
  }, [sel])
  const adopted = new Set(model.adopted)

  const run = (fn: () => Promise<MeasureActionResult>, andFollow = false) =>
    start(async () => {
      const r = await fn()
      setProblem(r.ok ? null : r.problem)
      // a finding chosen as focus becomes a measure: the selection follows it to its new column
      if (andFollow && r.ok && r.id) setFollow(r.id)
    })
  const adopt = (key: string, card: BoardCard, step: 'foreslatt' | 'besluttet') =>
    run(() => {
      const d = new FormData()
      d.set('key', key)
      d.set('step', step)
      if (model.roundId) d.set('roundId', model.roundId)
      if (card.groupIds.length === 1) d.set('groupId', card.groupIds[0]!)
      return adoptPlaybookMeasure(d)
    }, !card.measureId)
  const advance = (id: string) =>
    run(() => {
      const d = new FormData()
      d.set('id', id)
      return advanceMeasure(d)
    })

  const seg = (c: BoardCard) => (c.groups.length ? c.groups.join(', ') : t('board.all'))

  return (
    <div className="pt-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-[16px]">
        <span>
          <span className="block text-[17px] font-bold">{t('board.title')}</span>
          <span className="mt-[2px] block text-[12.5px] text-mut">{t('board.lead')}</span>
        </span>
        <span className="flex flex-wrap gap-[6px]">
          {[null, ...model.groups.map((g) => g.id)].map((id) => (
            <button
              key={id ?? 'alle'}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`cursor-pointer rounded-pill border px-[13px] py-[7px] text-[12.5px] font-bold leading-[normal] ${focus} ${
                filter === id ? 'border-ink bg-ink text-bg' : 'border-line bg-sf text-ink'
              }`}
            >
              {id === null ? t('board.all') : model.groups.find((g) => g.id === id)?.name}
            </button>
          ))}
        </span>
      </div>

      <div className="mt-[14px] grid grid-cols-1 gap-[12px] sm:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const cards = shown.filter((c) => c.column === col)
          return (
            <section
              key={col}
              aria-label={t(`board.col.${col}.title`)}
              className="min-h-[250px] rounded-note p-[12px]"
              style={{ background: COLUMN_BG[col] }}
            >
              <div className="flex items-baseline justify-between px-[4px] pb-[4px] pt-[2px]">
                <span className="text-[14px] font-bold">{t(`board.col.${col}.title`)}</span>
                <span className="text-[12px] text-mut">{cards.length}</span>
              </div>
              <div className="px-[4px] pb-[10px] text-[11.5px] text-mut">{t(`board.col.${col}.hint`)}</div>
              <div className="flex flex-col gap-[8px]">
                {cards.map((c) => {
                  const on = sel?.id === c.id
                  const tone = c.score !== null ? heatTone(c.score) : null
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => pick(c.id)}
                      className={`w-full cursor-pointer rounded-cta border bg-sf px-[13px] py-[12px] text-left leading-[normal] text-ink ${focus}`}
                      style={{ borderColor: on ? '#191510' : '#E8DFC9', boxShadow: on ? '0 0 0 2px #191510' : 'none' }}
                    >
                      <span className="flex items-start justify-between gap-[8px]">
                        <span className="text-[13px] font-bold leading-[1.3]">{tf(`factor.${c.factorKey}.name`)}</span>
                        {tone ? (
                          <span
                            className="flex-none rounded-[7px] px-[8px] py-[2px] text-[12.5px] font-bold"
                            style={{ background: tone.bg, color: tone.fg }}
                          >
                            {c.score}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-[6px] flex flex-wrap items-center gap-[6px]">
                        <span className="rounded-pill bg-track px-[9px] py-[2px] text-[11px] font-semibold">{seg(c)}</span>
                        {c.delta ? (
                          <span
                            className="text-[11px] font-semibold"
                            style={{ color: c.delta.value < 0 ? '#A33A16' : '#2F5D2A' }}
                          >
                            {t(c.delta.against === 'avg' ? 'board.deltaAvg' : 'board.deltaYear', {
                              delta: signed(c.delta.value),
                            })}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-[8px] block text-[12.5px] leading-[1.4] text-body [text-wrap:pretty]">
                        {c.title ??
                          (c.suggestionKey ? t('board.suggestion', { title: suggestionTitle(tf, c.suggestionKey) }) : '')}
                      </span>
                      <span className="mt-[9px] flex justify-between gap-[8px] border-t border-line pt-[8px] text-[11px]">
                        <span className="text-mut">{c.measureId ? (c.owner ?? t('board.noOwner')) : t('board.notChosen')}</span>
                        <span className="font-bold" style={{ color: actionColour(c) }}>
                          {actionLabel(t, c)}
                        </span>
                      </span>
                    </button>
                  )
                })}
                {cards.length === 0 ? (
                  <div className="rounded-cta border border-dashed border-rule p-[14px] text-center text-[12px] text-mut">
                    {t('board.empty')}
                  </div>
                ) : null}
              </div>
            </section>
          )
        })}
      </div>

      {sel ? (
        <div className="mt-[16px] grid grid-cols-1 gap-[14px] lg:grid-cols-[1.35fr_1fr]">
          <Detail
            card={sel}
            seg={seg(sel)}
            model={model}
            adopted={adopted}
            pending={pending}
            problem={problem}
            onAdopt={adopt}
            onAdvance={advance}
          />
          <Effect card={sel} model={model} />
        </div>
      ) : null}

      <Plan model={model} cards={shown} selId={sel?.id ?? null} onPick={pick} seg={seg} />
    </div>
  )
}

function signed(n: number) {
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}`
}

function suggestionTitle(tf: ReturnType<typeof useTranslations>, key: string) {
  const [factor, n] = key.split('.')
  return tf(`playbook.${factor}.m${n}.title`)
}

function actionLabel(t: ReturnType<typeof useTranslations>, c: BoardCard) {
  if (c.column === 'funn') return t('board.chooseFocus')
  if (c.column === 'effekt') return t('board.effectMeasured')
  if (c.column === 'fokus' && (!c.owner || !c.due)) return t('board.setOwner')
  return c.due?.text ?? t('board.dueUnset')
}

function actionColour(c: BoardCard) {
  if (c.column === 'effekt') return '#2F5D2A'
  if (c.due?.late && c.column !== 'funn') return '#A33A16'
  return '#5F5849'
}

function Detail({
  card,
  seg,
  model,
  adopted,
  pending,
  problem,
  onAdopt,
  onAdvance,
}: {
  card: BoardCard
  seg: string
  model: BoardModel
  adopted: Set<string>
  pending: boolean
  problem: string | null
  onAdopt: (key: string, card: BoardCard, step: 'foreslatt' | 'besluttet') => void
  onAdvance: (id: string) => void
}) {
  const t = useTranslations('tiltak')
  const tf = useTranslations()
  const tone = card.score !== null ? heatTone(card.score) : null
  const reached =
    card.column === 'funn' ? 0 : card.step === 'besluttet' ? 1 : card.step === 'pagar' ? 2 : card.step === 'gjennomfort' ? 3 : 4
  const next = model.points.find((p) => p.factors === null || p.factors.includes(card.factorKey))
  const steps = [
    { t: t('board.steps.focus'), m: t('board.steps.focusNote') },
    { t: t('board.steps.owner'), m: card.owner ?? t('board.steps.noOwner') },
    { t: t('board.steps.do'), m: card.due?.text ?? t('board.steps.noDue') },
    { t: t('board.steps.measure'), m: next ? next.label : t('board.steps.noPoint') },
    { t: t('board.steps.close'), m: t('board.steps.closeNote') },
  ]
  const nextStep = card.step
    ? { besluttet: 'pagar', pagar: 'gjennomfort', gjennomfort: 'effekt_malt', effekt_malt: 'lukket', foreslatt: 'besluttet' }[
        card.step
      ]
    : null
  const button = `inline-flex h-[38px] cursor-pointer items-center rounded-ctl border px-[16px] text-[13px] ${focus}`

  return (
    <div className="rounded-note border border-line bg-sf px-[24px] py-[22px]">
      <div className="flex items-start justify-between gap-[14px]">
        <span>
          <span className="flex items-center gap-[8px]">
            <span
              className="rounded-pill px-[10px] py-[3px] text-[11px] font-bold"
              style={{ background: COLUMN_BG[card.column] }}
            >
              {t(`board.col.${card.column}.title`)}
            </span>
            <span className="text-[12px] text-mut">{seg}</span>
          </span>
          <h2 className="mt-[8px] block font-display text-[24px] font-semibold">{tf(`factor.${card.factorKey}.name`)}</h2>
        </span>
        {tone ? (
          <span className="rounded-ctl px-[13px] py-[5px] text-[26px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
            {card.score}
          </span>
        ) : null}
      </div>
      <div className="mt-[14px] grid grid-cols-1 gap-[12px] rounded-cta border border-line bg-bg px-[15px] py-[13px] sm:grid-cols-[1.6fr_1fr_1fr]">
        <span>
          <span className="block text-[11px] text-mut">{t('board.measure')}</span>
          <span className="mt-[2px] block text-[13.5px] font-bold">{card.title ?? t('board.notChosenYet')}</span>
        </span>
        <span>
          <span className="block text-[11px] text-mut">{t('board.owner')}</span>
          <span className="mt-[2px] block text-[13.5px] font-bold">{card.owner ?? t('board.noOwner')}</span>
        </span>
        <span>
          <span className="block text-[11px] text-mut">{t('board.due')}</span>
          <span className="mt-[2px] block text-[13.5px] font-bold" style={{ color: card.due?.late ? '#A33A16' : '#191510' }}>
            {card.due?.text ?? t('board.dueUnset')}
          </span>
        </span>
      </div>

      <div className="mt-[18px] text-[11px] uppercase tracking-[.11em] text-mut">{t('board.suggested')}</div>
      <div className="mt-[8px] flex flex-col gap-[7px]">
        {playbookFor(card.factorKey).map((e) => {
          const mine = card.playbookKey === e.key
          const taken = mine || adopted.has(e.key)
          return (
            <div
              key={e.key}
              className={`flex items-center gap-[11px] rounded-cta border border-line px-[13px] py-[11px] ${mine ? 'bg-sbg' : 'bg-bg'}`}
            >
              <span className="flex-none rounded-pill border border-line bg-sf px-[9px] py-[3px] text-[10.5px] font-bold">
                {tf(`playbook.kind.${e.kind}`)}
              </span>
              <span className="min-w-0 flex-1 text-[13px] font-semibold">{tf(`playbook.${card.factorKey}.m${e.n}.title`)}</span>
              <span className="flex-none text-[11.5px] text-mut max-sm:hidden">
                {tf(`playbook.${card.factorKey}.m${e.n}.time`)}
              </span>
              <button
                type="button"
                disabled={taken || pending}
                aria-pressed={taken}
                onClick={() => onAdopt(e.key, card, card.measureId ? 'foreslatt' : 'besluttet')}
                className={`h-[28px] flex-none cursor-pointer rounded-[8px] border border-ink px-[12px] text-[11.5px] font-bold disabled:cursor-default ${focus} ${
                  taken ? 'bg-ink text-bg' : 'bg-transparent text-ink'
                }`}
              >
                {taken ? t('board.chosen') : t('board.choose')}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-[18px] text-[11px] uppercase tracking-[.11em] text-mut">{t('board.stepsHead')}</div>
      <ol className="mt-[10px] grid grid-cols-5 gap-[8px]">
        {steps.map((s, i) => (
          <li key={i} className="flex flex-col items-start gap-[7px]" aria-current={i === reached ? 'step' : undefined}>
            <span
              className="flex h-[26px] w-[26px] items-center justify-center rounded-pill border-2 border-ink text-[11px] font-bold"
              style={{
                background: i < reached ? '#2F5D2A' : i === reached ? '#F5C64A' : '#FFFDF6',
                color: i < reached ? '#FCF6E9' : '#191510',
              }}
            >
              {i < reached ? '✓' : i + 1}
            </span>
            <span className={`text-[12.5px] leading-[1.3] ${i === reached ? 'font-bold' : 'font-medium'}`}>{s.t}</span>
            <span className="text-[11px] leading-[1.3] text-mut">{s.m}</span>
          </li>
        ))}
      </ol>

      <div className="mt-[18px] flex flex-wrap gap-[8px]">
        {card.measureId && nextStep ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onAdvance(card.measureId!)}
            className={`${button} border-ink bg-ac font-bold text-ink`}
          >
            {card.step === 'foreslatt' ? t('board.chooseFocus') : t('board.moveTo', { step: t(`step.${nextStep}`) })}
          </button>
        ) : null}
        {!card.measureId && card.suggestionKey ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onAdopt(card.suggestionKey!, card, 'besluttet')}
            className={`${button} border-ink bg-ac font-bold text-ink`}
          >
            {t('board.chooseFocus')}
          </button>
        ) : null}
        {card.measureId ? (
          <Link
            href={'/tiltak?fane=liste&status=alle' as Route}
            className={`${button} border-line bg-transparent font-semibold text-ink no-underline hover:text-ink`}
          >
            {t('board.editInList')}
          </Link>
        ) : null}
      </div>
      {problem ? (
        <div role="alert" className="mt-[8px] text-[12px] text-danger">
          {t.has(`problem.${problem}`) ? t(`problem.${problem}`) : t('problem.denied')}
        </div>
      ) : null}
    </div>
  )
}

/** "Slik måler vi effekten": the followed statement, where it stands, the target, and when it is measured next. */
function Effect({ card, model }: { card: BoardCard; model: BoardModel }) {
  const t = useTranslations('tiltak')
  const tf = useTranslations()
  const points = model.points.filter((p) => p.factors === null || p.factors.includes(card.factorKey)).slice(0, 3)
  return (
    <div className="rounded-note border border-line bg-sf px-[24px] py-[22px] text-ink">
      <div className="text-[11px] uppercase tracking-[.11em] text-mut">{t('board.effectHead')}</div>
      {card.statement ? (
        <>
          <div className="mt-[12px] text-[12.5px] text-mut">{t('board.followed')}</div>
          <div className="mt-[4px] font-display text-[19px] font-medium leading-[1.35] [text-wrap:pretty]">
            «{tf(`factor.${card.factorKey}.s${card.statement.ordinal}`)}»
          </div>
        </>
      ) : null}
      <div className="mt-[16px] grid grid-cols-2 gap-[10px]">
        <div className="rounded-cta border border-line bg-bg px-[14px] py-[12px]">
          <div className="text-[11px] text-mut">{t('board.now')}</div>
          <div className="mt-[2px] text-[26px] font-bold">{card.statement?.index ?? '—'}</div>
        </div>
        <div className="rounded-cta border border-ac bg-sbg px-[14px] py-[12px]">
          <div className="text-[11px] text-cautiondeep">{t('board.target')}</div>
          <div className="mt-[2px] text-[26px] font-bold text-ink">{card.target ?? '—'}</div>
        </div>
      </div>
      {card.target === null && card.measureId ? <div className="mt-[8px] text-[12px] text-mut">{t('board.noTarget')}</div> : null}
      {card.column === 'effekt' && card.effectNote ? (
        <div className="mt-[10px] rounded-btn bg-mint px-[13px] py-[11px] text-[13px] font-bold text-greendeep">
          {t('board.effectNote', { note: card.effectNote })}
        </div>
      ) : null}
      <div className="mt-[18px] text-[12.5px] text-mut">{t('board.points')}</div>
      <div className="mt-[8px] flex flex-col gap-[7px]">
        {points.map((p, i) => (
          <div
            key={p.at + p.title}
            className="grid grid-cols-[78px_1fr_auto] items-center gap-[10px] rounded-btn border border-line px-[12px] py-[10px] text-ink"
            style={{ background: i === 0 ? '#FBEBBE' : '#FCF6E9' }}
          >
            <span className="text-[12.5px] font-bold">{p.label}</span>
            <span className="text-[13px] font-semibold">{p.title}</span>
            <span className="text-[11.5px] text-mut">{p.meta}</span>
          </div>
        ))}
        {points.length === 0 ? (
          <div className="rounded-btn border border-dashed border-rule p-[12px] text-center text-[12px] text-mut">
            {t('board.noPoints')}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** The plan for the season (v3 2992-3008): the chosen and running measures from start to deadline. */
function Plan({
  model,
  cards,
  selId,
  onPick,
  seg,
}: {
  model: BoardModel
  cards: BoardCard[]
  selId: string | null
  onPick: (id: string) => void
  seg: (c: BoardCard) => string
}) {
  const t = useTranslations('tiltak')
  const tf = useTranslations()
  const from = new Date(model.window.start).getTime()
  const to = new Date(model.window.end).getTime()
  const pos = (iso: string) => Math.max(0, Math.min(100, ((new Date(iso).getTime() - from) / (to - from)) * 100))
  const rows = cards.filter((c) => (c.column === 'fokus' || c.column === 'pagar') && c.measureId)
  const points = model.points.filter((p) => pos(p.at) > 0 && pos(p.at) < 100)
  const cols = `grid-cols-[minmax(120px,230px)_1fr]`

  return (
    <div className="mt-[14px] rounded-note border border-line bg-sf px-[22px] py-[20px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
        <span className="text-[15px] font-bold">{model.window.title}</span>
        <span className="text-[12px] text-mut">{t('board.planNote')}</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className={`mt-[14px] grid ${cols} text-[11.5px] font-semibold text-mut`}>
            <span />
            <span className="grid" style={{ gridTemplateColumns: `repeat(${model.window.months.length}, 1fr)` }}>
              {model.window.months.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </span>
          </div>
          <div className="mt-[8px] flex flex-col gap-[7px]">
            {rows.map((c) => {
              const left = c.start ? pos(c.start) : 0
              const right = c.dueDate ? pos(`${c.dueDate}T12:00:00Z`) : 100
              const tone = heatTone(c.score ?? 50)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPick(c.id)}
                  aria-pressed={selId === c.id}
                  className={`grid ${cols} cursor-pointer items-center border-none bg-transparent p-0 text-left leading-[normal] text-ink ${focus}`}
                >
                  <span className="text-[13px] font-semibold">
                    {tf(`factor.${c.factorKey}.name`)}
                    <span className="block text-[11px] font-medium text-mut">
                      {seg(c)} · {c.owner ?? t('board.noOwner')}
                    </span>
                  </span>
                  <span
                    className="relative h-[32px] rounded-[8px]"
                    style={{
                      background: `repeating-linear-gradient(90deg,transparent 0,transparent calc(${100 / model.window.months.length}% - 1px),#E8DFC9 calc(${100 / model.window.months.length}% - 1px),#E8DFC9 ${100 / model.window.months.length}%)`,
                    }}
                  >
                    <span
                      title={c.title ?? undefined}
                      className="absolute bottom-[4px] top-[4px] flex items-center overflow-hidden whitespace-nowrap rounded-[7px] border-2 px-[10px] text-[11.5px] font-bold"
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(4, right - left)}%`,
                        borderColor: selId === c.id ? '#191510' : 'transparent',
                        background: tone.bg,
                        opacity: c.column === 'fokus' ? 0.65 : 1,
                      }}
                    >
                      {c.title}
                    </span>
                  </span>
                </button>
              )
            })}
            {rows.length === 0 ? (
              <div className="rounded-cta border border-dashed border-rule p-[14px] text-center text-[12.5px] text-mut">
                {t('board.planEmpty')}
              </div>
            ) : null}
            <div className={`grid ${cols} items-center`}>
              <span className="text-[12px] text-mut">{t('board.points')}</span>
              <span className="relative h-[22px]">
                {points.map((p) => (
                  <span
                    key={p.at + p.title}
                    className="absolute top-0 whitespace-nowrap rounded-pill bg-ink px-[9px] py-[3px] text-[10.5px] font-bold text-bg"
                    style={{ left: `${pos(p.at)}%` }}
                  >
                    {t('board.pointPill', { title: p.title, date: p.label })}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
