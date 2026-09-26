import { getTranslations } from 'next-intl/server'
import { Card, nok, PageHead, pct, Problem, Stat, Table, Td } from '@/components/admin/ui'
import { funnel, isError, kpis, trends, type Trends } from '@/lib/admin/api'

/**
 * The dashboard (D-90): the business in six numbers, then the question the specification puts
 * first — are trials turning into organisations that run surveys and act on them? — as an
 * activation funnel per signup month.
 */
export default async function AdminDashboard() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const [k, f, tr] = await Promise.all([kpis(), funnel(12), trends(26)])
  const problem = (e: { error: string }) => (e.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed'))

  return (
    <>
      <PageHead title={t('dashboard.title')} lead={t('dashboard.lead')} />
      {isError(k) ? (
        <Problem text={problem(k)} />
      ) : (
        <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          <Stat label={t('dashboard.mrr')} value={nok(k.mrr)} hint={t('dashboard.arr', { value: nok(k.arr) })} />
          <Stat label={t('dashboard.paying')} value={k.paying} hint={t('dashboard.offers', { count: k.offers_requested })} />
          <Stat
            label={t('dashboard.trials')}
            value={k.trials_active}
            hint={t('dashboard.expiring', { count: k.trials_expiring_7d })}
          />
          <Stat label={t('dashboard.expired')} value={k.trials_expired} />
          <Stat
            label={t('dashboard.conversion')}
            value={k.conversion === null ? '—' : `${k.conversion} %`}
            hint={t('dashboard.conversionHint')}
          />
        </div>
      )}

      {isError(tr) ? <Problem text={problem(tr)} /> : <TrendCards data={tr} t={t} />}

      <Card title={t('dashboard.funnel')} className="mt-[16px]">
        <p className="mb-[10px] mt-0 text-[12.5px] text-mut">{t('dashboard.funnelNote')}</p>
        {isError(f) ? (
          <Problem text={problem(f)} />
        ) : (
          <Table
            head={[
              t('dashboard.cohort'),
              t('dashboard.created'),
              t('dashboard.employees'),
              t('dashboard.scheduled'),
              t('dashboard.sent'),
              t('dashboard.unlocked'),
              t('dashboard.viewed'),
              t('dashboard.measure'),
              t('dashboard.converted'),
              t('dashboard.median'),
            ]}
            empty={f.rows.length ? undefined : t('common.none')}
          >
            {f.rows.map((c) => (
              <tr key={c.cohort}>
                <Td className="font-semibold">{c.cohort}</Td>
                <Td>{c.created}</Td>
                {[
                  c.employees_uploaded,
                  c.survey_scheduled,
                  c.survey_sent,
                  c.result_unlocked,
                  c.results_viewed,
                  c.measure_created,
                  c.converted,
                ].map((n, i) => (
                  <Td key={i}>
                    {n} <span className="text-mut">· {pct(n, c.created)}</span>
                  </Td>
                ))}
                <Td>
                  {c.median_hours_to_first_send === null ? '—' : t('dashboard.hours', { value: c.median_hours_to_first_send })}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  )
}

const SIGNUPS = '#E0A21F'
const CUSTOMERS = '#5C9A55'
const weekLabel = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso))

/**
 * The business over time (0062, D-107). Weekly signups and new customers, and weekly
 * visitors, come from tables that keep their history. MRR and paying come from the daily
 * snapshots, which began on 26 September 2026 and are never backfilled: until there is a
 * week of them, the card says so instead of drawing a line from one point.
 */
function TrendCards({ data, t }: { data: Trends; t: (k: string, v?: Record<string, string | number>) => string }) {
  const w = data.weekly
  const maxCount = Math.max(1, ...w.map((x) => Math.max(x.signups, x.converted)))
  const maxVisitors = Math.max(1, ...w.map((x) => x.visitors))
  const first = data.daily[0]
  const last = data.daily.at(-1)
  return (
    <div className="mt-[16px] grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card title={t('dashboard.trends.weekly')}>
        <div className="mb-[8px] flex flex-wrap gap-[14px] text-[12px] text-body" aria-hidden="true">
          <span className="inline-flex items-center gap-[6px]">
            <span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: SIGNUPS }} />
            {t('dashboard.trends.signups')}
          </span>
          <span className="inline-flex items-center gap-[6px]">
            <span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: CUSTOMERS }} />
            {t('dashboard.trends.customers')}
          </span>
        </div>
        <div className="flex h-[120px] items-end gap-[4px] border-b border-line" role="img" aria-label={t('dashboard.trends.weeklyLabel')}>
          {w.map((x) => (
            <span key={x.week} className="flex h-full min-w-[6px] flex-1 items-end gap-[2px]" title={`${weekLabel(x.week)}: ${x.signups} · ${x.converted}`}>
              <span className="block flex-1 rounded-t-[4px]" style={{ height: `${x.signups ? Math.max(3, (100 * x.signups) / maxCount) : 0}%`, background: SIGNUPS }} />
              <span className="block flex-1 rounded-t-[4px]" style={{ height: `${x.converted ? Math.max(3, (100 * x.converted) / maxCount) : 0}%`, background: CUSTOMERS }} />
            </span>
          ))}
        </div>
        <div className="mt-[4px] flex justify-between text-[11px] text-mut">
          <span>{w[0] ? weekLabel(w[0].week) : ''}</span>
          <span>{w.at(-1) ? weekLabel(w.at(-1)!.week) : ''}</span>
        </div>
        <details className="mt-[10px] text-[12.5px]">
          <summary className="cursor-pointer font-semibold text-link">{t('dashboard.trends.table')}</summary>
          <Table head={[t('dashboard.trends.week'), t('dashboard.trends.signups'), t('dashboard.trends.customers'), t('dashboard.trends.visitors')]}>
            {[...w].reverse().map((x) => (
              <tr key={x.week}>
                <Td>{weekLabel(x.week)}</Td>
                <Td>{x.signups}</Td>
                <Td>{x.converted}</Td>
                <Td>{x.visitors}</Td>
              </tr>
            ))}
          </Table>
        </details>
      </Card>
      <div className="flex flex-col gap-[14px]">
        <Card title={t('dashboard.trends.visitorsTitle')}>
          <div className="flex h-[70px] items-end gap-[3px] border-b border-line" role="img" aria-label={t('dashboard.trends.visitorsLabel')}>
            {w.map((x) => (
              <span
                key={x.week}
                title={`${weekLabel(x.week)}: ${x.visitors}`}
                className="block min-w-[4px] flex-1 rounded-t-[4px] bg-ac"
                style={{ height: `${x.visitors ? Math.max(3, (100 * x.visitors) / maxVisitors) : 0}%` }}
              />
            ))}
          </div>
          <p className="mb-0 mt-[8px] text-[12px] text-mut">{t('dashboard.trends.visitorsNote')}</p>
        </Card>
        <Card title={t('dashboard.trends.snapshots')}>
          {first && last && data.daily.length >= 7 ? (
            <p className="m-0 text-[13.5px] leading-[1.6]">
              {t('dashboard.trends.since', {
                date: weekLabel(first.day),
                mrrFrom: nok(first.mrr),
                mrrTo: nok(last.mrr),
                payingFrom: first.paying,
                payingTo: last.paying,
              })}
            </p>
          ) : (
            <p className="m-0 text-[13px] leading-[1.6] text-mut">
              {t('dashboard.trends.started', { date: first ? weekLabel(first.day) : '—', count: data.daily.length })}
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
