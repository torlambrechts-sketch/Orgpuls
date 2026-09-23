'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'

/**
 * The header's five nav items.
 *
 * Split out of AppHeader as a client component for one reason: the shell is a layout,
 * so it renders once for every screen underneath it and cannot be told which screen
 * that is through props without threading the value through each page. `usePathname`
 * reads it where it is actually known.
 *
 * Two behaviours from the bundle that are easy to miss and are deliberate:
 *
 * 1. Målinger stays tinted while you are on a screen reached from it — the result,
 *    respondent preview, måleoppsett or årshjul — because the design keeps the trail
 *    visible (bundle line 95).
 * 2. The bold weight is applied only on an exact match, so a tinted Målinger and a
 *    current Målinger remain distinguishable.
 *
 * The bundle uses a <button onClick> here because a prototype has no router. This is
 * the documented control substitution (D-06): a nav item that changes the address is a
 * link, which is what makes middle-click, back, and a screen reader's link list work.
 * It is styled exactly as the bundle styles that button, and the global anchor colour
 * and hover underline are overridden so the rendering is unchanged.
 *
 * An item whose screen does not exist yet carries no href and renders as the same
 * element with aria-disabled, rather than linking to a 404. It stays focusable, so the
 * tab order matches the finished nav, and it becomes a link the moment its route lands.
 */
export type NavItem = { href?: Route; label: string }

/** Routes that keep Målinger tinted without being Målinger. */
const UNDER_MEASURE = ['/malinger/', '/resultat']

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="flex min-w-0 flex-1 gap-[2px] max-md:order-last max-md:basis-full max-md:overflow-x-auto">
      {items.map((item) => {
        const exact = pathname === item.href
        const tinted =
          exact ||
          (item.href === '/malinger' && UNDER_MEASURE.some((p) => pathname.startsWith(p)))
        const className = `cursor-pointer rounded-ctl border-none px-[13px] py-[8px] text-[14px] text-ink no-underline hover:text-ink hover:no-underline max-md:flex-none max-md:whitespace-nowrap ${
          tinted ? 'bg-sbg' : 'bg-transparent'
        } ${exact ? 'font-bold' : 'font-medium'}`

        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            aria-current={exact ? 'page' : undefined}
            className={className}
          >
            {item.label}
          </Link>
        ) : (
          <button key={item.label} type="button" aria-disabled="true" className={className}>
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
