'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { isV3Route } from '@/lib/site/nav'

type Page = { href: string; label: string }
type Item = Page & { children?: Page[]; /** the parent's own page, first in its panel */ all?: string }

/** A header control drawn as nettside-v3 draws «Logg inn» (line 43): 38px, r10, 0 13px, 14px/600, no border */
const QUIET =
  'min-h-[38px] items-center whitespace-nowrap rounded-ctl px-[13px] text-[14px] font-semibold text-ink no-underline hover:text-ink hover:no-underline'
/** A menu item (line 37-40): r9, 8/10, 14px; 600, or 700 on soft yellow for the page you are on */
const ITEM = 'whitespace-nowrap rounded-[9px] px-[10px] py-[8px] text-[14px] text-ink no-underline hover:text-ink hover:no-underline'

/**
 * The public header (D-190; nettside-v3/*.dc.html, `data-screen-label="Topp"` and `"Nav"`): the
 * mint band's top with the floating header card — the logo, Plattform · Bruksområder · Bransjer ▾ ·
 * Pris, and «Se demo», «Logg inn» and «Prøv gratis →». It sits outside `<main>`; on the five v3
 * pages the page's own `SiteTop` continues the band under it with the hero, and elsewhere the band
 * closes 18px under the card.
 *
 * - «Prøv gratis →» goes to the page's start band (`#kom-i-gang`) on the v3 pages, else to /registrer.
 * - «Bransjer ▾» opens its pages on every page (the design draws the ▾ on the front page only).
 * - Below 1024px the menu, «Se demo» and «Logg inn» fold into «Meny» (the design's sideways
 *   scroller hid Bransjer and Pris off-screen on a phone); below 640px «Prøv gratis →» goes in too.
 * - The front page's header sticks 12px from the top, with the product shots' shadow, while the top
 *   band (`[data-site-band]`, the hero) is in view, as the design's `position:sticky` inside its band
 *   does. The header is outside the band's element here, so a small script holds it: fixed while it
 *   would stick, back in place once the band has passed. Without the script it simply scrolls away.
 *   It stays put on screens 500px tall or less (G-10), and sets `--site-sticky` for
 *   `scroll-padding-top` while stuck (G-09).
 */
export function SiteHeader({
  items,
  label,
  menu,
  demo,
  signIn,
  cta,
}: {
  items: Item[]
  label: string
  menu: string
  demo: string
  signIn: string
  cta: string
}) {
  const pathname = usePathname()
  const front = pathname === '/'
  const ctaHref = isV3Route(pathname) ? '#kom-i-gang' : '/registrer'
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const menuButton = useRef<HTMLButtonElement>(null)
  const stuck = useStick(front)

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      menuButton.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const at = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const current = (i: Item) => at(i.href) || !!i.children?.some((c) => at(c.href))
  // "page" on the page itself; on a page under it (an industry page) the item is the current one of
  // its set, so the page's own breadcrumb is not contradicted
  const ariaCurrent = (href: string) => (pathname === href ? 'page' : at(href) ? 'true' : undefined)

  return (
    <div data-screen-label="Topp" className={`bg-mint px-[18px] pt-[18px] max-sm:px-[16px] ${isV3Route(pathname) ? '' : 'pb-[18px]'}`}>
      <div ref={stuck.slot} style={stuck.slotStyle}>
        <div ref={stuck.frame} style={stuck.frameStyle} className={front ? 'z-40' : undefined}>
          <header className="mx-auto w-full max-w-[1120px]">
            <div
              className={`relative flex flex-wrap items-center gap-[18px] rounded-panel border border-line bg-sf py-[10px] pl-[16px] pr-[12px] max-lg:gap-[12px] ${
                front ? 'shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)]' : ''
              }`}
            >
              <Link
                href="/"
                aria-current={pathname === '/' ? 'page' : undefined}
                className="flex flex-none items-center text-ink no-underline hover:text-ink hover:no-underline"
              >
                <SiteLogo />
              </Link>

              <nav aria-label={label} className="hidden min-w-0 flex-1 flex-nowrap lg:flex">
                {items.map((i) =>
                  i.children ? (
                    <SubMenu key={i.href} item={i} here={current(i)} at={at} pathname={pathname} />
                  ) : (
                    <Link
                      key={i.href}
                      href={i.href as Route}
                      aria-current={ariaCurrent(i.href)}
                      className={`${ITEM} flex-none ${current(i) ? 'bg-sbg font-bold' : 'font-semibold'}`}
                    >
                      {i.label}
                    </Link>
                  ),
                )}
              </nav>
              <span className="flex-1 lg:hidden" />
              <button
                ref={menuButton}
                type="button"
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen((o) => !o)}
                className="inline-flex min-h-[44px] flex-none cursor-pointer items-center gap-[8px] rounded-ctl border border-line bg-transparent px-[13px] text-[14px] font-semibold text-ink sm:min-h-[38px] lg:hidden"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d={open ? 'M3.5 3.5l9 9M12.5 3.5l-9 9' : 'M2 4h12M2 8h12M2 12h12'} stroke="#191510" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {menu}
              </button>
              <span className="flex flex-none items-center gap-[8px] max-sm:hidden">
                <Link href="/demo" className={`${QUIET} hidden lg:flex`}>
                  {demo}
                </Link>
                <Link href="/logg-inn" className={`${QUIET} hidden lg:flex`}>
                  {signIn}
                </Link>
                <a
                  href={ctaHref}
                  className="flex min-h-[38px] items-center gap-[8px] whitespace-nowrap rounded-ctl border border-ink bg-ac px-[16px] text-[14px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
                >
                  {cta} <span aria-hidden="true">→</span>
                </a>
              </span>

              {/* below 1024px: the menu, folded; it is in the card, under the row */}
              <nav id={menuId} aria-label={label} hidden={!open} className="order-last w-full flex-col gap-[2px] border-t border-line pt-[8px] lg:hidden [&:not([hidden])]:flex">
                {items.map((i) => {
                  const row = (x: Page, sub: boolean) => (
                    <Link
                      key={x.href}
                      href={x.href as Route}
                      aria-current={ariaCurrent(x.href)}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-[44px] w-full items-center rounded-ctl text-[14px] font-semibold text-ink no-underline hover:text-ink hover:no-underline ${
                        sub ? 'pl-[27px] pr-[13px]' : 'px-[13px]'
                      } ${at(x.href) ? 'bg-sbg' : 'hover:bg-bg'}`}
                    >
                      {sub ? <span aria-hidden="true" className="mr-[10px] h-[14px] w-px flex-none bg-line" /> : null}
                      {x.label}
                    </Link>
                  )
                  if (!i.children) return row(i, false)
                  // the indented pages are a group named by their parent, so the hierarchy is not only visual
                  return (
                    <Fragment key={i.href}>
                      {row(i, false)}
                      <div role="group" aria-label={i.label} className="flex flex-col gap-[2px]">
                        {i.children.map((c) => row(c, true))}
                      </div>
                    </Fragment>
                  )
                })}
                <span className="mt-[6px] flex flex-col gap-[2px] border-t border-line pt-[8px]">
                  {[
                    { href: '/demo', label: demo },
                    { href: '/logg-inn', label: signIn },
                  ].map((a) => (
                    <Link
                      key={a.href}
                      href={a.href as Route}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[44px] w-full items-center rounded-ctl px-[13px] text-[14px] font-semibold text-ink no-underline hover:bg-bg hover:text-ink hover:no-underline"
                    >
                      {a.label}
                    </Link>
                  ))}
                  <a
                    href={ctaHref}
                    onClick={() => setOpen(false)}
                    className="mt-[6px] flex min-h-[44px] w-full items-center justify-center gap-[8px] rounded-ctl border border-ink bg-ac px-[16px] text-[14px] font-bold text-ink no-underline hover:text-ink hover:no-underline sm:hidden"
                  >
                    {cta} <span aria-hidden="true">→</span>
                  </a>
                </span>
              </nav>
            </div>
          </header>
        </div>
      </div>
    </div>
  )
}

/**
 * Bransjer ▾: a disclosure, its panel right after the button in the DOM and the tab order. Escape
 * and a click or focus outside close it, Escape returns focus to the button, and it closes when the
 * page changes. Choosing the page you are already on returns focus to the button too.
 */
function SubMenu({ item, here, at, pathname }: { item: Item; here: boolean; at: (href: string) => boolean; pathname: string }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const outside = (n: EventTarget | null) => !root.current?.contains(n as Node)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    const onDown = (e: PointerEvent) => outside(e.target) && setOpen(false)
    const onFocus = (e: FocusEvent) => outside(e.target) && setOpen(false)
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
    <div ref={root} className="relative flex-none">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-current={pathname === item.href ? 'page' : here ? 'true' : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`${ITEM} inline-flex cursor-pointer items-center gap-[6px] border-none ${here || open ? 'bg-sbg' : 'bg-transparent'} ${
          here ? 'font-bold' : 'font-semibold'
        }`}
      >
        {item.label} <span aria-hidden="true" className="text-[10px]">▾</span>
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
              aria-current={pathname === l.href ? 'page' : undefined}
              onClick={() => {
                setOpen(false)
                // the page you are on does not navigate, so the focused link would vanish with the
                // panel and leave focus on the page: give it back to the button
                if (pathname === l.href) button.current?.focus()
              }}
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

/**
 * The front page's sticky header. `slot` keeps the header's place in the band; `frame` is fixed 12px
 * from the top while the slot has scrolled above that and the top band's content is still below the
 * header, then rides up with the band's end, then goes back into its slot (off-screen by then).
 */
function useStick(on: boolean) {
  const slot = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const root = document.documentElement
    if (!on) {
      root.style.setProperty('--site-sticky', '0px')
      return
    }
    let raf = 0
    const short = window.matchMedia('(max-height: 500px)')
    const update = () => {
      raf = 0
      const s = slot.current
      const f = frame.current
      const band = document.querySelector<HTMLElement>('[data-site-band]')
      if (!s || !f || !band || short.matches) return setPos(null)
      const r = s.getBoundingClientRect()
      const h = f.offsetHeight
      const end = band.getBoundingClientRect().bottom - parseFloat(getComputedStyle(band).paddingBottom || '0')
      const top = Math.min(12, end - h)
      const next = r.top >= 12 || top <= -h ? null : { top, left: r.left, width: r.width, height: h }
      root.style.setProperty('--site-sticky', next && top === 12 ? `${h + 20}px` : '0px')
      setPos((p) => (p === next || (p && next && p.top === next.top && p.left === next.left && p.width === next.width && p.height === next.height) ? p : next))
    }
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    const watch = new ResizeObserver(queue)
    if (frame.current) watch.observe(frame.current)
    window.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('resize', queue)
    short.addEventListener('change', queue)
    update()
    return () => {
      cancelAnimationFrame(raf)
      watch.disconnect()
      window.removeEventListener('scroll', queue)
      window.removeEventListener('resize', queue)
      short.removeEventListener('change', queue)
      root.style.setProperty('--site-sticky', '0px')
    }
  }, [on])

  const slotStyle: CSSProperties | undefined = pos ? { height: pos.height } : undefined
  const frameStyle: CSSProperties | undefined = pos ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width } : undefined
  return { slot, frame, slotStyle, frameStyle }
}

/**
 * The design system's Logo at the header's size (_ds_bundle.js `Logo`, size 31, wordmark 20,
 * radius 10): the pulse mark in a 1.5px ink square on the card colour, 9px from the Playfair
 * wordmark. The path data is the design's.
 */
function SiteLogo() {
  return (
    <span className="flex flex-none items-center gap-[9px] text-ink">
      <span className="flex h-[31px] w-[31px] flex-none items-center justify-center rounded-ctl border-[1.5px] border-ink bg-sf">
        <svg width="20" height="12" viewBox="0 0 20 12" fill="none" aria-hidden="true" className="block">
          <path d="M1 6.2h3.6l1.7-4.4 2.9 8.8 1.9-4.4h2.4" stroke="#191510" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="17" cy="6.2" r="1.9" fill="#191510" />
        </svg>
      </span>
      <span className="whitespace-nowrap font-display text-[20px] font-semibold tracking-[-0.01em]">Orgpuls</span>
    </span>
  )
}
