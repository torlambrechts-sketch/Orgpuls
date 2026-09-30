import { getTranslations } from 'next-intl/server'
import { SectionTabs } from './SectionTabs'

export const TICKET_TABS = ['queue', 'reports', 'canned', 'mentions'] as const
export type TicketTab = (typeof TICKET_TABS)[number]
const HREF: Record<TicketTab, string> = {
  queue: '/admin/tickets',
  reports: '/admin/tickets/reports',
  canned: '/admin/tickets/canned',
  mentions: '/admin/tickets/mentions',
}

/**
 * Customers › Tickets (0135): the queue, its report, the canned replies and the caller's
 * @mentions, as tabs under the page head (the design's `stabs`, as Contacts & lists). The
 * mentions tab carries how many are unseen, from the reader the page already called.
 */
export async function TicketTabs({ on, unseen }: { on: TicketTab; unseen: number }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  return (
    <SectionTabs
      label={t('tickets.tabs.label')}
      items={TICKET_TABS.map((k) => ({
        key: k,
        label: t(`tickets.tabs.${k}`),
        href: HREF[k],
        on: k === on,
        n: k === 'mentions' && unseen > 0 ? unseen : undefined,
      }))}
    />
  )
}
