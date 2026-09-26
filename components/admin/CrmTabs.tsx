import type { Route } from 'next'
import Link from 'next/link'
import type { BadgeTone } from './ui'

export const STATUS_TONE: Record<string, BadgeTone> = { draft: 'grey', scheduled: 'yellow', sending: 'yellow', sent: 'green', cancelled: 'red' }

export type CrmTab = 'overview' | 'prospects' | 'contacts' | 'lists' | 'segments' | 'campaigns' | 'templates'

/** The CRM's pages (D-101, D-103). */
export function CrmTabs({ current, labels }: { current: CrmTab; labels: Record<string, string> }) {
  const tabs: { key: CrmTab; href: string }[] = [
    { key: 'overview', href: '/admin/crm' },
    { key: 'prospects', href: '/admin/crm/prospects' },
    { key: 'contacts', href: '/admin/crm/contacts' },
    { key: 'lists', href: '/admin/crm/lists' },
    { key: 'segments', href: '/admin/crm/segments' },
    { key: 'campaigns', href: '/admin/crm/campaigns' },
    { key: 'templates', href: '/admin/crm/templates' },
  ]
  return (
    <nav aria-label={labels.label} className="mb-[18px] flex flex-wrap gap-[6px]">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href as Route}
          aria-current={t.key === current ? 'page' : undefined}
          className={`rounded-pill border px-[14px] py-[6px] text-[13px] font-semibold no-underline ${
            t.key === current ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'
          }`}
        >
          {labels[t.key]}
        </Link>
      ))}
    </nav>
  )
}

export const STAGE_TONE: Record<string, BadgeTone> = {
  new: 'grey',
  contacted: 'yellow',
  engaged: 'yellow',
  meeting: 'yellow',
  trial: 'green',
  customer: 'ink',
  lost: 'red',
  not_relevant: 'grey',
}
