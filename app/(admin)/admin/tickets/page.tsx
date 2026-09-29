import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { FilterToolbar } from '@/components/admin/CustomerForms'
import { Icon } from '@/components/admin/icons'
import { STATUS_TONE } from '@/components/admin/tones'
import { Avatar, Badge, BTN, FIELD_LABEL, PageHead, Problem, Segments } from '@/components/admin/ui'
import { isError, TICKET_QUEUES, TICKET_VIEWS, tickets, type TicketRow } from '@/lib/admin/api'

/**
 * Tickets (X-095, the design's `isTickets`; D-92 before it): every request from the contact form and
 * the in-app help, with how long is left before its reply is due — the first reply until someone has
 * answered, then the resolution — or by how much it is late. Views, queues and search are addresses.
 * Opening the list is audited like every admin read.
 */
export default async function AdminTickets({ searchParams }: { searchParams: Promise<{ q?: string; queue?: string; view?: string }> }) {
  const sp = await searchParams
  const queue = TICKET_QUEUES.find((q) => q === sp.queue) ?? null
  const view = TICKET_VIEWS.find((v) => v === sp.view) ?? 'open'
  const search = sp.q?.trim().slice(0, 100) || null
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const k = (key: string, v?: Record<string, string | number>) => t(`tickets.board.${key}`, v)
  const list = await tickets(queue, view, search)
  if (isError(list)) return <Problem text={list.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  const href = (p: { queue?: string | null; view?: string }) => {
    const s = new URLSearchParams()
    const q = p.queue === undefined ? queue : p.queue
    const v = p.view ?? view
    if (q) s.set('queue', q)
    if (v !== 'open') s.set('view', v)
    if (search) s.set('q', search)
    const str = s.toString()
    return `/admin/tickets${str ? `?${str}` : ''}`
  }
  const now = Date.now()
  const late = list.rows.filter((r) => r.overdue).length
  const chip = (on: boolean) =>
    `inline-flex items-center rounded-pill border border-line px-[14px] py-[8px] text-[12px] font-semibold text-ink no-underline hover:text-ink hover:no-underline ${on ? 'bg-sbg' : 'bg-transparent hover:bg-ink/5'}`

  return (
    <>
      <PageHead title={t('tickets.title')} lead={k('lead', { count: list.rows.length, late })} />
      <section className="rounded-panel border border-line bg-sf">
        <FilterToolbar
          label={k('filters')}
          count={queue ? 1 : 0}
          left={
            <>
              <form method="get" action="/admin/tickets" role="search" className="flex h-[38px] items-center gap-[8px] rounded-ctl border border-line bg-bg px-[13px]">
                <span className="flex-none text-mut">
                  <Icon name="search" size={14} />
                </span>
                <input name="q" defaultValue={search ?? ''} placeholder={t('tickets.search')} aria-label={t('tickets.search')} className="box-border w-[200px] max-w-full border-0 bg-transparent text-[13px] text-ink outline-none" />
                {queue ? <input type="hidden" name="queue" value={queue} /> : null}
                {view !== 'open' ? <input type="hidden" name="view" value={view} /> : null}
              </form>
              <Segments label={t('tickets.view')} items={TICKET_VIEWS.map((v) => ({ key: v, label: t(`tickets.views.${v}`), href: href({ view: v }), on: v === view }))} />
            </>
          }
          panel={
            <>
              <div>
                <span className={FIELD_LABEL}>{t('tickets.queue')}</span>
                <div className="flex flex-wrap gap-[6px]">
                  {TICKET_QUEUES.map((q) => (
                    <Link key={q} href={href({ queue: queue === q ? null : q }) as Route} aria-pressed={queue === q} className={chip(queue === q)}>
                      {t(`tickets.queues.${q}`)} <span className="ml-[6px] font-medium text-mut">{list.counts[q] ?? 0}</span>
                    </Link>
                  ))}
                </div>
              </div>
              <Link href={href({ queue: null }) as Route} className="ml-auto rounded-bar px-[12px] py-[8px] text-[12.5px] font-semibold text-mut no-underline hover:text-ink hover:no-underline">
                {k('reset')}
              </Link>
            </>
          }
        />
        <div className="overflow-x-auto">
          <div className="min-w-[660px]">
            <div aria-hidden="true" className="flex items-center gap-[14px] border-y border-line px-[20px] pb-[10px] pt-[12px] text-[11px] uppercase tracking-[0.09em] text-mut">
              <span className="flex-[2.2]">{k('col.ticket')}</span>
              <span className="flex-[1.4]">{k('col.sla')}</span>
              <span className="w-[120px]">{k('col.status')}</span>
              <span className="w-[36px]">{k('col.owner')}</span>
              <span className="w-[70px]" />
            </div>
            <ul className="m-0 list-none p-0">
              {list.rows.map((r) => {
                const sla = slaOf(r, now)
                const link = `/admin/tickets/${r.id}` as Route
                return (
                  <li key={r.id} className="relative flex items-center gap-[14px] border-b border-line px-[20px] py-[14px] hover:bg-bg">
                    <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${sla.late ? 'bg-peach' : sla.done ? 'bg-teal' : 'bg-ac'}`} />
                    <div className="min-w-0 flex-[2.2]">
                      <Link href={link} className="font-semibold text-ink no-underline after:absolute after:inset-0 hover:text-ink hover:no-underline">
                        {r.subject}
                      </Link>{' '}
                      <span className="text-[12.5px] text-mut">#{r.number}</span>
                      <div className="text-[12.5px] text-mut">
                        {[r.org_name ?? r.requester_name ?? r.requester_email, t(`tickets.categories.${r.category}`), t(`tickets.priorities.${r.priority}`)].join(' · ')}
                      </div>
                    </div>
                    <div className="flex flex-[1.4] items-center gap-[6px] text-[13px]">
                      <span aria-hidden="true" className={`block h-[6px] w-[6px] flex-none rounded-pill ${sla.late ? 'bg-peach' : sla.done ? 'bg-teal' : 'bg-ac'}`} />
                      {sla.done ? k('closed') : sla.late ? k('breached', { time: span(sla.minutes) }) : k('left', { time: span(sla.minutes), what: r.first_responded_at ? k('resolve') : k('reply') })}
                    </div>
                    <div className="w-[120px]">
                      <Badge tone={STATUS_TONE[r.status] ?? 'grey'}>{t(`tickets.statuses.${r.status}`)}</Badge>
                    </div>
                    <div className="w-[36px]">{r.assignee_email ? <Avatar name={r.assignee_email} /> : null}</div>
                    <div className="relative flex w-[70px] justify-end">
                      <Link href={link} className={BTN.row} tabIndex={-1} aria-hidden="true">
                        {k('open')}
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
            {list.rows.length ? null : <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{t('common.none')}</p>}
          </div>
        </div>
      </section>
    </>
  )
}

/** The deadline that counts now: the first reply until someone answered, then the resolution; a legal deadline if it comes first */
function slaOf(r: TicketRow, now: number) {
  if (r.status === 'resolved' || r.status === 'closed') return { done: true, late: false, minutes: 0 }
  const due = r.first_responded_at ? r.resolve_due : r.first_response_due
  const at = Math.min(Date.parse(due), r.legal_due ? Date.parse(r.legal_due) : Infinity)
  const minutes = Math.round((at - now) / 60_000)
  return { done: false, late: minutes < 0, minutes: Math.abs(minutes) }
}

/** «1 h 20 min», «35 min», «3 d 4 h» */
function span(min: number) {
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`
  return `${Math.floor(min / 1440)} d${Math.floor((min % 1440) / 60) ? ` ${Math.floor((min % 1440) / 60)} h` : ''}`
}
