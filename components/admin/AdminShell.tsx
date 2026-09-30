'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { currentItem, groupOf, type NavGroup } from '@/lib/admin/nav'
import { Icon } from './icons'

type Labels = {
  title: string
  nav: string
  sub: string
  groups: Record<NavGroup['key'], string>
  items: Record<string, string>
  site: string
  siteName: string
  siteDomain: string
  account: string
  more: string
  openMenu: string
  closeMenu: string
  signOut: string
}

/**
 * Sentral, the admin's shell (X-095, from the design Sentral_Admin.dc): a top bar with the
 * wordmark, the five areas, the site and the account; under it a bar with the pages of the area
 * you are on; then the page, as wide as the design's 1320 px column.
 *
 * One site today (Tor, 2026-09-29): the site pill names Orgpuls and opens nothing until a second
 * product exists. The design's help button has no help behind it yet, so it is not drawn (D-162).
 * The prototype's buttons are links here, since each area and page is an address (D-06).
 *
 * Below `xl` (1280 px; `lg` until Growth made the bar eight areas wide, D-181) the areas move into
 * a sheet behind a menu button: Escape or a chosen page closes it, Tab stays inside it while it is open,
 * focus goes into it when it opens and back to the button when it closes. The sub-bar scrolls
 * sideways instead of wrapping, so the page starts where it does on a wide screen, and it opens
 * scrolled to the page you are on.
 */
export function AdminShell({
  groups,
  labels,
  role,
  email,
  signOut,
  children,
}: {
  groups: NavGroup[]
  labels: Labels
  role: string
  email: string
  signOut: (formData: FormData) => void | Promise<void>
  children: React.ReactNode
}) {
  const path = usePathname()
  const area = groupOf(groups, path)
  const current = currentItem(groups, path)
  const subs = groups.find((g) => g.key === area)?.items ?? []
  // the design's pages in the bar; the area's own extra pages behind «More» (D-165)
  const shown = subs.filter((i) => !i.more)
  const extra = subs.filter((i) => i.more)
  const inMore = extra.some((i) => i === current)
  const [sheet, setSheet] = useState(false)
  const [account, setAccount] = useState(false)
  const [more, setMore] = useState(false)
  const moreBox = useRef<HTMLDivElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const sheetPanel = useRef<HTMLDivElement>(null)
  const accountBox = useRef<HTMLDivElement>(null)
  const subNav = useRef<HTMLElement>(null)

  // a chosen page closes whatever is open
  useEffect(() => {
    setSheet(false)
    setAccount(false)
    setMore(false)
  }, [path])
  // below xl the sub-bar scrolls sideways: bring the page you are on to its middle, so arriving on
  // Growth's seventh page does not leave it off-screen. scrollLeft, not scrollIntoView, so the
  // window itself never moves.
  useEffect(() => {
    const nav = subNav.current
    if (!nav || nav.scrollWidth <= nav.clientWidth) return
    const cur = nav.querySelector<HTMLElement>('a[aria-current="page"]')
    if (!cur) return
    const n = nav.getBoundingClientRect()
    const c = cur.getBoundingClientRect()
    nav.scrollLeft += c.left + c.width / 2 - (n.left + n.width / 2)
  }, [path])
  useEffect(() => {
    if (!more) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false)
    const onClick = (e: MouseEvent) => !moreBox.current?.contains(e.target as Node) && setMore(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [more])
  useEffect(() => {
    if (!sheet) return
    sheetPanel.current?.querySelector<HTMLElement>('a,button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSheet(false)
        menuButton.current?.focus()
        return
      }
      // the sheet is modal: Tab and Shift+Tab wrap inside it instead of reaching the page behind
      if (e.key !== 'Tab' || !sheetPanel.current) return
      const items = [...sheetPanel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')]
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      const at = document.activeElement
      const inside = at instanceof Node && sheetPanel.current.contains(at)
      if (e.shiftKey && (!inside || at === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (!inside || at === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])
  useEffect(() => {
    if (!account) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAccount(false)
    const onClick = (e: MouseEvent) => !accountBox.current?.contains(e.target as Node) && setAccount(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [account])

  const initials = (email.split('@')[0] ?? '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('')
  const column = 'mx-auto w-[calc(100%-32px)] max-w-[1320px] md:w-[calc(100%-72px)]'

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-line bg-sf">
        <div className={`${column} flex h-[62px] items-center gap-[16px]`}>
          <button
            ref={menuButton}
            type="button"
            aria-label={sheet ? labels.closeMenu : labels.openMenu}
            aria-expanded={sheet}
            onClick={() => setSheet(!sheet)}
            className="-ml-[6px] inline-flex h-[36px] w-[36px] flex-none items-center justify-center rounded-ctl text-ink xl:hidden"
          >
            <Icon name={sheet ? 'close' : 'menu'} size={20} />
          </button>
          <Link href={'/admin' as Route} className="flex flex-none items-center gap-[8px] font-['Bricolage_Grotesque',system-ui,sans-serif] text-[20px] font-bold tracking-[-0.03em] text-ink no-underline hover:no-underline">
            <span aria-hidden="true" className="block h-[10px] w-[10px] rounded-pill bg-ac" />
            {labels.title}
          </Link>
          <nav aria-label={labels.nav} className="ml-[10px] hidden gap-[2px] xl:flex">
            {groups.map((g) => (
              <Link
                key={g.key}
                href={g.items[0]!.href as Route}
                aria-current={g.key === area ? 'true' : undefined}
                className={`rounded-ctl px-[13px] py-[9px] text-[15px] text-ink no-underline hover:no-underline ${g.key === area ? 'bg-sbg font-bold' : 'font-medium hover:bg-ink/5'}`}
              >
                {labels.groups[g.key]}
              </Link>
            ))}
          </nav>
          <div className="flex-1" />
          <span
            aria-label={`${labels.site}: ${labels.siteName}`}
            className="hidden h-[38px] items-center gap-[9px] rounded-ctl border border-line bg-bg pl-[10px] pr-[12px] text-[13px] font-semibold sm:flex"
          >
            <span aria-hidden="true" className="block h-[8px] w-[8px] rounded-pill bg-teal" />
            {labels.siteName}
            <span className="font-normal text-mut">{labels.siteDomain}</span>
          </span>
          <div ref={accountBox} className="relative flex-none">
            <button
              type="button"
              aria-label={`${labels.account}: ${email}`}
              aria-expanded={account}
              onClick={() => setAccount(!account)}
              className="flex h-[28px] w-[28px] items-center justify-center rounded-pill bg-sbg text-[11px] font-bold text-ink"
            >
              {initials || '·'}
            </button>
            {account ? (
              <div className="absolute right-0 top-[40px] z-[60] w-[260px] rounded-[17px] border border-line bg-sf p-[14px] shadow-[0_18px_44px_rgba(25,21,16,0.14)]">
                <span className="block truncate text-[13.5px] font-semibold" title={email}>
                  {email}
                </span>
                <span className="mt-[6px] inline-flex rounded-pill bg-ink px-[8px] py-[2px] text-[10.5px] font-bold text-bg">{role}</span>
                <form action={signOut} className="mt-[12px] border-t border-line pt-[10px]">
                  <button type="submit" className="flex w-full items-center gap-[8px] rounded-bar px-[8px] py-[7px] text-left text-[13px] font-semibold text-ink hover:bg-ink/5">
                    <Icon name="signout" />
                    {labels.signOut}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {subs.length ? (
        <div className="border-b border-line">
          <div className={`${column} flex h-[48px] items-center gap-[14px]`}>
            <span className="hidden min-w-[86px] flex-none text-[11px] uppercase tracking-[0.09em] text-mut md:block">{area ? labels.groups[area] : ''}</span>
            <nav ref={subNav} aria-label={labels.sub} className="-mx-[4px] flex min-w-0 flex-1 items-center gap-[2px] overflow-x-auto px-[4px] [scrollbar-width:none] xl:overflow-visible">
              {shown.map((i) => (
                <Link
                  key={i.key}
                  href={i.href as Route}
                  aria-current={i === current ? 'page' : undefined}
                  className={`flex-none whitespace-nowrap rounded-bar px-[13px] py-[7px] text-[13.5px] text-ink no-underline hover:no-underline ${i === current ? 'bg-sbg font-bold' : 'font-medium hover:bg-ink/5'}`}
                >
                  {labels.items[i.key] ?? i.key}
                </Link>
              ))}
              {extra.length ? (
                <div ref={moreBox} className="relative hidden flex-none xl:block">
                  <button
                    type="button"
                    aria-expanded={more}
                    onClick={() => setMore(!more)}
                    className={`flex items-center gap-[6px] whitespace-nowrap rounded-bar px-[13px] py-[7px] text-[13.5px] text-ink ${inMore ? 'bg-sbg font-bold' : 'font-medium hover:bg-ink/5'}`}
                  >
                    {inMore && current ? `${labels.more}: ${labels.items[current.key] ?? current.key}` : labels.more}
                    <Icon name="chevron" size={12} />
                  </button>
                  {more ? (
                    <div className="absolute left-0 top-[40px] z-[60] flex w-[230px] flex-col rounded-[14px] border border-line bg-sf p-[6px] shadow-[0_18px_44px_rgba(25,21,16,0.14)]">
                      {extra.map((i) => (
                        <Link
                          key={i.key}
                          href={i.href as Route}
                          aria-current={i === current ? 'page' : undefined}
                          className={`rounded-bar px-[10px] py-[8px] text-[13.5px] text-ink no-underline hover:bg-ink/5 hover:text-ink hover:no-underline ${i === current ? 'bg-sbg font-bold' : 'font-medium'}`}
                        >
                          {labels.items[i.key] ?? i.key}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </nav>
          </div>
        </div>
      ) : null}

      {sheet ? (
        <div className="fixed inset-0 z-[70] xl:hidden">
          <button type="button" aria-label={labels.closeMenu} tabIndex={-1} onClick={() => setSheet(false)} className="absolute inset-0 cursor-default border-0 bg-ink/40" />
          <div ref={sheetPanel} role="dialog" aria-modal="true" aria-label={labels.nav} className="absolute inset-y-0 left-0 flex w-[300px] max-w-[88vw] flex-col overflow-y-auto bg-sf px-[14px] py-[16px] shadow-[0_18px_44px_rgba(25,21,16,0.2)]">
            <span className="mb-[12px] flex items-center gap-[8px] px-[8px] font-['Bricolage_Grotesque',system-ui,sans-serif] text-[20px] font-bold tracking-[-0.03em]">
              <span aria-hidden="true" className="block h-[10px] w-[10px] rounded-pill bg-ac" />
              {labels.title}
            </span>
            {groups.map((g) => (
              <div key={g.key} className="mb-[10px]">
                <span className="block px-[8px] pb-[4px] pt-[6px] text-[11px] uppercase tracking-[0.09em] text-mut">{labels.groups[g.key]}</span>
                {g.items.map((i) => (
                  <Link
                    key={i.key}
                    href={i.href as Route}
                    aria-current={i === current ? 'page' : undefined}
                    className={`flex items-center gap-[10px] rounded-bar px-[8px] py-[7px] text-[14px] text-ink no-underline hover:no-underline ${i === current ? 'bg-sbg font-bold' : 'font-medium'}`}
                  >
                    <Icon name={i.icon} />
                    {labels.items[i.key] ?? i.key}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <main id="main" className={`${column} pb-[60px] pt-[26px]`}>
        {children}
      </main>
    </div>
  )
}
