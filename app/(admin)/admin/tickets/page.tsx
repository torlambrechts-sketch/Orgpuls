import { getTranslations } from 'next-intl/server'
import { PRIORITY_TONE, STATUS_TONE } from '@/components/admin/tones'
import { ALink, Badge, Card, PageHead, Problem, Table, Td, when } from '@/components/admin/ui'
import { isError, TICKET_QUEUES, TICKET_VIEWS, tickets } from '@/lib/admin/api'

/**
 * The ticket queue (D-92): every request from the contact form and the in-app help form, per
 * queue, overdue first and then by priority. Opening it is audited like every admin read.
 */
export default async function AdminTickets({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; queue?: string; view?: string }>
}) {
  const sp = await searchParams
  const queue = TICKET_QUEUES.find((q) => q === sp.queue) ?? null
  const view = TICKET_VIEWS.find((v) => v === sp.view) ?? 'open'
  const search = sp.q?.trim().slice(0, 100) || null
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const list = await tickets(queue, view, search)
  if (isError(list)) return <Problem text={list.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  const href = (q: string | null, v: string) => {
    const p = new URLSearchParams()
    if (q) p.set('queue', q)
    if (v !== 'open') p.set('view', v)
    if (search) p.set('q', search)
    const s = p.toString()
    return `/admin/tickets${s ? `?${s}` : ''}`
  }
  const pill = (on: boolean) =>
    `rounded-pill border px-[12px] py-[5px] text-[12.5px] font-semibold ${on ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'}`
  const total = Object.values(list.counts).reduce((a, b) => a + b, 0)

  return (
    <>
      <PageHead title={t('tickets.title')} lead={t('tickets.lead')} />
      <nav aria-label={t('tickets.queue')} className="mb-[10px] flex flex-wrap gap-[6px]">
        <a href={href(null, view)} aria-current={queue === null ? 'page' : undefined} className={pill(queue === null)}>
          {t('tickets.allQueues')} · {total}
        </a>
        {TICKET_QUEUES.map((q) => (
          <a key={q} href={href(q, view)} aria-current={queue === q ? 'page' : undefined} className={pill(queue === q)}>
            {t(`tickets.queues.${q}`)} · {list.counts[q] ?? 0}
          </a>
        ))}
      </nav>
      <div className="mb-[14px] flex flex-wrap items-center justify-between gap-[10px]">
        <nav aria-label={t('tickets.view')} className="flex flex-wrap gap-[6px]">
          {TICKET_VIEWS.map((v) => (
            <a key={v} href={href(queue, v)} aria-current={view === v ? 'page' : undefined} className={pill(view === v)}>
              {t(`tickets.views.${v}`)}
            </a>
          ))}
        </nav>
        <form action="/admin/tickets" className="flex gap-[8px]">
          {queue ? <input type="hidden" name="queue" value={queue} /> : null}
          {view !== 'open' ? <input type="hidden" name="view" value={view} /> : null}
          <input
            name="q"
            defaultValue={search ?? ''}
            placeholder={t('tickets.search')}
            aria-label={t('tickets.search')}
            className="box-border h-[36px] w-[240px] rounded-ctl border border-line bg-sf px-[12px] text-[13px] text-ink outline-none"
          />
        </form>
      </div>

      <Card>
        <Table
          head={[
            t('tickets.col.number'),
            t('tickets.col.subject'),
            t('tickets.col.from'),
            t('tickets.col.priority'),
            t('tickets.col.status'),
            t('tickets.col.assignee'),
            t('tickets.col.due'),
            t('tickets.col.created'),
          ]}
          empty={list.rows.length ? undefined : t('common.none')}
        >
          {list.rows.map((r) => {
            const due = r.first_responded_at ? r.resolve_due : r.first_response_due
            return (
              <tr key={r.id}>
                <Td className="font-semibold">
                  <ALink href={`/admin/tickets/${r.id}`}>#{r.number}</ALink>
                </Td>
                <Td wrap className="min-w-[240px]">
                  <ALink href={`/admin/tickets/${r.id}`}>{r.subject}</ALink>
                  <span className="block text-[11.5px] text-mut">
                    {t(`tickets.types.${r.type}`)} · {t(`tickets.categories.${r.category}`)} ·{' '}
                    {t(`tickets.channels.${r.channel}`)}
                  </span>
                </Td>
                <Td>
                  {r.org_name ?? r.requester_name ?? '—'}
                  <span className="block text-[11.5px] text-mut">{r.requester_email}</span>
                </Td>
                <Td>
                  <Badge tone={PRIORITY_TONE[r.priority]}>{t(`tickets.priorities.${r.priority}`)}</Badge>
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[r.status]}>{t(`tickets.statuses.${r.status}`)}</Badge>
                </Td>
                <Td>{r.assignee_email ?? '—'}</Td>
                <Td className={r.overdue ? 'font-bold text-dangerdeep' : ''}>
                  {r.overdue ? `${t('tickets.overdue')} · ` : ''}
                  {when(r.legal_due && r.legal_due < due ? r.legal_due : due)}
                  <span className="block text-[11.5px] font-normal text-mut">
                    {r.first_responded_at ? t('tickets.dueResolve') : t('tickets.dueFirst')}
                  </span>
                </Td>
                <Td>{when(r.created_at)}</Td>
              </tr>
            )
          })}
        </Table>
      </Card>
    </>
  )
}
