'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

type Item = { href: string; label: string; children?: Item[]; /** the parent's own page, as the panel's first link */ all?: string }

/**
 * The public header's menu (D-88; nettside/*.dc.html line 32-34): five links after the
 * logo, the page you are on in the soft-yellow pill.
 *
 * From 1024px it is the design's row. Below that the design lets the row wrap into three
 * lines of a sticky header; here it folds into "Meny" instead, as it did before (D-85), so a
 * phone keeps one row of header and the page starts under it.
 *
 * An item with pages under it (Bransjer, D-129) is a disclosure in the row: a button drawn as
 * the links are, opening a small panel in the account menu's materials. In "Meny" its pages
 * are listed under it, indented. Either way it is in the pill on any of its pages.
 */
export function HeaderNav({
  items,
  label,
  menuLabel,
  account,
  language,
}: {
  items: Item[]
  label: string
  menuLabel: string
  account: Item[]
  /** the language switch, at the foot of the phone menu (D-96) */
  language?: ReactNode
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
  const at = (href: string) => !href.includes('#') && (pathname === href || pathname.startsWith(`${href}/`))
  const current = (i: Item) => at(i.href) || !!i.children?.some((c) => at(c.href))

  return (
    <>
      <nav aria-label={label} className="hidden min-w-0 flex-1 flex-wrap gap-[4px] lg:flex">
        {items.map((i) =>
          i.children ? (
            <SubMenu key={i.href} item={i} here={current(i)} at={at} pathname={pathname} />
          ) : (
            <Link
              key={i.href}
              href={i.href as Route}
              aria-current={at(i.href) ? 'page' : undefined}
              className={`rounded-[9px] px-[12px] py-[8px] text-[14px] font-semibold text-ink hover:text-ink ${at(i.href) ? 'bg-sbg' : ''}`}
            >
              {i.label}
            </Link>
          ),
        )}
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
          {items.flatMap((i) => [i, ...(i.children ?? []).map((c) => ({ ...c, sub: true }))]).map((i) => {
            const sub = 'sub' in i
            // a parent is in the pill only on its own page here: its pages are listed under it
            const on = at(i.href)
            return (
              <Link
                key={`${sub ? 'sub:' : ''}${i.href}`}
                href={i.href as Route}
                aria-current={on ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={`flex h-[44px] w-full items-center rounded-ctl text-[14px] font-semibold text-ink no-underline hover:text-ink hover:no-underline ${
                  sub ? 'pl-[27px] pr-[13px]' : 'px-[13px]'
                } ${on ? 'bg-sbg' : 'hover:bg-bg'}`}
              >
                {sub ? (
                  <span aria-hidden="true" className="mr-[10px] h-[14px] w-px flex-none bg-line" />
                ) : null}
                {i.label}
              </Link>
            )
          })}
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
          {language ? <span className="mt-[8px] flex sm:hidden">{language}</span> : null}
        </nav>
      ) : null}
    </>
  )
}

/**
 * One row item with pages under it. It behaves as a disclosure: Escape and a click outside
 * close it, Escape returns focus to the button, and it closes when the page changes. The
 * panel follows the button in the tab order, so no focus is moved on opening.
 */
function SubMenu({ item, here, at, pathname }: { item: Item; here: boolean; at: (href: string) => boolean; pathname: string }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onFocus = (e: FocusEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('focusin', onFocus)
    }
  }, [open])

  const links = [{ href: item.href, label: item.all ?? item.label }, ...(item.children ?? [])]
  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex cursor-pointer items-center gap-[6px] rounded-[9px] border-none px-[12px] py-[8px] text-[14px] font-semibold text-ink ${
          here || open ? 'bg-sbg' : 'bg-transparent'
        }`}
      >
        {item.label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className={open ? 'rotate-180' : ''}>
          <path d="M2 3.5l3 3 3-3" stroke="#191510" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute left-0 top-[calc(100%+8px)] z-50 flex w-[240px] flex-col gap-[2px] rounded-panel border border-line bg-sf p-[8px] shadow-[0_18px_40px_-24px_rgba(25,21,16,.45)]"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href as Route}
              aria-current={at(l.href) ? 'page' : undefined}
              onClick={() => setOpen(false)}
              className={`flex h-[38px] items-center rounded-ctl px-[12px] text-[13.5px] font-semibold text-ink no-underline hover:text-ink hover:no-underline ${
                at(l.href) ? 'bg-sbg' : 'hover:bg-bg'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
