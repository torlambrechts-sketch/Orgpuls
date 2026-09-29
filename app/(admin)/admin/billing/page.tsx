import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { day, PageHead, Problem } from '@/components/admin/ui'
import { isError, orgList } from '@/lib/admin/api'
import { customerState, seats, type CustomerState } from '@/lib/admin/customers'
import { PLAN_MAX, PLANS } from '@/lib/billing/read'

/**
 * Admin › Billing & plans (X-095, the design's `isBilling`; D-170): the price list's plans with the
 * headcount each is for, and per plan the customers, trials and cancellations; under them every
 * confirmation of billing and every cancellation, newest first. No money: prices and invoices wait
 * for billing (Tor, 2026-09-29), and nothing here is invented to stand in for them.
 */
const VIZ = ['bg-viz1', 'bg-viz2', 'bg-viz3'] as const
const DOT: Record<CustomerState, string> = { active: 'bg-teal', trial: 'bg-ac', ended: 'bg-peach', cancelling: 'bg-peach', churned: 'bg-mut', demo: 'bg-mut' }
const EVENTS = 20

export default async function AdminBilling() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const res = await orgList(null, null)
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const b = (k: string, v?: Record<string, string | number>) => t(`billing.${k}`, v)
  const now = Date.now()
  const rows = res.rows.map((r) => ({ r, state: customerState(r, now), seat: seats(r.plan, r.employee_count, r.registered) })).filter((x) => x.state !== 'demo')
  const count = (s: CustomerState) => rows.filter((x) => x.state === s).length

  const plans = PLANS.map((p, i) => {
    const on = rows.filter((x) => x.seat.plan === p)
    const lo = i === 0 ? 1 : PLAN_MAX[PLANS[i - 1]!] + 1
    const hi = PLAN_MAX[p]
    return {
      key: p,
      dot: VIZ[i]!,
      band: Number.isFinite(hi) ? b('band', { lo, hi }) : b('bandFrom', { lo }),
      customers: on.filter((x) => x.state === 'active').length,
      trials: on.filter((x) => x.state === 'trial').length,
      cancelling: on.filter((x) => x.state === 'cancelling').length,
      registered: on.filter((x) => x.state === 'active' || x.state === 'cancelling').reduce((n, x) => n + x.r.registered, 0),
    }
  })

  const events = rows
    .flatMap((x) => [
      ...(x.r.confirmed_at ? [{ x, kind: 'confirmed' as const, at: x.r.confirmed_at }] : []),
      ...(x.r.cancelled_at ? [{ x, kind: 'cancelled' as const, at: x.r.cancelled_at }] : []),
    ])
    .sort((a, c) => c.at.localeCompare(a.at))
  const shown = events.slice(0, EVENTS)

  return (
    <>
      <PageHead title={b('title')} lead={b('lead', { active: count('active'), trial: count('trial'), cancelling: count('cancelling') })} />

      <div className="grid gap-[16px] [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {plans.map((p) => (
          <section key={p.key} className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
            <div className="flex items-center gap-[8px]">
              <span aria-hidden="true" className={`block h-[10px] w-[10px] rounded-pill ${p.dot}`} />
              <h2 className="m-0 font-display text-[22px] font-medium">{t(`customers.plans.${p.key}`)}</h2>
            </div>
            <div className="mt-[6px] text-[13px] text-mut [text-wrap:pretty]">{p.band}</div>
            <div className="mt-[14px] text-[20px] font-bold">{b('customers', { count: p.customers })}</div>
            <div className="text-[12.5px] text-mut">{b('pipeline', { trials: p.trials, cancelling: p.cancelling })}</div>
            <div className="mt-[14px] flex justify-between gap-[10px] border-t border-line pt-[12px] text-[13px]">
              <span className="font-semibold">{b('registered')}</span>
              <span className="text-mut">{b('people', { count: p.registered })}</span>
            </div>
          </section>
        ))}
      </div>

      <section className="mt-[18px] rounded-panel border border-line bg-sf">
        <div className="px-[20px] pt-[20px]">
          <h2 className="m-0 font-display text-[22px] font-medium">{b('events')}</h2>
          <div className="mt-[4px] text-[12.5px] text-mut">{b('eventsLead')}</div>
        </div>
        <div className="relative mt-[12px] overflow-x-auto">
          <div className="min-w-[660px]">
            <div aria-hidden="true" className="flex items-center gap-[14px] border-b border-line px-[20px] pb-[10px] text-[11px] uppercase tracking-[0.09em] text-mut">
              <span className="flex-[2.2]">{b('col.customer')}</span>
              <span className="flex-1">{b('col.plan')}</span>
              <span className="flex-[1.4]">{b('col.event')}</span>
              <span className="w-[110px]">{b('col.status')}</span>
              <span className="w-[80px]" />
            </div>
            <ul className="m-0 list-none p-0">
              {shown.map(({ x, kind, at }) => (
                <li key={`${x.r.id}-${kind}`} className="flex items-center gap-[14px] border-b border-line px-[20px] py-[13px] last:border-b-0">
                  <div className="min-w-0 flex-[2.2]">
                    <div className="truncate font-semibold">{x.r.name}</div>
                    <div className="truncate text-[12.5px] text-mut">{x.r.contact_name ?? x.r.org_number ?? '—'}</div>
                  </div>
                  <div className="flex-1 text-[13px]">
                    {t(`customers.plans.${x.seat.plan}`)}
                    {x.seat.chosen ? null : <span className="text-mut"> · {b('fitting')}</span>}
                  </div>
                  <div className="flex-[1.4] text-[13px]">
                    {kind === 'confirmed' ? b('confirmed', { date: day(at) }) : b('cancelled', { date: day(at), last: day(x.r.cancel_effective_at) })}
                  </div>
                  <div className="w-[110px]">
                    <span className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-pill bg-sbg px-[11px] py-[5px] text-[11.5px] font-bold">
                      <span aria-hidden="true" className={`block h-[6px] w-[6px] rounded-pill ${DOT[x.state]}`} />
                      {t(`customers.state.${x.state}`)}
                    </span>
                  </div>
                  <div className="flex w-[80px] justify-end">
                    <Link href={`/admin/orgs/${x.r.id}` as Route} className="inline-flex items-center justify-center whitespace-nowrap rounded-bar border border-line px-[12px] py-[7px] text-[12px] font-semibold text-ink no-underline hover:bg-ink/5 hover:text-ink hover:no-underline">
                      {b('open')}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            {shown.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{b('none')}</p>}
            {events.length > EVENTS ? <p className="m-0 border-t border-line px-[20px] py-[12px] text-[12.5px] text-mut">{b('more', { n: events.length - EVENTS })}</p> : null}
          </div>
        </div>
      </section>
      <p className="mb-0 mt-[14px] max-w-[90ch] text-[12px] leading-[1.55] text-mut md:px-[18px]">{b('note')}</p>
    </>
  )
}
