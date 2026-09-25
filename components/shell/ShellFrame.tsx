'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useShell } from './ShellPrefs'

/**
 * The page frame (design 3's outermost flex row): the side rail when the side layout is
 * chosen, then a column of header, page and footer.
 *
 * It also sets `--page-w`, the page column every screen reads through `max-w-page`: 1180px
 * in the top layout, no cap in the side layout. That is the design's `pageW`, in one place
 * instead of in each screen. `--overview-w` is Oversikt's narrower column, the design's
 * `ovW`: 880px, or 1040px beside the rail.
 */
export function ShellFrame({
  rail,
  header,
  footer,
  children,
}: {
  rail: ReactNode
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  const { prefs } = useShell()
  const side = prefs.layout === 'side'
  return (
    <div
      className="flex min-h-screen items-stretch"
      style={{ '--page-w': side ? 'none' : '1180px', '--overview-w': side ? '1040px' : '880px' } as CSSProperties}
    >
      {/*
        The chrome sits in `display: contents` wrappers: no box of their own, so the layout is
        exactly as before, and `print:hidden` drops the rail, the header and the footer from a
        printed report or agreement. globals.css's `body > div > header` rule no longer reached
        them once the shell nested its column one level deeper.
      */}
      {side ? <div className="contents print:hidden">{rail}</div> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="contents print:hidden">{header}</div>
        {/*
          A block, not the prototype's flex column. There each screen shrinks to its own
          longest line (auto margins in a column flexbox), so a page's width depends on its
          content: Innsikt is 1160px wide in the design because of one paragraph, and a
          screen without that paragraph collapses. Every screen takes the page column (D-71).
        */}
        <div className="flex-1">{children}</div>
        <div className="contents print:hidden">{footer}</div>
      </div>
    </div>
  )
}
