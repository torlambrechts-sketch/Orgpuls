import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'

/**
 * The frame Resultater and Kommentarer share (v3 2234-2285): the kicker and title, what
 * stands to the right of them, the chip rows, and the Resultat / Kommentarer / Tiltak →
 * tabs. In the prototype Kommentarer is a tab of Resultater with its own nav entry; here
 * it is its own route under the same frame, so a comment link is an address.
 *
 * The tabs are navigation, so they are links styled as the design's tab buttons (D-06).
 */
export async function ResultaterShell({
  kicker,
  title,
  stats,
  chips,
  active,
  resultHref,
  unanswered,
  planCount,
  children,
}: {
  kicker: string
  title: string
  stats?: ReactNode
  chips?: ReactNode
  active: 'result' | 'comments'
  resultHref: Route
  unanswered: number
  planCount: number
  children: ReactNode
}) {
  const t = await getTranslations('resultater')
  return (
    <main className="mx-auto max-w-page animate-ht-in px-[28px] pb-[60px] pt-[30px] max-sm:px-[16px]">
      <div className="border-b border-line">
        <div className="flex flex-wrap items-end justify-between gap-x-[24px] gap-y-[12px]">
          <span>
            <span className="block text-[11px] uppercase tracking-[.11em] text-mut">{kicker}</span>
            <h1 className="mt-[6px] block font-display text-[32px] font-semibold leading-[1.1]">{title}</h1>
          </span>
          {stats}
        </div>
        {chips}
        <nav className="mt-[16px] flex gap-[6px] overflow-x-auto" aria-label={t('tabsAria')}>
          <Tab href={resultHref} on={active === 'result'} label={t('tab.result')} />
          <Tab href={'/kommentarer' as Route} on={active === 'comments'} label={t('tab.comments')} n={unanswered} />
          <Tab href={'/tiltak' as Route} label={t('tab.plan')} n={planCount} />
        </nav>
      </div>
      <div className="pt-[22px]">{children}</div>
    </main>
  )
}

function Tab({ href, label, n, on = false }: { href: Route; label: string; n?: number; on?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-[8px] whitespace-nowrap border-b-[3px] px-[16px] pb-[12px] pt-[10px] text-[14.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
        on ? 'border-ink font-bold text-ink' : 'border-transparent font-medium text-mut'
      }`}
    >
      {label}
      {n ? <span className="rounded-pill bg-ac px-[8px] py-[2px] text-[11px] font-bold text-ink">{n}</span> : null}
    </Link>
  )
}
