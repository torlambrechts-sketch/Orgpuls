'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { isCurrent, RAIL_COOKIE, type NavGroup } from '@/lib/admin/nav'
import { Icon } from './icons'

type Labels = {
  title: string
  nav: string
  groups: Record<NavGroup['key'], string>
  items: Record<string, string>
  collapse: string
  expand: string
  openMenu: string
  closeMenu: string
  signOut: string
}

/**
 * The admin's shell (X-091): the menu in sections — Overview, Customers, CRM, Content, Platform —
 * each page with its icon, in the product rail's language (components/shell/SideRail.tsx): a 26px
 * tile, the track tint at rest, yellow for the page you are on. The rail narrows to its icons and
 * stays so (a cookie, so the server draws it as it was left); narrowed, a section is a hairline
 * and each icon's name is its title and accessible name.
 *
 * Below `md` the menu is a drawer behind a button in a top bar: Escape or a chosen page closes it,
 * and focus goes into it when it opens and back to the button when it closes.
 */
export function AdminShell({
  groups,
  collapsed: initial,
  labels,
  role,
  email,
  signOut,
  children,
}: {
  groups: NavGroup[]
  collapsed: boolean
  labels: Labels
  role: string
  email: string
  signOut: (formData: FormData) => void | Promise<void>
  children: React.ReactNode
}) {
  const path = usePathname()
  const [collapsed, setCollapsed] = useState(initial)
  const [drawer, setDrawer] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${RAIL_COOKIE}=${next ? 'closed' : 'open'}; path=/admin; max-age=31536000; samesite=lax`
  }

  // a chosen page closes the drawer
  useEffect(() => setDrawer(false), [path])
  useEffect(() => {
    if (!drawer) return
    panel.current?.querySelector<HTMLElement>('a,button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawer(false)
        button.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  const menu = (narrow: boolean) => (
    <nav aria-label={labels.nav} className="flex flex-col">
      {groups.map((g, gi) => (
        <div key={g.key} className={gi ? (narrow ? 'mt-[8px] border-t border-line pt-[8px]' : 'mt-[14px]') : ''}>
          {narrow ? null : (
            <span className="mb-[4px] block px-[10px] text-[10.5px] font-bold uppercase tracking-[0.1em] text-mut">{labels.groups[g.key]}</span>
          )}
          <ul className="m-0 flex list-none flex-col gap-[2px] p-0">
            {g.items.map((i) => {
              const current = isCurrent(i, path)
              const name = labels.items[i.key] ?? i.key
              return (
                <li key={i.key}>
                  <Link
                    href={i.href as Route}
                    title={narrow ? name : undefined}
                    aria-label={narrow ? name : undefined}
                    aria-current={current ? 'page' : undefined}
                    className={`flex min-w-0 items-center gap-[10px] rounded-btn px-[8px] py-[6px] text-[13.5px] text-ink no-underline hover:bg-bg hover:text-ink hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-ink ${
                      current ? 'bg-sbg font-bold hover:bg-sbg' : 'font-medium'
                    } ${narrow ? 'justify-center' : ''}`}
                  >
                    <span className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] ${current ? 'bg-ac' : 'bg-track'}`}>
                      <Icon name={i.icon} />
                    </span>
                    {narrow ? null : <span className="min-w-0 flex-1 truncate">{name}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )

  const foot = (narrow: boolean) => (
    <div className={`mt-auto border-t border-line pt-[12px] ${narrow ? 'flex flex-col items-center gap-[6px]' : ''}`}>
      {narrow ? null : (
        <div className="px-[10px]">
          <span className="inline-flex items-center rounded-pill bg-ink px-[9px] py-[3px] text-[11px] font-bold text-bg">{role}</span>
          <span className="mt-[4px] block truncate text-[11.5px] text-mut">{email}</span>
        </div>
      )}
      <form action={signOut} className={narrow ? '' : 'mt-[8px]'}>
        <button
          type="submit"
          title={narrow ? labels.signOut : undefined}
          aria-label={narrow ? labels.signOut : undefined}
          className={`flex cursor-pointer items-center gap-[10px] rounded-btn border-0 bg-transparent px-[8px] py-[6px] text-[13px] font-semibold text-link hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${narrow ? 'justify-center' : 'w-full'}`}
        >
          <span className="flex h-[26px] w-[26px] flex-none items-center justify-center">
            <Icon name="signout" />
          </span>
          {narrow ? null : labels.signOut}
        </button>
      </form>
    </div>
  )

  return (
    <div lang="en" className="min-h-screen bg-bg text-ink md:flex">
      {/* phones: a top bar and a drawer */}
      <header className="sticky top-0 z-30 flex items-center gap-[10px] border-b border-line bg-sf px-[14px] py-[10px] md:hidden">
        <button
          ref={button}
          type="button"
          aria-expanded={drawer}
          aria-controls="admin-drawer"
          aria-label={drawer ? labels.closeMenu : labels.openMenu}
          onClick={() => setDrawer((d) => !d)}
          className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-ctl border border-line bg-bg text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          <Icon name={drawer ? 'close' : 'menu'} size={18} />
        </button>
        <span className="font-display text-[18px] font-semibold">{labels.title}</span>
      </header>
      {drawer ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label={labels.closeMenu} tabIndex={-1} onClick={() => setDrawer(false)} className="absolute inset-0 cursor-default border-0 bg-ink/30" />
          <div
            id="admin-drawer"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={labels.nav}
            className="absolute inset-y-0 left-0 flex w-[272px] max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-sf px-[10px] py-[14px]"
          >
            <span className="mb-[12px] block px-[10px] font-display text-[19px] font-semibold">{labels.title}</span>
            {menu(false)}
            {foot(false)}
          </div>
        </div>
      ) : null}

      {/* from md: the rail */}
      <aside
        className="sticky top-0 box-border hidden h-screen flex-none flex-col overflow-y-auto overflow-x-hidden border-r border-line bg-sf px-[10px] py-[14px] transition-[width] duration-[180ms] ease-in-out md:flex"
        style={{ width: collapsed ? 64 : 236 }}
      >
        <div className={`mb-[14px] flex items-center gap-[8px] ${collapsed ? 'flex-col' : 'justify-between pl-[10px]'}`}>
          {collapsed ? (
            <span aria-hidden="true" className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-ink font-display text-[16px] font-semibold text-bg">
              O
            </span>
          ) : (
            <span className="truncate font-display text-[19px] font-semibold">{labels.title}</span>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? labels.expand : labels.collapse}
            title={collapsed ? labels.expand : labels.collapse}
            className="flex h-[28px] w-[28px] flex-none cursor-pointer items-center justify-center rounded-[8px] border border-line bg-bg text-mut hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            <Icon name={collapsed ? 'expand' : 'collapse'} size={14} />
          </button>
        </div>
        {menu(collapsed)}
        {foot(collapsed)}
      </aside>

      <main className="min-w-0 flex-1 px-[16px] py-[24px] md:px-[28px]">{children}</main>
    </div>
  )
}
