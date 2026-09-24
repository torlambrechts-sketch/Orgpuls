'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useShell } from './ShellPrefs'

/**
 * The page frame (design 3's outermost flex row): the side rail when the side layout is
 * chosen, then a column of header, page and footer.
 *
 * It also sets `--page-w`, the page column every screen reads through `max-w-page`: 1180px
 * in the top layout, no cap in the side layout. That is the design's `pageW`, in one place
 * instead of in each screen.
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
      style={{ '--page-w': side ? 'none' : '1180px' } as CSSProperties}
    >
      {side ? rail : null}
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <div className="flex-1">{children}</div>
        {footer}
      </div>
    </div>
  )
}
