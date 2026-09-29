import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { FilterToolbar } from '@/components/admin/CustomerForms'
import { Avatar, Badge, BTN, FIELD_LABEL, PageHead, Problem, Segments } from '@/components/admin/ui'
import { Icon } from '@/components/admin/icons'
import { isError, orgList, type OrgRow } from '@/lib/admin/api'
import { CUSTOMER_STATES, customerState, seats, STATE_DOT, type CustomerState } from '@/lib/admin/customers'
import { PLANS } from '@/lib/billing/read'

/**
 * Customers (X-095, the design's `isCustomers`; D-90 before it): every organisation as a paying
 * account — its daglig leder and plan, the seats it uses against the plan, its state and the person
 * on the team who owns it. Search by name, organisation number or a user's e-mail; segments by
 * state; filters by plan and owner. Each segment and filter is an address, so a view can be linked.
 * Demo sandboxes are not customers and have a segment of their own.
 */
type Search = { q?: string; s?: string; plan?: string; owner?: string }

export default async function Customers({ searchParams }: { searchParams: Promise<Search> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const c = (k: string, v?: Record<string, string | number>) => t(`customers.${k}`, v)
  const sp = await searchParams
  const q = sp.q?.trim().slice(0, 100) || null
  const seg: CustomerState | 'all' = (CUSTOMER_STATES as readonly string[]).includes(sp.s ?? '') ? (sp.s as CustomerState) : 'all'
  const plan = (PLANS as readonly string[]).includes(sp.plan ?? '') ? sp.plan! : null
  const owner = sp.owner && /^[0-9a-f-]{36}$|^none$/.test(sp.owner) ? sp.owner : null
  const res = await orgList(q, null)
  if (isError(res)) return <Problem text={res.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  const now = Date.now()
  const rows = res.rows.map((r) => ({ r, state: customerState(r, now), seat: seats(r.plan, r.employee_count, r.registered) }))
  const byFilter = rows.filter((x) => (!plan || x.seat.plan === plan) && (!owner || (owner === 'none' ? !x.r.owner_id : x.r.owner_id === owner)))
  const count = (s: CustomerState | 'all') => byFilter.filter((x) => (s === 'all' ? x.state !== 'demo' : x.state === s)).length
  const shown = byFilter.filter((x) => (seg === 'all' ? x.state !== 'demo' : x.state === seg))
  const paying = rows.filter((x) => x.state === 'active' || x.state === 'cancelling').length
  const owners = [...new Map(res.rows.filter((r) => r.owner_id && r.owner_email).map((r) => [r.owner_id!, r.owner_email!])).entries()]

  const href = (p: Partial<Search>) => {
    const next = { q: q ?? undefined, s: seg === 'all' ? undefined : seg, plan: plan ?? undefined, owner: owner ?? undefined, ...p }
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString()
    return `/admin/orgs${qs ? `?${qs}` : ''}`
  }
  const segs = (['all', ...CUSTOMER_STATES] as const)
    .filter((s) => s !== 'demo' || count('demo') > 0)
    .map((s) => ({ key: s, label: c(`state.${s}`), n: count(s), href: href({ s: s === 'all' ? undefined : s }), on: s === seg }))
  const chip = (on: boolean) =>
    `inline-flex cursor-pointer items-center rounded-pill border border-line px-[14px] py-[8px] text-[12px] font-semibold text-ink no-underline hover:text-ink hover:no-underline ${on ? 'bg-sbg' : 'bg-transparent hover:bg-ink/5'}`

  return (
    <>
      <PageHead title={c('title')} lead={c('lead', { count: paying, site: t('nav.siteName') })} />
      <section className="rounded-panel border border-line bg-sf">
        <FilterToolbar
          label={c('filters')}
          count={(plan ? 1 : 0) + (owner ? 1 : 0)}
          left={
            <>
              <form method="get" action="/admin/orgs" role="search" className="flex h-[38px] items-center gap-[8px] rounded-ctl border border-line bg-bg px-[13px]">
                <span className="flex-none text-mut"><Icon name="search" size={14} /></span>
                <input
                  name="q"
                  defaultValue={q ?? ''}
                  placeholder={c('search')}
                  aria-label={c('searchLabel')}
                  className="box-border w-[172px] max-w-full border-0 bg-transparent text-[13px] text-ink outline-none"
                />
                {seg !== 'all' ? <input type="hidden" name="s" value={seg} /> : null}
              </form>
              <Segments label={c('segments')} items={segs} />
            </>
          }
          panel={
            <>
              <div>
                <span className={FIELD_LABEL}>{c('plan')}</span>
                <div className="flex flex-wrap gap-[6px]">
                  {PLANS.map((p) => (
                    <Link key={p} href={href({ plan: plan === p ? undefined : p }) as Route} aria-pressed={plan === p} className={chip(plan === p)}>
                      {c(`plans.${p}`)}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <span className={FIELD_LABEL}>{c('owner')}</span>
                <div className="flex flex-wrap gap-[6px]">
                  {owners.map(([id, email]) => (
                    <Link key={id} href={href({ owner: owner === id ? undefined : id }) as Route} aria-pressed={owner === id} className={chip(owner === id)}>
                      {email}
                    </Link>
                  ))}
                  <Link href={href({ owner: owner === 'none' ? undefined : 'none' }) as Route} aria-pressed={owner === 'none'} className={chip(owner === 'none')}>
                    {c('noOwner')}
                  </Link>
                </div>
              </div>
              <Link href={href({ plan: undefined, owner: undefined }) as Route} className="ml-auto rounded-bar px-[12px] py-[8px] text-[12.5px] font-semibold text-mut no-underline hover:text-ink hover:no-underline">
                {c('reset')}
              </Link>
            </>
          }
        />
        <div className="overflow-x-auto">
          <div className="min-w-[660px]">
            <div className="flex items-center gap-[14px] border-y border-line px-[20px] pb-[10px] pt-[12px] text-[11px] uppercase tracking-[0.09em] text-mut" aria-hidden="true">
              <span className="flex-[2.2]">{c('col.customer')}</span>
              <span className="flex-[1.4]">{c('col.seats')}</span>
              <span className="w-[92px]">{c('col.status')}</span>
              <span className="w-[36px]">{c('col.owner')}</span>
              <span className="w-[112px]" />
            </div>
            <ul className="m-0 list-none p-0">
              {shown.map(({ r, state, seat }) => (
                <Row key={r.id} r={r} state={state} seat={seat} labels={{ state: c(`state.${state}`), plan: c(`plans.${seat.plan}`), planSuggested: c('planSuggested', { plan: c(`plans.${seat.plan}`) }), open: c('open'), noContact: c('noContact'), noOwner: c('noOwner'), employees: c('employees', { count: seat.used }), trialEnds: c('trialEnds', { date: day(r.trial_ends_at) }) }} />
              ))}
            </ul>
            {shown.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{q || plan || owner ? c('noMatch') : t('common.none')}</p>}
          </div>
        </div>
      </section>
    </>
  )
}

const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' })
const day = (iso: string) => fmt.format(new Date(iso))

function Row({
  r,
  state,
  seat,
  labels,
}: {
  r: OrgRow
  state: CustomerState
  seat: ReturnType<typeof seats>
  labels: { state: string; plan: string; planSuggested: string; open: string; noContact: string; noOwner: string; employees: string; trialEnds: string }
}) {
  const href = `/admin/orgs/${r.id}` as Route
  return (
    <li className="relative flex items-center gap-[14px] border-b border-line px-[20px] py-[14px] hover:bg-bg">
      <div className="min-w-0 flex-[2.2]">
        <Link href={href} className="text-[14px] font-semibold text-ink no-underline after:absolute after:inset-0 hover:text-ink hover:no-underline">
          {r.name}
        </Link>
        <div className="text-[12.5px] text-mut">
          {r.contact_name ?? labels.noContact} · {seat.chosen ? labels.plan : labels.planSuggested}
          {state === 'trial' ? ` · ${labels.trialEnds}` : ''}
        </div>
      </div>
      <div className="flex flex-[1.4] items-center gap-[10px]">
        {seat.pct === null ? (
          <span className="text-[12.5px]">{labels.employees}</span>
        ) : (
          <>
            <span className="block h-[8px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]" aria-hidden="true">
              <span className="block h-full rounded-pill bg-ac" style={{ width: `${seat.pct}%` }} />
            </span>
            <span className="min-w-[84px] whitespace-nowrap text-[12.5px]">
              <b>{seat.pct} %</b> <span className="text-mut">{`${seat.used}/${seat.max}`}</span>
            </span>
          </>
        )}
      </div>
      <div className="w-[92px]">
        <Badge tone={STATE_DOT[state]}>{labels.state}</Badge>
      </div>
      <div className="w-[36px]">{r.owner_email ? <Avatar name={r.owner_email} /> : <span className="sr-only">{labels.noOwner}</span>}</div>
      <div className="relative flex w-[112px] justify-end">
        <Link href={href} className={BTN.row} tabIndex={-1} aria-hidden="true">
          {labels.open}
        </Link>
      </div>
    </li>
  )
}
