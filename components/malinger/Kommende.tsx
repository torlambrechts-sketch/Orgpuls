import Link from 'next/link'
import type { Route } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { StartPulse } from './StartPulse'
import { rateColour } from '@/lib/participation/read'
import type { RoundListItem } from '@/lib/rounds/read'

/**
 * Målinger › Kommende (v3 1133-1216): every round not closed yet, in the order it goes
 * out, then the latest result's line and the Deltakelse card with "Start neste puls nå".
 */
export interface UpcomingRow {
  id: string
  kind: 'grunnlinje' | 'puls'
  title: string
  meta: string
  state: 'apen' | 'neste' | 'planlagt'
  answered: number | null
  headcount: number | null
  pct: number | null
  /** where it sits on the rail, for "Vis i årshjulet" */
  at: { y: number; m: number } | null
}

const STATE = {
  apen: { background: '#FBEBBE', color: '#5C4600' },
  neste: { background: '#FBEBBE', color: '#5C4600' },
  planlagt: { background: 'rgba(25,21,16,.05)', color: '#5F5849' },
} as const

const COLS = 'grid-cols-[minmax(0,2fr)_110px_minmax(0,1.3fr)_110px_250px]'
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export async function Kommende({
  rows,
  latest,
  latestTitle,
  canStart,
  roundOpen,
}: {
  rows: UpcomingRow[]
  latest: RoundListItem | null
  latestTitle: string | null
  canStart: boolean
  roundOpen: boolean
}) {
  const t = await getTranslations('malinger')
  const locale = await getLocale()
  const date = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', day: 'numeric', month: 'long' }).format(new Date(iso)) : ''
  const part = latest?.participation ?? null

  return (
    <>
      <div className="mt-[20px] overflow-x-auto rounded-note border border-line bg-sf">
        <div className="min-w-[760px]">
          <div
            className={`grid ${COLS} gap-[16px] border-b border-line px-[20px] py-[12px] text-[10.5px] uppercase tracking-[.09em] text-mut`}
          >
            <span>{t('table.round', { count: rows.length })}</span>
            <span>{t('table.type')}</span>
            <span>{t('table.answers')}</span>
            <span className="text-right">{t('table.status')}</span>
            <span />
          </div>
          {rows.map((h) => {
            const first = h.state === 'neste'
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
                  <TypePill kind={h.kind} label={t(`kind.${h.kind}`)} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] text-mut">
                    {h.answered !== null ? t('rateLabel', { answered: h.answered, total: h.headcount ?? 0 }) : t('notSent')}
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
                <span className="flex justify-end">
                  <span className="rounded-pill px-[11px] py-[4px] text-[11.5px] font-bold" style={STATE[h.state]}>
                    {t(`state.${h.state}`)}
                  </span>
                </span>
                <span className="flex flex-wrap justify-end gap-[8px]">
                  {h.at ? (
                    <Link
                      href={`/malinger?ar=${h.at.y}&maned=${h.at.m}` as Route}
                      className={`inline-flex h-[34px] items-center whitespace-nowrap rounded-ctl border border-line bg-transparent px-[13px] text-[12px] font-semibold text-ink ${focus}`}
                    >
                      {t('showInWheel')}
                    </Link>
                  ) : null}
                  <Link
                    href={`/maleoppsett?runde=${h.id}` as Route}
                    className={`inline-flex h-[34px] items-center whitespace-nowrap rounded-ctl border border-ink px-[14px] text-[12px] font-bold text-ink ${focus} ${
                      first ? 'bg-ac' : 'bg-transparent'
                    }`}
                  >
                    {first && h.kind === 'puls' ? t('definePulse') : t('seeSetup')}
                  </Link>
                </span>
              </div>
            )
          })}
          {rows.length === 0 ? <div className="p-[22px] text-center text-[13px] text-mut">{t('noneUpcoming')}</div> : null}
        </div>
      </div>

      {latest && latestTitle ? (
        <div className="mt-[14px] flex flex-wrap items-center justify-between gap-[12px]">
          <span className="text-[13px] text-mut">
            {t('latestLine', {
              title: latestTitle,
              date: date(latest.closesAt),
              answered: part?.answered ?? 0,
              total: part?.headcount ?? 0,
            })}
          </span>
          <Link
            href={'/malinger?fane=historikk' as Route}
            className={`text-[13px] font-bold text-link hover:text-linkhover ${focus}`}
          >
            {t('seeHistory')}
          </Link>
        </div>
      ) : null}

      {latest && latestTitle ? (
        <section className="mt-[20px] rounded-panel border border-line bg-sf px-[26px] py-[24px]">
          <div className="flex flex-wrap items-start justify-between gap-[18px]">
            <span className="min-w-0">
              <h2 className="m-0 font-display text-[21px] font-semibold">{t('deltakelse')}</h2>
              <span className="mt-[4px] block text-[13px] text-mut">
                {t('cardRoundTitle', { title: latestTitle })}
                {' · '}
                {t('cardRoundSub', { date: date(latest.closesAt) })}
              </span>
            </span>
            {part ? (
              <span className="flex-none text-right">
                <span className="block font-display text-[32px] font-semibold leading-none">
                  {t('percent', { pct: part.pct })}
                </span>
                <span className="mt-[2px] block text-[12px] text-mut">
                  {t('rateLine', { answered: part.answered, total: part.headcount })}
                </span>
              </span>
            ) : null}
          </div>

          {part ? (
            <div className="mt-[18px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))]">
              {[...part.groups]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((g) => (
                  <div key={g.group_name} className="rounded-tile border border-line bg-bg px-[16px] py-[14px]">
                    <div className="flex items-baseline justify-between gap-[10px]">
                      <span className="text-[13.5px] font-semibold">{g.group_name}</span>
                      <span className="text-[13px] font-bold">{t('percent', { pct: g.pct })}</span>
                    </div>
                    <span className="mt-[9px] block h-[7px] overflow-hidden rounded-pill bg-[rgba(25,21,16,.08)]">
                      <span className="block h-full rounded-pill" style={{ width: `${g.pct}%`, background: rateColour(g.pct) }} />
                    </span>
                    <div className="mt-[6px] text-[11.5px] text-mut">
                      {t('groupLine', { answered: g.answered, total: g.headcount })}
                    </div>
                    {g.thin ? (
                      <div className="mt-[4px] text-[11px] leading-[1.4] text-caution [text-wrap:pretty]">{t('thinNote')}</div>
                    ) : null}
                  </div>
                ))}
            </div>
          ) : null}

          <div className="mt-[18px] flex flex-wrap items-start justify-between gap-[18px] border-t border-line pt-[16px]">
            <span className="min-w-[min(280px,100%)] max-w-[600px] flex-1">
              <span className="block text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{t('privacy')}</span>
              <span className="mt-[8px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                {t('reminderClosed')}
              </span>
            </span>
            {canStart ? <StartPulse roundOpen={roundOpen} /> : null}
          </div>
        </section>
      ) : null}
    </>
  )
}

export function TypePill({ kind, label }: { kind: 'grunnlinje' | 'puls'; label: string }) {
  return (
    <span
      className={`inline-block rounded-pill px-[11px] py-[4px] text-[11.5px] font-bold ${kind === 'puls' ? 'bg-pulse' : 'bg-track'}`}
    >
      {label}
    </span>
  )
}
