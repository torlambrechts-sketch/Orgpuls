'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { changeWheelMonth, type MonthProblem } from '@/app/(app)/malinger/actions'

/**
 * The year rail (v3 883-941): twelve months of one year, each showing what was measured
 * then or what the wheel has planned, and a detail line for the month pressed.
 *
 * A month is a button: it only chooses which detail to read, so nothing is fetched. The
 * year is a link, because it is a different set of rounds. The detail's actions: "Se
 * resultatet", "Sammenlign med …" and "Se oppsett", and for a daglig leder on a month still
 * ahead the design's month changes (v3 6125-6131, 0133): "Hopp over denne" on the wheel's
 * planned puls, "Fjern pulsen" on one added by hand, "＋ Legg til puls i …" on an empty month
 * and "Ta pulsen tilbake" on a skipped one. A skip is a record the wheel reads, so the month
 * stays as it was left.
 */
export type RailAction = 'skip' | 'remove' | 'add' | 'restore'

export interface RailCell {
  month: number
  short: string
  /** the month's name as "＋ Legg til puls i desember" says it */
  long: string
  isNow: boolean
  state: 'done' | 'open' | 'planned' | 'empty'
  kind: 'grunnlinje' | 'puls' | 'forankring' | null
  sub: string
  title: string
  text: string
  roundId: string | null
  compareWith: { id: string; year: number } | null
  /** what the viewer may change in this month: null for a month gone by, or a role that may not */
  action: RailAction | null
}

const TO_RPC = { skip: 'hopp_over', remove: 'hopp_over', add: 'legg_til', restore: 'ta_tilbake' } as const

export interface RailView {
  year: number
  years: number[]
  cells: RailCell[]
  selected: number
  count: string
  next: string | null
}

const DOT = {
  grunnlinje: { fill: '#F5C64A', done: '#191510', planned: '#C49A1A' },
  puls: { fill: '#A8D5D2', done: '#2F5D2A', planned: '#6FA8A3' },
} as const

export function YearRail({ view }: { view: RailView }) {
  const t = useTranslations('malinger')
  const pathname = usePathname()
  const search = useSearchParams()
  const [selected, setSelected] = useState(view.selected)
  const [problem, setProblem] = useState<MonthProblem | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => setSelected(view.selected), [view.selected, view.year])
  useEffect(() => setProblem(null), [selected, view.year])
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('maned', String(selected))
    window.history.replaceState(null, '', url)
  }, [selected])

  const hrefWith = (over: Record<string, string | null>) => {
    const q = new URLSearchParams(search.toString())
    for (const [k, v] of Object.entries(over)) v === null ? q.delete(k) : q.set(k, v)
    const s = q.toString()
    return `${pathname}${s ? `?${s}` : ''}` as Route
  }

  const cell = view.cells.find((c) => c.month === selected) ?? view.cells[0]!
  // the answer is the database's (0133); a refusal is said in the words of its guard
  const change = (action: RailAction) =>
    start(async () => {
      setProblem(null)
      const r = await changeWheelMonth(view.year, cell.month, TO_RPC[action])
      if (!r.ok) setProblem(r.problem)
    })
  const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

  return (
    <section className="mt-[22px] rounded-panel border border-line bg-sf px-[24px] py-[20px]" aria-label={t('rail.aria')}>
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <span className="flex flex-wrap items-center gap-x-[14px] gap-y-[10px]">
          <span className="text-[11px] uppercase tracking-[.11em] text-mut">{t('rail.head')}</span>
          <span className="flex gap-[5px]">
            {view.years.map((y) => (
              <Link
                key={y}
                href={hrefWith({ ar: String(y), maned: null })}
                aria-current={y === view.year ? 'true' : undefined}
                className={`rounded-pill border px-[12px] py-[5px] text-[12px] font-bold leading-[normal] ${focus} ${
                  y === view.year ? 'border-ink bg-ink text-bg' : 'border-line bg-sf text-ink'
                }`}
              >
                {y}
              </Link>
            ))}
          </span>
          <span className="text-[12.5px] text-mut">{view.count}</span>
        </span>
        <span className="flex items-center gap-[12px]">
          {view.next ? (
            <span className="text-[12.5px] text-mut">
              {t('rail.next')} <strong className="text-ink">{view.next}</strong>
            </span>
          ) : null}
          <Link
            href={'/malinger?fane=arshjul' as Route}
            className={`inline-flex h-[30px] flex-none items-center rounded-bar border border-line bg-transparent px-[13px] text-[12px] font-semibold text-ink ${focus}`}
          >
            {t('rail.change')}
          </Link>
        </span>
      </div>

      <div className="mt-[14px] overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-[repeat(12,minmax(58px,1fr))] gap-[6px]">
          {view.cells.map((c) => {
            const on = c.month === selected
            const k = c.kind === 'grunnlinje' || c.kind === 'puls' ? DOT[c.kind] : null
            const dot =
              c.state === 'done' && k
                ? { background: k.fill, border: `2px solid ${k.done}` }
                : c.state === 'open' && k
                  ? { background: k.fill, border: `2px solid ${k.planned}` }
                  : c.state === 'planned' && k
                    ? { background: '#FFFDF6', border: `2px dashed ${k.planned}` }
                    : { background: '#FFFDF6', border: '2px solid #E8DFC9' }
            return (
              <button
                key={c.month}
                type="button"
                aria-pressed={on}
                onClick={() => setSelected(c.month)}
                className={`flex min-w-0 cursor-pointer flex-col items-center gap-[5px] rounded-cta px-[4px] pb-[9px] pt-[10px] leading-[normal] text-ink ${focus}`}
                style={{
                  background: on ? '#FBEBBE' : c.isNow ? '#FCF6E9' : 'transparent',
                  border: on ? '2px solid #191510' : `1px solid ${c.isNow ? '#C4BCA8' : '#E8DFC9'}`,
                }}
              >
                <span
                  className={`text-[11px] tracking-[.04em] ${c.isNow ? 'font-extrabold text-ink' : 'font-semibold text-mut'}`}
                >
                  {c.short}
                </span>
                <span
                  className="box-border flex h-[26px] w-[26px] items-center justify-center rounded-pill text-[12px] font-bold"
                  style={dot}
                  aria-hidden
                >
                  {c.state === 'done' ? '✓' : ''}
                </span>
                <span className="min-h-[13px] whitespace-nowrap text-[10.5px] font-bold leading-[1.2]">
                  {c.kind ? t(`rail.kind.${c.kind}`) : ''}
                </span>
                <span className="min-h-[12px] whitespace-nowrap text-[10px] leading-[1.2] text-mut">{c.sub}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-[12px] flex flex-wrap items-center justify-between gap-x-[18px] gap-y-[12px] rounded-cta border border-line bg-bg px-[16px] py-[13px]">
        <span className="min-w-0">
          <span className="block text-[14px] font-bold">{cell.title}</span>
          <span className="mt-[2px] block text-[12.5px] text-mut [text-wrap:pretty]">{cell.text}</span>
          {problem ? (
            <span role="alert" className="mt-[4px] block text-[12px] leading-[1.45] text-danger [text-wrap:pretty]">
              {t(`rail.problem.${problem}`)}
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap gap-[8px]">
          {cell.action === 'skip' || cell.action === 'remove' ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => change(cell.action!)}
              className={`inline-flex h-[34px] cursor-pointer items-center rounded-ctl border border-line bg-transparent px-[13px] text-[12px] font-semibold text-danger disabled:cursor-default ${focus}`}
            >
              {t(cell.action === 'skip' ? 'rail.skip' : 'rail.remove')}
            </button>
          ) : null}
          {cell.compareWith ? (
            <Link
              href={`/resultater?maling=${cell.compareWith.id}&mot=${cell.roundId}` as Route}
              className={`inline-flex h-[34px] items-center rounded-ctl border border-line bg-transparent px-[13px] text-[12px] font-semibold text-ink ${focus}`}
            >
              {t('compareWith', { year: cell.compareWith.year })}
            </Link>
          ) : null}
          {cell.roundId && cell.state === 'done' ? (
            <Link
              href={`/resultater?maling=${cell.roundId}` as Route}
              className={`inline-flex h-[34px] items-center rounded-ctl border border-ink bg-ac px-[14px] text-[12px] font-bold text-ink ${focus}`}
            >
              {t('viewResult')}
            </Link>
          ) : null}
          {cell.roundId && cell.state !== 'done' ? (
            <Link
              href={`/maleoppsett?runde=${cell.roundId}` as Route}
              className={`inline-flex h-[34px] items-center rounded-ctl border border-ink bg-ac px-[14px] text-[12px] font-bold text-ink ${focus}`}
            >
              {t('seeSetup')}
            </Link>
          ) : null}
          {cell.action === 'add' || cell.action === 'restore' ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => change(cell.action!)}
              className={`inline-flex h-[34px] cursor-pointer items-center rounded-ctl border border-ink bg-ac px-[14px] text-[12px] font-bold text-ink disabled:cursor-default ${focus}`}
            >
              {cell.action === 'add' ? t('rail.add', { month: cell.long }) : t('rail.restore')}
            </button>
          ) : null}
        </span>
      </div>

      <div className="mt-[12px] flex flex-wrap items-center gap-x-[16px] gap-y-[8px] text-[11.5px] text-mut">
        <span className="flex items-center gap-[6px]">
          <span className="h-[12px] w-[12px] rounded-pill border-[1.5px] border-ink bg-ac" />
          {t('rail.kind.grunnlinje')}
        </span>
        <span className="flex items-center gap-[6px]">
          <span className="h-[12px] w-[12px] rounded-pill border-[1.5px] border-link bg-teal" />
          {t('rail.kind.puls')}
        </span>
        <span className="flex items-center gap-[6px]">
          <span
            className="h-[12px] w-[12px] rounded-pill border-[1.5px] border-dashed bg-sf"
            style={{ borderColor: '#6FA8A3' }}
          />
          {t('state.planlagt')}
        </span>
        <span>{t('rail.legend')}</span>
      </div>
    </section>
  )
}
