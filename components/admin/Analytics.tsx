import type { Route } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ANALYTICS_PERIODS, type Period } from '@/lib/admin/analytics'
import { PageHead, Segments } from './ui'

/**
 * The Analytics pages' head (X-095, phase 6): the title and the period in words, and on the right
 * the period to count — kept from the old Web page (D-167), the design fixes it at fourteen days —
 * and the design's «Export report», a CSV of the same figures for the same period.
 */
export function AnalyticsHead({
  title,
  lead,
  path,
  days,
  labels,
  action,
}: {
  title: string
  lead: string
  path: string
  days: Period
  labels: { period: string; days: (n: number) => string; export: string }
  action?: ReactNode
}) {
  return (
    <PageHead title={title} lead={lead}>
      <div className="flex flex-wrap items-center gap-[10px]">
        <Segments
          label={labels.period}
          items={ANALYTICS_PERIODS.map((p) => ({ key: String(p), label: labels.days(p), href: `${path}?d=${p}`, on: p === days }))}
        />
        {action ?? (
          <Link
            href={`/admin/web/export?d=${days}` as Route}
            prefetch={false}
            className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border border-ink bg-transparent px-[15px] py-[9px] text-[12.5px] font-semibold text-ink no-underline hover:bg-ink/5 hover:text-ink hover:no-underline"
          >
            {labels.export}
          </Link>
        )}
      </div>
    </PageHead>
  )
}

/** A panel as the Analytics pages draw it: radius 18, the design's padding, a serif heading */
export function Panel({ title, sub, aside, children, className = '' }: { title?: string; sub?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-panel border border-line bg-sf px-[20px] py-[20px] md:px-[26px] md:py-[24px] ${className}`}>
      {title ? (
        <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
          <h2 className="m-0 font-display text-[22px] font-medium">{title}</h2>
          {aside ? <span className="text-[12.5px] text-mut">{aside}</span> : null}
        </div>
      ) : null}
      {sub ? <div className="mt-[4px] text-[12.5px] text-mut">{sub}</div> : null}
      {children}
    </section>
  )
}

/** the design's data colours, in turn */
export const VIZ = ['bg-viz1', 'bg-viz2', 'bg-viz3', 'bg-viz4', 'bg-viz5'] as const
