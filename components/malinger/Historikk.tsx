'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { heatTone } from '@/lib/results/tone'

/**
 * Målinger › Historikk (v3 1218-1275): every closed round, filtered by type and year and
 * sorted four ways, with its response rate, its index and the change from the round of
 * its kind before. The filters are presentation over rows the page already holds.
 */
export interface HistoryRow {
  id: string
  kind: 'grunnlinje' | 'puls'
  year: number
  title: string
  closesAt: string
  meta: string
  answered: number | null
  headcount: number | null
  pct: number | null
  index: number | null
  delta: string | null
  deltaValue: number
  /** the latest grunnlinje, for "Sammenlign med …" on an older one */
  compareWith: { id: string; year: number } | null
  latest: boolean
}

type Kind = 'alle' | 'grunnlinje' | 'puls'
type Sort = 'nyest' | 'eldst' | 'svar' | 'indeks'
const COLS = 'grid-cols-[minmax(0,2fr)_110px_minmax(0,1.3fr)_110px_250px]'
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function Historikk({ rows }: { rows: HistoryRow[]; latestYear: number | null }) {
  const t = useTranslations('malinger')
  const [kind, setKind] = useState<Kind>('alle')
  const [year, setYear] = useState<number | 'alle'>('alle')
  const [sort, setSort] = useState<Sort>('nyest')

  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a)
  const shown = rows
    .filter((r) => (kind === 'alle' || r.kind === kind) && (year === 'alle' || r.year === year))
    .sort((a, b) =>
      sort === 'eldst'
        ? a.closesAt.localeCompare(b.closesAt)
        : sort === 'svar'
          ? (b.pct ?? -1) - (a.pct ?? -1)
          : sort === 'indeks'
            ? (a.index ?? 999) - (b.index ?? 999)
            : b.closesAt.localeCompare(a.closesAt),
    )

  const chip = (on: boolean) =>
    `cursor-pointer rounded-pill border px-[13px] py-[6px] text-[12.5px] font-bold leading-[normal] ${focus} ${
      on ? 'border-ink bg-ink text-bg' : 'border-line bg-sf text-ink'
    }`

  return (
    <>
      <div className="mt-[20px] flex flex-wrap items-center gap-x-[22px] gap-y-[10px]">
        <span className="flex flex-wrap items-center gap-[6px]">
          <span className="mr-[2px] text-[11px] uppercase tracking-[.09em] text-mut">{t('hist.type')}</span>
          {(['alle', 'grunnlinje', 'puls'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
              {t(`hist.kind.${k}`)}
            </button>
          ))}
        </span>
        <span className="flex flex-wrap items-center gap-[6px]">
          <span className="mr-[2px] text-[11px] uppercase tracking-[.09em] text-mut">{t('hist.year')}</span>
          {(['alle', ...years] as const).map((y) => (
            <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(y)} className={chip(year === y)}>
              {y === 'alle' ? t('hist.all') : y}
            </button>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-[8px]">
          <span className="text-[11px] uppercase tracking-[.09em] text-mut">{t('hist.sort')}</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label={t('hist.sortAria')}
            className="h-[34px] rounded-ctl border border-line bg-sf px-[11px] text-[12.5px] font-semibold text-ink focus-visible:border-ink"
          >
            {(['nyest', 'eldst', 'svar', 'indeks'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`hist.sorts.${s}`)}
              </option>
            ))}
          </select>
        </span>
      </div>

      <div className="mt-[14px] overflow-x-auto rounded-note border border-line bg-sf">
        <div className="min-w-[760px]">
          <div
            className={`grid ${COLS} gap-[16px] border-b border-line px-[20px] py-[12px] text-[10.5px] uppercase tracking-[.09em] text-mut`}
          >
            <span>{t('table.round', { count: shown.length })}</span>
            <span>{t('table.type')}</span>
            <span>{t('table.answers')}</span>
            <span className="text-right">{t('table.index')}</span>
            <span />
          </div>
          {shown.map((h) => {
            const tone = h.index !== null ? heatTone(h.index) : null
            return (
              <div
                key={h.id}
                className={`grid ${COLS} items-center gap-[16px] border-b border-track px-[20px] py-[14px] last:border-b-0`}
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{h.title}</span>
                  <span className="mt-[2px] block text-[12px] text-mut">{h.meta}</span>
                </span>
                <span>
                  <span
                    className={`inline-block rounded-pill px-[11px] py-[4px] text-[11.5px] font-bold ${h.kind === 'puls' ? 'bg-pulse' : 'bg-track'}`}
                  >
                    {t(`kind.${h.kind}`)}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] text-mut">
                    {h.answered !== null ? t('rateLabel', { answered: h.answered, total: h.headcount ?? 0 }) : ''}
                  </span>
                  <span className="mt-[5px] flex items-center gap-[9px]">
                    <span className="h-[6px] flex-1 overflow-hidden rounded-pill bg-[rgba(25,21,16,.08)]">
                      <span className="block h-full rounded-pill bg-greenbar" style={{ width: `${h.pct ?? 0}%` }} />
                    </span>
                    <span className="flex-none text-[12.5px] font-bold">
                      {h.pct !== null ? t('percent', { pct: h.pct }) : '—'}
                    </span>
                  </span>
                </span>
                <span className="flex flex-col items-end gap-[2px]">
                  {tone ? (
                    <span
                      className="rounded-[8px] px-[11px] py-[3px] text-[16px] font-bold"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {h.index}
                    </span>
                  ) : (
                    <span className="text-[16px] font-bold text-faint">—</span>
                  )}
                  {h.delta ? (
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: h.deltaValue < 0 ? '#A33A16' : h.deltaValue > 0 ? '#2F5D2A' : '#5F5849' }}
                    >
                      {h.delta}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-wrap justify-end gap-[8px]">
                  {h.compareWith ? (
                    <Link
                      href={`/resultater?maling=${h.compareWith.id}&mot=${h.id}` as Route}
                      className={`inline-flex h-[34px] items-center whitespace-nowrap rounded-ctl border border-line bg-transparent px-[13px] text-[12px] font-semibold text-ink ${focus}`}
                    >
                      {t('compareWith', { year: h.compareWith.year })}
                    </Link>
                  ) : null}
                  <Link
                    href={`/resultater?maling=${h.id}` as Route}
                    className={`inline-flex h-[34px] items-center whitespace-nowrap rounded-ctl border border-ink px-[14px] text-[12px] font-bold text-ink ${focus} ${
                      h.latest ? 'bg-ac' : 'bg-transparent'
                    }`}
                  >
                    {t('viewResult')}
                  </Link>
                </span>
              </div>
            )
          })}
          {shown.length === 0 ? <div className="p-[22px] text-center text-[13px] text-mut">{t('hist.empty')}</div> : null}
        </div>
      </div>
    </>
  )
}
