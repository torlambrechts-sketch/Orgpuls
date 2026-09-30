import { getTranslations } from 'next-intl/server'
import { Panel, VIZ } from '@/components/admin/Analytics'
import { TicketTabs } from '@/components/admin/TicketTabs'
import { day, PageHead, Problem, Segments } from '@/components/admin/ui'
import { isError, REPORT_WEEKS, TICKET_QUEUES, TICKET_TYPES, ticketReport } from '@/lib/admin/api'
import { hoursLabel, metShare, ratingLabel, weekLabel } from '@/lib/admin/ticketReport'

/**
 * Tickets › Reports (0135): over the tickets opened in the last 4, 12, 26 or 52 weeks — how many
 * came, by week, queue and type; the share of first replies and resolutions within their deadline
 * and the median times; the ratings customers gave. Every figure is counted by
 * admin_ticket_report over the real rows; where nothing was due or rated the page says so.
 */
export default async function TicketReports({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const sp = await searchParams
  const weeks = REPORT_WEEKS.find((w) => String(w) === sp.w) ?? 12
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const r = (key: string, v?: Record<string, string | number>) => t(`tickets.report.${key}`, v)
  const d = await ticketReport(weeks)
  if (isError(d)) return <Problem text={d.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  const first = metShare(d.first_reply)
  const resolved = metShare(d.resolution)
  const avg = ratingLabel(d.csat.average)
  const tiles = [
    { key: 'opened', value: String(d.total), sub: r('openedSub', { weeks }) },
    {
      key: 'firstReply',
      value: first === null ? '—' : `${first} %`,
      sub: first === null ? r('noneDue') : r('metOf', { met: d.first_reply.met, due: d.first_reply.met + d.first_reply.missed, pending: d.first_reply.pending }),
    },
    {
      key: 'resolution',
      value: resolved === null ? '—' : `${resolved} %`,
      sub: resolved === null ? r('noneDue') : r('metOf', { met: d.resolution.met, due: d.resolution.met + d.resolution.missed, pending: d.resolution.pending }),
    },
    { key: 'medianFirst', value: hoursLabel(d.first_reply.median_hours) ?? '—', sub: d.first_reply.median_hours === null ? r('noneAnswered') : r('calendar') },
    { key: 'medianResolve', value: hoursLabel(d.resolution.median_hours) ?? '—', sub: d.resolution.median_hours === null ? r('noneResolved') : r('calendar') },
    { key: 'csat', value: avg ?? '—', sub: avg === null ? r('noRatings', { sent: d.csat.sent }) : r('ratings', { count: d.csat.rated, sent: d.csat.sent }) },
  ]
  const max = Math.max(1, ...d.weekly.map((w) => w.n))
  const labelled = d.weekly.length <= 16
  const maxDist = Math.max(1, ...[1, 2, 3, 4, 5].map((n) => d.csat.dist[String(n)] ?? 0))
  const split = (title: string, keys: readonly string[], counts: Record<string, number>, ns: string) => (
    <Panel title={title}>
      <ul className="m-0 mt-[14px] flex list-none flex-col gap-[10px] p-0">
        {keys.map((k, i) => {
          const n = counts[k] ?? 0
          const p = d.total ? Math.round((100 * n) / d.total) : 0
          return (
            <li key={k} className="flex items-center gap-[10px]">
              <span className="w-[130px] flex-none text-[13px] font-semibold">{t(`tickets.${ns}.${k}`)}</span>
              <span className="block h-[8px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]">
                <span className={`block h-full rounded-pill ${VIZ[i % VIZ.length]}`} style={{ width: `${p}%` }} />
              </span>
              <span className="min-w-[64px] whitespace-nowrap text-right text-[12.5px]">
                <b>{n}</b> <span className="text-mut">{p} %</span>
              </span>
            </li>
          )
        })}
      </ul>
    </Panel>
  )

  return (
    <>
      <PageHead title={t('tickets.title')} lead={r('lead', { since: day(d.since), weeks })}>
        <Segments label={r('window')} items={REPORT_WEEKS.map((w) => ({ key: String(w), label: r('weeks', { count: w }), href: `/admin/tickets/reports?w=${w}`, on: w === weeks }))} />
      </PageHead>
      <TicketTabs on="reports" unseen={d.mentions_unseen} />

      <div className="grid gap-[16px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {tiles.map((k) => (
          <div key={k.key} className="rounded-panel border border-line bg-sf px-[22px] py-[20px]">
            <div className="text-[11px] uppercase tracking-[0.09em] text-mut">{r(`kpi.${k.key}`)}</div>
            <div className="mt-[8px] text-[30px] font-bold leading-[1.15]">{k.value}</div>
            <div className="mt-[4px] text-[12.5px] text-mut">{k.sub}</div>
          </div>
        ))}
      </div>

      {d.total === 0 ? (
        <Panel className="mt-[18px]" title={r('volume')}>
          <p className="mb-0 mt-[14px] text-[13px] leading-[1.5] text-mut">{r('empty', { weeks })}</p>
        </Panel>
      ) : (
        <>
          <Panel className="mt-[18px]" title={r('volume')} aside={r('perWeek')}>
            <div role="img" aria-label={r('volumeLabel', { weeks, total: d.total })}>
              <div className="mt-[20px] flex h-[180px] items-end gap-[6px] border-b border-line pb-[8px] max-md:gap-[3px]">
                {d.weekly.map((w) => (
                  <div key={w.week} title={r('bar', { week: weekLabel(w.week), n: w.n })} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[6px]">
                    {labelled ? <span className="text-[10.5px] text-mut max-md:hidden">{w.n}</span> : null}
                    <span className="block min-h-[3px] w-full rounded-[6px_6px_2px_2px] bg-ac" style={{ height: `${Math.round((100 * w.n) / max)}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-[6px] flex gap-[6px] max-md:gap-[3px]">
                {d.weekly.map((w, i) => (
                  <span key={w.week} className="min-w-0 flex-1 text-center text-[10.5px] text-mut">
                    {labelled || i % Math.ceil(d.weekly.length / 13) === 0 ? weekLabel(w.week) : ''}
                  </span>
                ))}
              </div>
            </div>
          </Panel>
          <div className="mt-[18px] grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
            {split(r('byQueue'), TICKET_QUEUES, d.by_queue, 'queues')}
            {split(r('byType'), TICKET_TYPES, d.by_type, 'types')}
          </div>
        </>
      )}

      <Panel className="mt-[18px]" title={r('csatTitle')} aside={avg === null ? undefined : r('ratings', { count: d.csat.rated, sent: d.csat.sent })}>
        {d.csat.rated > 0 ? (
          <ul className="m-0 mt-[14px] flex list-none flex-col gap-[10px] p-0">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = d.csat.dist[String(n)] ?? 0
              return (
                <li key={n} className="flex items-center gap-[10px]">
                  <span className="w-[130px] flex-none text-[13px] font-semibold">{r(`score.${n}`)}</span>
                  <span className="block h-[8px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]">
                    <span className="block h-full rounded-pill bg-ac" style={{ width: `${Math.round((100 * c) / maxDist)}%` }} />
                  </span>
                  <span className="min-w-[64px] whitespace-nowrap text-right text-[12.5px]">
                    <b>{c}</b>
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mb-0 mt-[14px] text-[13px] leading-[1.5] text-mut">{r('csatEmpty')}</p>
        )}
      </Panel>
      <p className="mb-0 mt-[16px] text-[12px] text-mut md:px-[18px]">{r('note')}</p>
    </>
  )
}
