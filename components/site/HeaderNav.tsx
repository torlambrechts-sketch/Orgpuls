'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useState } from 'react'

type Item = { href: string; label: string }

/**
 * The public header's menu (D-88; nettside/*.dc.html line 32-34): five links after the
 * logo, the page you are on in the soft-yellow pill.
 *
 * From 1024px it is the design's row. Below that the design lets the row wrap into three
 * lines of a sticky header; here it folds into "Meny" instead, as it did before (D-85), so a
 * phone keeps one row of header and the page starts under it.
 */
export function HeaderNav({
  items,
  label,
  menuLabel,
  account,
}: {
  items: Item[]
  label: string
  menuLabel: string
  account: Item[]
}) {
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

  // "Pris" is a section of the start page, so it is never the page you are on
  const current = (href: string) => !href.includes('#') && (pathname === href || pathname.startsWith(`${href}/`))

  return (
    <>
      <nav aria-label={label} className="hidden min-w-0 flex-1 flex-wrap gap-[4px] lg:flex">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href as Route}
            aria-current={current(i.href) ? 'page' : undefined}
            className={`rounded-[9px] px-[12px] py-[8px] text-[14px] font-semibold text-ink hover:text-ink ${current(i.href) ? 'bg-sbg' : ''}`}
          >
            {i.label}
          </Link>
        ))}
      </nav>
      <span className="flex-1 lg:hidden" />
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-[44px] flex-none cursor-pointer items-center gap-[8px] rounded-ctl border border-line bg-transparent px-[13px] text-[14px] font-semibold text-ink sm:h-[38px] lg:hidden"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d={open ? 'M3.5 3.5l9 9M12.5 3.5l-9 9' : 'M2 4h12M2 8h12M2 12h12'}
            stroke="#191510"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {menuLabel}
      </button>
      {open ? (
        <nav
          id={listId}
          aria-label={label}
          className="order-last flex w-full flex-col gap-[2px] border-t border-line pt-[8px] lg:hidden"
        >
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href as Route}
              aria-current={current(i.href) ? 'page' : undefined}
              onClick={() => setOpen(false)}
              className={`flex h-[44px] w-full items-center rounded-ctl px-[13px] text-[14px] font-semibold text-ink no-underline hover:text-ink hover:no-underline ${
                current(i.href) ? 'bg-sbg' : 'hover:bg-bg'
              }`}
            >
              {i.label}
            </Link>
          ))}
          <span className="mt-[6px] flex gap-[9px] border-t border-line pt-[10px] sm:hidden">
            {account.map((a, n) => (
              <Link
                key={a.href}
                href={a.href as Route}
                onClick={() => setOpen(false)}
                className={`inline-flex h-[44px] flex-1 items-center justify-center rounded-ctl border px-[15px] text-[14px] text-ink no-underline hover:text-ink hover:no-underline ${
                  n === account.length - 1 ? 'border-ink bg-ac font-bold' : 'border-line font-semibold'
                }`}
              >
                {a.label}
              </Link>
            ))}
          </span>
        </nav>
      ) : null}
    </>
  )
}
