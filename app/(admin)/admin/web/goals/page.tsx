import { getTranslations } from 'next-intl/server'
import { AnalyticsHead, Panel, VIZ } from '@/components/admin/Analytics'
import { Problem } from '@/components/admin/ui'
import { change, int, periodOf, rangeLabel, share } from '@/lib/admin/analytics'
import { isError, webReport, type WebReport } from '@/lib/admin/api'

/**
 * Analytics › Goals (X-095, the design's `isGoals`): the way from visitor to customer in the period
 * — visitors, those who saw the prices, opened the sign-up, started a trial, became a customer — and
 * the goals the site has, each with where it is counted, what it feeds and how it compares with the
 * period before. The goals are the ones the product records (0121); the design's «New goal» has
 * nothing to define one in and is left out (D-167). Demo sandboxes are not trials.
 */
const GOALS = ['trials', 'demos', 'newsletter', 'contact'] as const
const FUNNEL = ['visitors', 'pricing', 'signup', 'trials', 'customers'] as const

export default async function AnalyticsGoals({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const days = periodOf((await searchParams).d)
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const r = await webReport(days)
  if (isError(r)) return <Problem text={r.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const a = (k: string, v?: Record<string, string | number>) => t(`analytics.${k}`, v)
  const g = (k: string, v?: Record<string, string | number>) => a(`goals.${k}`, v)
  const range = rangeLabel(r.from, r.to)
  const visitors = r.funnel.visitors

  return (
    <>
      <AnalyticsHead
        title={g('title')}
        lead={g('lead', { count: r.goals.trials.n ?? 0, n: int(r.goals.trials.n ?? 0), range })}
        path="/admin/web/goals"
        days={days}
        labels={{ period: a('period'), days: (n) => a('days', { count: n }), export: a('export') }}
      />

      <div className="grid items-start gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.1fr)_minmax(300px,.9fr)]">
        <Panel title={g('funnel')} sub={g('funnelLead')}>
          <ul className="m-0 mt-[18px] flex list-none flex-col gap-[12px] p-0">
            {FUNNEL.map((k, i) => {
              const n = r.funnel[k]
              const pct = share(n, visitors)
              return (
                <li key={k} className="flex items-center gap-[12px]">
                  <span className="w-[130px] flex-none text-[13px] font-semibold max-sm:w-[96px]">{g(`step.${k}`)}</span>
                  <span className="block h-[22px] flex-1 overflow-hidden rounded-[6px] bg-ink/5">
                    <span className={`block h-full rounded-[6px] ${VIZ[i]}`} style={{ width: `${visitors ? Math.max(2, pct) : 0}%` }} />
                  </span>
                  <span className="min-w-[96px] whitespace-nowrap text-right text-[12.5px] max-sm:min-w-[72px]">
                    <b>{int(n)}</b> <span className="text-mut">{pct} %</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>

        <section className="min-w-0 rounded-panel border border-line bg-sf">
          <div className="px-[20px] pt-[20px]">
            <h2 className="m-0 font-display text-[22px] font-medium">{g('list')}</h2>
          </div>
          <ul className="m-0 mt-[8px] flex list-none flex-col p-0">
            {GOALS.map((k) => (
              <Goal key={k} k={k} c={r.goals[k]} g={g} days={days} />
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}

function Goal({ k, c, g, days }: { k: (typeof GOALS)[number]; c: WebReport['goals']['trials']; g: (k: string, v?: Record<string, string | number>) => string; days: number }) {
  const d = change(c.n, c.prev)
  const dot = d?.dir === 'up' ? 'bg-teal' : d?.dir === 'down' ? 'bg-peach' : 'bg-line'
  return (
    <li className="flex items-center gap-[12px] border-t border-line px-[20px] py-[13px]">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">{g(`goal.${k}.name`)}</div>
        <div className="text-[12px] text-mut">
          {g(`goal.${k}.rule`)} · {g(`goal.${k}.src`)}
        </div>
      </div>
      {c.n === null ? (
        <span title={g('notKeptHint')} className="text-[12.5px] text-mut">
          {g('notKept')}
        </span>
      ) : (
        <b className="text-[20px]">{int(c.n)}</b>
      )}
      <span title={d ? g('trendHint', { days }) : undefined} className="flex min-w-[64px] items-center justify-end gap-[6px] text-[12px]">
        {d ? (
          <>
            <span aria-hidden="true" className={`block h-[6px] w-[6px] rounded-pill ${dot}`} />
            {d.dir === 'flat' ? g('flat') : g(d.dir, { pct: d.pct })}
          </>
        ) : null}
      </span>
    </li>
  )
}
