'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useShell } from './ShellPrefs'
import { labelOf, navState, visibleNav, type NavEntry } from '@/lib/shell/nav'

/**
 * The top bar's nav: design 3's six screens, or Oversikt and Oppsett in Enkel.
 *
 * A client component because the shell is a layout and only the client knows the current
 * route (`usePathname`). The model is lib/shell/nav.ts, shared with the side rail.
 *
 * The bundle's `<button onClick>` is the documented control substitution (D-06): an entry
 * that changes the address is a link, styled exactly as the bundle styles the button. The
 * entry is tinted when it is the screen or a screen under it, and bold only when it is the
 * screen. Kommentarer carries the badge (the count the server read; 0 draws none), with its
 * meaning spelled out for a screen reader.
 */
export function AppNav({ items, ariaLabel }: { items: NavEntry[]; ariaLabel: string }) {
  const pathname = usePathname()
  const { prefs } = useShell()

  return (
    <nav
      aria-label={ariaLabel}
      className="flex min-w-0 flex-auto gap-[2px] max-md:order-last max-md:basis-full max-md:overflow-x-auto"
    >
      {visibleNav(items, prefs.view).map((item) => {
        const state = navState(item, pathname)
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={state === 'current' ? 'page' : undefined}
            className={`flex cursor-pointer items-center gap-[7px] rounded-ctl border-none px-[13px] py-[8px] text-[14px] text-ink no-underline hover:text-ink hover:no-underline max-md:flex-none max-md:whitespace-nowrap ${
              state ? 'bg-sbg' : 'bg-transparent'
            } ${state === 'current' ? 'font-bold' : 'font-medium'}`}
          >
            {labelOf(item, prefs.view)}
            {item.badge ? (
              <>
                <span
                  aria-hidden="true"
                  className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-pill bg-rustbar px-[6px] text-[11px] font-bold leading-none text-sf"
                >
                  {item.badge}
                </span>
                <span className="sr-only">{item.badgeAria}</span>
              </>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
