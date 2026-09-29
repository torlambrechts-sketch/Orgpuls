'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { groupOf, isCurrent, RAIL_COOKIE, type NavGroup, type NavItem } from '@/lib/admin/nav'
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
 *
 * The sections are an accordion (X-093): one open at a time, the one holding the page you are on
 * when a page opens, so the rail fits the screen however many pages a section has. A closed section
 * holding the current page shows a yellow dot. Narrowed, a section is its own icon, and the open
 * one's pages follow it, indented.
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
  const [open, setOpen] = useState(() => groupOf(groups, path))
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${RAIL_COOKIE}=${next ? 'closed' : 'open'}; path=/admin; max-age=31536000; samesite=lax`
  }

  // a chosen page closes the drawer, and opens its own section
  useEffect(() => {
    setDrawer(false)
    setOpen(groupOf(groups, path))
  }, [path, groups])
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

  const link = (i: NavItem, narrow: boolean) => {
    const current = isCurrent(i, path)
    const name = labels.items[i.key] ?? i.key
    return (
      <li key={i.key}>
        <Link
          href={i.href as Route}
          title={narrow ? name : undefined}
          aria-label={narrow ? name : undefined}
          aria-current={current ? 'page' : undefined}
          className={`flex min-w-0 items-center gap-[10px] rounded-btn px-[8px] py-[3px] text-[13.5px] text-ink no-underline hover:bg-bg hover:text-ink hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-ink ${
            current ? 'bg-sbg font-bold hover:bg-sbg' : 'font-medium'
          } ${narrow ? 'justify-center' : ''}`}
        >
          <span className={`flex h-[24px] w-[24px] flex-none items-center justify-center rounded-[7px] ${current ? 'bg-ac' : 'bg-track'}`}>
            <Icon name={i.icon} size={15} />
          </span>
          {narrow ? null : <span className="min-w-0 flex-1 truncate">{name}</span>}
        </Link>
      </li>
    )
  }

  const menu = (narrow: boolean, id: string) => (
    <nav aria-label={labels.nav} className="-mx-[4px] flex min-h-0 flex-1 flex-col gap-[2px] overflow-y-auto px-[4px] pb-[8px]">
      {groups.map((g) => {
        // a section of one page is that page, with nothing to open
        if (g.items.length === 1) return <ul key={g.key} className="m-0 mb-[4px] list-none p-0">{g.items.map((i) => link(i, narrow))}</ul>
        const expanded = open === g.key
        const here = g.items.some((i) => isCurrent(i, path))
        const name = labels.groups[g.key]
        return (
          <div key={g.key} className={narrow ? 'border-t border-line pt-[2px]' : ''}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`${id}-${g.key}`}
              title={narrow ? name : undefined}
              aria-label={narrow ? name : undefined}
              onClick={() => setOpen(expanded ? null : g.key)}
              className={`flex w-full cursor-pointer items-center gap-[8px] rounded-btn border-0 bg-transparent text-left ${narrow ? '' : 'py-[5px]'} hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${
                narrow ? 'justify-center px-[8px] py-[4px]' : 'px-[10px]'
              } ${here || expanded ? 'text-ink' : 'text-mut hover:text-ink'}`}
            >
              {narrow ? (
                <span className={`relative flex h-[24px] w-[24px] flex-none items-center justify-center rounded-[7px] ${expanded ? 'bg-ink text-bg' : 'bg-track'}`}>
                  <Icon name={g.icon} />
                  {here && !expanded ? <span aria-hidden="true" className="absolute -right-[2px] -top-[2px] h-[8px] w-[8px] rounded-full border border-sf bg-ac" /> : null}
                </span>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[10.5px] font-bold uppercase tracking-[0.1em]">{name}</span>
                  {here && !expanded ? <span aria-hidden="true" className="h-[7px] w-[7px] flex-none rounded-full bg-ac" /> : null}
                  <span className="flex-none text-[11px] font-semibold tabular-nums text-mut">{g.items.length}</span>
                  <span className={`flex flex-none transition-transform duration-[150ms] ${expanded ? '' : '-rotate-90'}`}>
                    <Icon name="chevron" size={14} />
                  </span>
                </>
              )}
            </button>
            {expanded ? (
              <ul id={`${id}-${g.key}`} className={`m-0 mb-[6px] mt-[2px] flex list-none flex-col gap-[1px] p-0 ${narrow ? '' : 'ml-[4px] border-l border-line pl-[4px]'}`}>
                {g.items.map((i) => link(i, narrow))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </nav>
  )

  // the footer on one line: who is signed in, and signing out
  const foot = (narrow: boolean) => (
    <div className={`mt-auto flex flex-none items-center gap-[8px] border-t border-line pt-[10px] ${narrow ? 'justify-center' : 'pl-[10px]'}`}>
      {narrow ? null : (
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center rounded-pill bg-ink px-[8px] py-[2px] text-[10.5px] font-bold text-bg">{role}</span>
          <span className="mt-[2px] block truncate text-[11.5px] text-mut" title={email}>
            {email}
          </span>
        </div>
      )}
      <form action={signOut} className="flex-none">
        <button
          type="submit"
          title={labels.signOut}
          aria-label={labels.signOut}
          className="flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-btn border-0 bg-transparent text-link hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          <Icon name="signout" />
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
            {menu(false, 'drawer')}
            {foot(false)}
          </div>
        </div>
      ) : null}

      {/* from md: the rail */}
      <aside
        className="sticky top-0 box-border hidden h-screen flex-none flex-col overflow-hidden border-r border-line bg-sf px-[10px] py-[14px] transition-[width] duration-[180ms] ease-in-out md:flex"
        style={{ width: collapsed ? 64 : 236 }}
      >
        <div className={`flex flex-none items-center ${collapsed ? 'mb-[8px] flex-col gap-[6px]' : 'mb-[14px] justify-between gap-[8px] pl-[10px]'}`}>
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
        {menu(collapsed, 'rail')}
        {foot(collapsed)}
      </aside>

      <main className="min-w-0 flex-1 px-[16px] py-[24px] md:px-[28px]">{children}</main>
    </div>
  )
}
