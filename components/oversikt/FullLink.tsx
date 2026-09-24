'use client'

import type { ReactNode } from 'react'
import { useShell } from '@/components/shell/ShellPrefs'

/**
 * A link from Oversikt to a screen that only Full has. It is a real link (middle-click,
 * a screen reader's link list), and a plain click also switches the view to Full, as the
 * prototype's `viewMode:"full"` does, so the screen arrives with the nav that reaches it.
 * The bundle's `<button>` is the documented control substitution (D-06).
 */
export function FullLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const { goFull } = useShell()
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        goFull(href)
      }}
    >
      {children}
    </a>
  )
}
