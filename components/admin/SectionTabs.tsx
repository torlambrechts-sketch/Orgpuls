import type { Route } from 'next'
import Link from 'next/link'

/**
 * Pages merged under one menu entry, as tabs under the page head (X-097): the design's settings tabs
 * (`stabs`) — a soft yellow pill for the page you are on. Each tab is its own address, so a link,
 * the back button and a bookmark keep working.
 */
export function SectionTabs({ label, items }: { label: string; items: { key: string; label: string; href: string; on: boolean; n?: number }[] }) {
  return (
    <nav aria-label={label} className="mb-[16px] flex flex-wrap gap-[2px] md:px-[18px]">
      {items.map((x) => (
        <Link
          key={x.key}
          href={x.href as Route}
          aria-current={x.on ? 'page' : undefined}
          className={`rounded-bar px-[13px] py-[7px] text-[13.5px] text-ink no-underline hover:text-ink hover:no-underline ${x.on ? 'bg-sbg font-bold' : 'font-medium hover:bg-ink/5'}`}
        >
          {x.label}
          {x.n !== undefined ? <span className="ml-[6px] text-[12px] font-semibold text-mut">{x.n}</span> : null}
        </Link>
      ))}
    </nav>
  )
}
