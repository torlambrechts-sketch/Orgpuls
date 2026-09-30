import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { MentionsSeen } from '@/components/admin/CannedForms'
import { TicketTabs } from '@/components/admin/TicketTabs'
import { STATUS_TONE } from '@/components/admin/tones'
import { Badge, PageHead, Problem, when } from '@/components/admin/ui'
import { isError, ticketMentions } from '@/lib/admin/api'

/**
 * Tickets › Mentions (0135): the internal notes that named you with `@`, unseen first. Opening
 * the ticket marks its mentions seen; «Mark all as seen» does it for every one. Seen mentions stay
 * listed for a fortnight.
 */
export default async function TicketMentions() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = (key: string, v?: Record<string, string | number>) => t(`tickets.mentionsPage.${key}`, v)
  const data = await ticketMentions()
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />

  return (
    <>
      <PageHead title={t('tickets.title')} lead={m('lead', { count: data.mentions_unseen })}>
        {data.mentions_unseen > 0 ? (
          <MentionsSeen
            words={{ label: m('markAll'), saving: t('common.saving'), done: t('common.done'), problems: { not_allowed: t('common.notAllowed'), failed: t('common.failed') } }}
          />
        ) : null}
      </PageHead>
      <TicketTabs on="mentions" unseen={data.mentions_unseen} />
      <section className="rounded-panel border border-line bg-sf">
        {data.rows.length ? (
          <ul className="m-0 list-none p-0">
            {data.rows.map((r) => (
              <li key={r.id} className="relative flex items-start gap-[14px] border-b border-line px-[20px] py-[14px] last:border-0 hover:bg-bg">
                <span aria-hidden="true" className={`mt-[7px] block h-[6px] w-[6px] flex-none rounded-pill ${r.seen_at ? 'bg-line' : 'bg-ac'}`} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/tickets/${r.ticket_id}` as Route}
                    className="font-semibold text-ink no-underline after:absolute after:inset-0 hover:text-ink hover:no-underline"
                  >
                    {r.subject}
                  </Link>{' '}
                  <span className="text-[12.5px] text-mut">#{r.number}</span>
                  <div className="text-[12.5px] text-mut">
                    {m('by', { who: r.by_email ?? '—', at: when(r.created_at) })}
                    {r.seen_at ? '' : ` · ${m('unseen')}`}
                  </div>
                  <p className="mb-0 mt-[6px] line-clamp-2 whitespace-pre-line break-words text-[13px] leading-[1.5]">{r.excerpt}</p>
                </div>
                <Badge tone={STATUS_TONE[r.status] ?? 'grey'}>{t(`tickets.statuses.${r.status}`)}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 px-[20px] py-[18px] text-[13px] text-mut">{m('empty')}</p>
        )}
      </section>
    </>
  )
}
