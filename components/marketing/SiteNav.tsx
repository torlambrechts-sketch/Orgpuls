'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useState } from 'react'

/**
 * The public site's menu (D-83): Plattform, Bruksområder, Priser, Artikler, Om oss.
 *
 * The design's public header has the logo and two buttons and nothing between, because it
 * drew one page. With a site behind it, the header carries the site's sections, in the
 * application nav's own treatment — the same pill for the page you are on. On a phone the
 * row folds into a "Meny" button that opens the same links as a list; it closes when a
 * link is chosen, on any other navigation, and on Escape.
 */
export function SiteNav({ items, menuLabel }: { items: { href: string; label: string }[]; menuLabel: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const listId = useId()

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const link = (href: string, label: string, block: boolean) => (
    <Link
      key={href}
      href={href as Route}
      aria-current={current(href) ? 'page' : undefined}
      onClick={block ? () => setOpen(false) : undefined}
      className={`${block ? 'flex h-[42px] w-full' : 'inline-flex h-[36px]'} items-center rounded-ctl px-[13px] text-[14px] font-semibold text-ink no-underline hover:text-ink hover:no-underline ${
        current(href) ? 'bg-sbg' : 'hover:bg-sf'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <>
      <nav aria-label={menuLabel} className="hidden items-center gap-[2px] lg:flex">
        {items.map((i) => link(i.href, i.label, false))}
      </nav>
      <div className="lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-[38px] cursor-pointer items-center gap-[8px] rounded-ctl border border-line bg-transparent px-[13px] text-[14px] font-semibold text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d={open ? 'M3.5 3.5l9 9M12.5 3.5l-9 9' : 'M2 4h12M2 8h12M2 12h12'} stroke="#191510" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {menuLabel}
        </button>
      </div>
      {open ? (
        <nav id={listId} aria-label={menuLabel} className="order-last flex w-full flex-col gap-[2px] border-t border-line pt-[8px] lg:hidden">
          {items.map((i) => link(i.href, i.label, true))}
        </nav>
      ) : null}
    </>
  )
}
