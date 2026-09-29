import type { Route } from 'next'
import Link from 'next/link'
import type { BadgeTone } from './ui'

export const STATUS_TONE: Record<string, BadgeTone> = { draft: 'grey', scheduled: 'yellow', sending: 'yellow', sent: 'green', cancelled: 'red' }

export type CrmTab = 'overview' | 'prospects' | 'stages' | 'contacts' | 'lists' | 'segments' | 'campaigns' | 'templates'

/** The CRM's pages (D-101, D-103): on a phone; from md the admin's menu lists them (X-091). */
export function CrmTabs({ current, labels }: { current: CrmTab; labels: Record<string, string> }) {
  const tabs: { key: CrmTab; href: string }[] = [
    { key: 'overview', href: '/admin/crm' },
    { key: 'prospects', href: '/admin/crm/prospects' },
    { key: 'stages', href: '/admin/crm/stages' },
    { key: 'contacts', href: '/admin/crm/contacts' },
    { key: 'lists', href: '/admin/crm/lists' },
    { key: 'segments', href: '/admin/crm/segments' },
    { key: 'campaigns', href: '/admin/crm/campaigns' },
    { key: 'templates', href: '/admin/crm/templates' },
  ]
  return (
    <nav aria-label={labels.label} className="mb-[18px] flex flex-wrap gap-[6px] md:hidden">
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

/** A stage's badge (0093): by its kind, the plan's trial green, a new prospect grey */
export function stageTone(stage: { key: string; kind: string } | undefined): BadgeTone {
  if (!stage) return 'grey'
  if (stage.key === 'trial') return 'green'
  if (stage.kind === 'won') return 'ink'
  if (stage.kind === 'lost') return stage.key === 'lost' ? 'red' : 'grey'
  if (stage.kind === 'parked') return 'grey'
  return stage.key === 'new' ? 'grey' : 'yellow'
}
