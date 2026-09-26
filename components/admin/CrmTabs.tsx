import type { Route } from 'next'
import Link from 'next/link'
import type { BadgeTone } from './ui'

export const STATUS_TONE: Record<string, BadgeTone> = { draft: 'grey', scheduled: 'yellow', sending: 'yellow', sent: 'green', cancelled: 'red' }

/** Contacts, segments, campaigns: the CRM's three pages (D-101). */
export function CrmTabs({ current, labels }: { current: 'contacts' | 'segments' | 'campaigns'; labels: Record<string, string> }) {
  const tabs = [
    { key: 'contacts', href: '/admin/crm' },
    { key: 'segments', href: '/admin/crm/segments' },
    { key: 'campaigns', href: '/admin/crm/campaigns' },
  ] as const
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
