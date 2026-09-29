import { getTranslations } from 'next-intl/server'
import { AnalyticsHead } from '@/components/admin/Analytics'
import { Problem } from '@/components/admin/ui'
import { clock, int, periodOf, rangeLabel, share } from '@/lib/admin/analytics'
import { isError, webReport } from '@/lib/admin/api'
import { pageNames } from '@/lib/admin/pageNames'

/**
 * Analytics › Pages (X-095, the design's `isApages`): every page with views in the period — its
 * share of all views, views, unique visitors (per day, as the beacon counts them), the time a view
 * lasted until the next page of the visit, the share of views that ended the visit, and the
 * conversion of visits that began on the page into organisations signed up. Counted by 0121's
 * reader from the beacon's own events; the fifty pages with most views are shown.
 */
export default async function AnalyticsPages({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const days = periodOf((await searchParams).d)
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const [r, names] = await Promise.all([webReport(days), pageNames()])
  if (isError(r)) return <Problem text={r.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const a = (k: string, v?: Record<string, string | number>) => t(`analytics.${k}`, v)
  const p = (k: string, v?: Record<string, string | number>) => a(`pages.${k}`, v)

  return (
    <>
      <AnalyticsHead
        title={p('title')}
        lead={p('lead', { count: r.pages_total, range: rangeLabel(r.from, r.to) })}
        path="/admin/web/pages"
        days={days}
        labels={{ period: a('period'), days: (n) => a('days', { count: n }), export: a('export') }}
      />

      <div className="overflow-x-auto rounded-panel border border-line bg-sf">
        <div className="min-w-[700px]">
          <div aria-hidden="true" className="flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] pt-[14px] text-[11px] uppercase tracking-[0.09em] text-mut">
            <span className="flex-[2]">{p('col.page')}</span>
            <span className="flex-[1.4]">{p('col.share')}</span>
            <span className="w-[90px] text-right">{p('col.views')}</span>
            <span className="w-[80px] text-right">{p('col.unique')}</span>
            <span className="w-[70px] text-right">{p('col.time')}</span>
            <span className="w-[60px] text-right">{p('col.exit')}</span>
            <span className="w-[80px] text-right">{p('col.conv')}</span>
          </div>
          <ul className="m-0 list-none p-0">
            {r.pages.map((x) => {
              const name = names.get(x.path)
              const pct = share(x.views, r.views_total)
              return (
                <li key={x.path} className="flex items-center gap-[14px] border-b border-line px-[20px] py-[12px] text-[13px]">
                  <div className="min-w-0 flex-[2]">
                    <div className="flex items-center gap-[8px] font-semibold">
                      <span className="min-w-0 truncate">{name?.title ?? x.path}</span>
                      {name ? (
                        <span className="flex-none rounded-pill border border-line px-[7px] py-[2px] text-[11px] font-semibold text-mut">{p(`kind.${name.kind}`)}</span>
                      ) : null}
                    </div>
                    {name ? <div className="truncate text-[12px] text-mut">{x.path}</div> : null}
                  </div>
                  <div className="flex flex-[1.4] items-center gap-[10px]">
                    <span className="block h-[8px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]">
                      <span className="block h-full rounded-pill bg-ac" style={{ width: `${pct}%` }} />
                    </span>
                    <b className="min-w-[40px] text-right text-[12.5px]">{pct} %</b>
                  </div>
                  <b className="w-[90px] text-right">{int(x.views)}</b>
                  <span className="w-[80px] text-right">{int(x.uniq)}</span>
                  <span className="w-[70px] text-right">{x.seconds === null ? '—' : clock(x.seconds)}</span>
                  <span className="w-[60px] text-right">{share(x.exits, x.views)} %</span>
                  <span className="w-[80px] text-right font-semibold">{x.entries ? `${((100 * x.signups) / x.entries).toFixed(1).replace('.', ',')} %` : '—'}</span>
                </li>
              )
            })}
          </ul>
          {r.pages.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{p('none')}</p>}
        </div>
      </div>
      <p className="mb-0 mt-[16px] text-[12px] leading-[1.5] text-mut md:px-[18px]">
        {r.pages_total > r.pages.length ? `${p('shown', { count: r.pages.length })} ` : ''}
        {p('note')}
      </p>
    </>
  )
}
