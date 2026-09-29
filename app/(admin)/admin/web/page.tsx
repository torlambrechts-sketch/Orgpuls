import { getTranslations } from 'next-intl/server'
import { AnalyticsHead, Panel, VIZ } from '@/components/admin/Analytics'
import { Problem } from '@/components/admin/ui'
import { bars, change, clock, dec, int, monthsLabel, periodOf, rangeLabel, share } from '@/lib/admin/analytics'
import { isError, web, webReport } from '@/lib/admin/api'

/**
 * Analytics › Overview (X-095, the design's `isTraffic`; D-91 before it): four figures for the
 * period — visitors against the period before, sessions, pageviews, the bounce rate with the time a
 * visit lasts — the visitors per day with the weekends in grey, where the visits came from and on
 * what kind of device. Counted by the site's own beacon (0050): no cookie, and a visit code that
 * changes every day, so a visitor is a visitor on a day. Sources, campaigns, places and the latest
 * visits one by one are on Sources & visits.
 */
export default async function AnalyticsOverview({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const days = periodOf((await searchParams).d)
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const [r, w] = await Promise.all([webReport(days), web(days)])
  if (isError(r) || isError(w)) {
    const e = [r, w].find(isError)
    return <Problem text={e?.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }
  const a = (k: string, v?: Record<string, string | number>) => t(`analytics.${k}`, v)
  const o = (k: string, v?: Record<string, string | number>) => a(`overview.${k}`, v)
  const range = rangeLabel(r.from, r.to)
  const tot = w.totals

  const vs = change(tot.visitors, r.previous?.visitors ?? null)
  const kpis = [
    { key: 'visitors', value: int(tot.visitors), sub: vs ? o(vs.dir, { pct: vs.pct, days }) : o('noPrevious') },
    { key: 'sessions', value: int(tot.sessions), sub: o('perVisitor', { n: tot.visitors ? dec(tot.sessions / tot.visitors, 2) : '0' }) },
    { key: 'views', value: int(tot.views), sub: o('perSession', { n: tot.sessions ? dec(tot.views / tot.sessions, 1) : '0' }) },
    { key: 'bounce', value: `${share(tot.bounced, tot.sessions)} %`, sub: o('onSite', { time: clock(r.avg_seconds) }) },
  ]

  const chart = bars(r.from, r.to, w.daily)
  const max = Math.max(1, ...chart.bars.map((b) => b.n))
  const labelled = chart.bars.length <= 16

  const sources = w.channels.filter((c) => c.sessions > 0)
  const top = sources[0]
  const known = r.devices.reduce((s, d) => s + d.visitors, 0)
  const devices = (['desktop', 'mobile', 'tablet'] as const).map((k) => ({ key: k, n: r.devices.find((d) => d.device === k)?.visitors ?? 0 }))

  return (
    <>
      <AnalyticsHead
        title={o('title')}
        lead={o('lead', { domain: t('nav.siteDomain'), range })}
        path="/admin/web"
        days={days}
        labels={{ period: a('period'), days: (n) => a('days', { count: n }), export: a('export') }}
      />

      <div className="grid gap-[16px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {kpis.map((k) => (
          <div key={k.key} className="rounded-panel border border-line bg-sf px-[22px] py-[20px]">
            <div className="text-[11px] uppercase tracking-[0.09em] text-mut">{o(`kpi.${k.key}`, { days })}</div>
            <div className="mt-[8px] text-[30px] font-bold leading-[1.15]">{k.value}</div>
            <div className="mt-[4px] text-[12.5px] text-mut">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-[18px] grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <Panel
          title={o(chart.per === 'day' ? 'daily' : 'weekly')}
          aside={o(chart.per === 'day' ? 'weekends' : 'weeks', { months: monthsLabel(r.from, r.to) })}
        >
          <div role="img" aria-label={`${o(chart.per === 'day' ? 'daily' : 'weekly')}, ${range}`}>
            <div className="mt-[20px] flex h-[180px] items-end gap-[6px] border-b border-line pb-[8px] max-md:gap-[3px]">
              {chart.bars.map((b) => (
                <div key={b.key} title={o('bar', { label: b.label, n: int(b.n) })} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[6px]">
                  {labelled ? <span className="text-[10.5px] text-mut max-md:hidden">{int(b.n)}</span> : null}
                  <span
                    className={`block min-h-[3px] w-full rounded-[6px_6px_2px_2px] ${b.weekend ? 'bg-line' : 'bg-ac'}`}
                    style={{ height: `${Math.round((100 * b.n) / max)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-[6px] flex gap-[6px] max-md:gap-[3px]">
              {chart.bars.map((b, i) => (
                <span key={b.key} className="min-w-0 flex-1 text-center text-[10.5px] text-mut">
                  {labelled || i % Math.ceil(chart.bars.length / 16) === 0 ? b.label : ''}
                </span>
              ))}
            </div>
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <Panel
            title={o('sources')}
            sub={top ? o('topSource', { source: t(`web.channel.${top.channel}`), n: int(top.sessions), pct: share(top.sessions, tot.sessions) }) : o('noSources')}
          >
            {sources.length ? (
              <ul className="m-0 mt-[14px] flex list-none flex-col gap-[10px] p-0">
                {sources.map((s, i) => {
                  const p = share(s.sessions, tot.sessions)
                  return (
                    <li key={s.channel} className="flex items-center gap-[10px]">
                      <span className="w-[100px] flex-none text-[13px] font-semibold">{t(`web.channel.${s.channel}`)}</span>
                      <span className="block h-[8px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]">
                        <span className={`block h-full rounded-pill ${VIZ[i % VIZ.length]}`} style={{ width: `${p}%` }} />
                      </span>
                      <span className="min-w-[84px] whitespace-nowrap text-right text-[12.5px]">
                        <b>{p} %</b> <span className="text-mut">{int(s.sessions)}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </Panel>

          <Panel title={o('devices')}>
            {known ? (
              <div className="mt-[14px] flex gap-[10px]">
                {devices.map((d) => (
                  <div key={d.key} className="min-w-0 flex-1 rounded-[12px] border border-line bg-bg px-[14px] py-[12px]">
                    <div className="text-[11px] uppercase tracking-[0.09em] text-mut">{o(`device.${d.key}`)}</div>
                    <div className="mt-[2px] text-[22px] font-bold">{share(d.n, known)} %</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-0 mt-[14px] text-[13px] leading-[1.5] text-mut">{o('noDevices')}</p>
            )}
          </Panel>
        </div>
      </div>
      <p className="mb-0 mt-[16px] text-[12px] text-mut md:px-[18px]">{o('visitorsNote')}</p>
    </>
  )
}
