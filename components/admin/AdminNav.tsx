'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** The admin's sections, the one you are in marked (D-90). */
export function AdminNav({ items, label }: { items: { href: string; label: string }[]; label: string }) {
  const path = usePathname()
  const current = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`))
  return (
    <nav aria-label={label} className="flex flex-col gap-[2px] max-md:flex-row max-md:flex-wrap">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href as Route}
          aria-current={current(i.href) ? 'page' : undefined}
          className={`rounded-ctl px-[12px] py-[9px] text-[13.5px] font-semibold text-ink no-underline hover:text-ink hover:no-underline ${
            current(i.href) ? 'bg-sbg' : 'hover:bg-bg'
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
