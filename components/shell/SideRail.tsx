'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LogoMark } from './Logo'
import { useShell } from './ShellPrefs'
import { labelOf, navState, visibleNav, type NavEntry } from '@/lib/shell/nav'

/**
 * Design 3's side navigation (bundle 3, the `sideNav` aside): a rail 220px wide, or 62px
 * with only the icons, sticky at the full height of the window. D-70.
 *
 * The same entries as the top bar (lib/shell/nav.ts), each with the design's glyph in a
 * 26px tile. The current screen's tile turns yellow; its trail keeps the soft tint. At the
 * bottom are Hjelp, which opens the same panel as the top bar's button, and the control that
 * narrows the rail. Collapsed, the labels go and the title attribute carries each name, as
 * the design has it. Each link keeps its name as its accessible name either way.
 *
 * Below `md` there is no side layout: the rail is not drawn and the header shows its top
 * nav, because a 220px rail on a phone leaves no room for the page (D-70).
 */
export function SideRail({ items, assistantFace }: { items: NavEntry[]; assistantFace: string }) {
  const t = useTranslations()
  const pathname = usePathname()
  const { prefs, setPref, panel, togglePanel } = useShell()
  const open = prefs.rail === 'open'

  return (
    <aside
      className="sticky top-0 box-border flex h-screen flex-none flex-col overflow-hidden border-r border-line bg-sf px-[10px] py-[14px] transition-[width] duration-[180ms] ease-in-out max-md:hidden"
      style={{ width: open ? 220 : 62 }}
    >
      <Link
        href="/innsikt"
        aria-label="Orgpuls"
        className="flex min-w-0 items-center gap-[10px] rounded-ctl px-[8px] py-[6px] text-left text-ink no-underline hover:text-ink hover:no-underline"
      >
        <LogoMark size={30} />
        {open ? (
          <span className="whitespace-nowrap font-display text-[19px] font-semibold tracking-[-0.01em]">Orgpuls</span>
        ) : null}
      </Link>

      <nav aria-label={t('nav.primaryAria')} className="mt-[18px] flex flex-col gap-[3px]">
        {visibleNav(items, prefs.view).map((item) => {
          const state = navState(item, pathname)
          const label = labelOf(item, prefs.view)
          return (
            <Link
              key={item.key}
              href={item.href}
              title={label}
              aria-label={item.badge ? `${label}, ${item.badgeAria}` : label}
              aria-current={state === 'current' ? 'page' : undefined}
              className={`relative flex min-w-0 items-center gap-[11px] rounded-btn border-none p-[10px] text-left text-[14px] text-ink no-underline hover:text-ink hover:no-underline ${
                state ? 'bg-sbg' : 'bg-transparent'
              } ${state === 'current' ? 'font-bold' : 'font-medium'}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] text-[13px] font-bold tracking-[.02em] ${
                  state === 'current' ? 'bg-ac' : 'bg-track'
                }`}
              >
                {item.icon}
              </span>
              {open ? <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span> : null}
              {item.badge ? (
                <span
                  aria-hidden="true"
                  className={`${open ? 'static' : 'absolute right-[4px] top-[4px]'} inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-rustbar px-[5px] text-[10.5px] font-bold leading-none text-sf`}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-[3px]">
        <button
          type="button"
          title={t('header.help')}
          aria-label={t('header.helpAria')}
          aria-expanded={panel !== null}
          onClick={togglePanel}
          className={`flex min-w-0 cursor-pointer items-center gap-[11px] rounded-btn border-none px-[10px] py-[8px] text-left text-[13.5px] font-semibold text-ink ${
            panel ? 'bg-sbg' : 'bg-transparent'
          }`}
        >
          <span
            aria-hidden="true"
            className="block h-[26px] w-[26px] flex-none rounded-[8px] bg-bg bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(/tuva/${assistantFace}.png)` }}
          />
          {open ? <span className="whitespace-nowrap">{t('header.help')}</span> : null}
        </button>
        <button
          type="button"
          title={open ? t('header.railCollapse') : t('header.railExpand')}
          aria-label={open ? t('header.railCollapse') : t('header.railExpand')}
          aria-expanded={open}
          onClick={() => setPref('rail', open ? 'closed' : 'open')}
          className="flex min-w-0 cursor-pointer items-center gap-[11px] rounded-btn border-none bg-transparent px-[10px] py-[8px] text-left text-[12.5px] font-semibold text-mut"
        >
          <span
            aria-hidden="true"
            className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] border border-line text-[13px]"
          >
            {open ? '‹' : '›'}
          </span>
          {open ? <span className="whitespace-nowrap">{t('header.railCollapseLabel')}</span> : null}
        </button>
      </div>
    </aside>
  )
}
