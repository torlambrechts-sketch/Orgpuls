'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import { signOut } from '@/app/(app)/account-actions'

/**
 * The account chip and its menu (D-80).
 *
 * The design draws the chip — a 32px round mark with the viewer's initials — and nothing
 * behind it, because the prototype has no accounts to sign out of. A product with sign-in
 * needs the way out. So the chip is a button, drawn exactly as the design draws the mark,
 * and it opens a small menu in the header's own materials: who is signed in, Oppsett, and
 * "Logg ut". Oppsett lives only here (D-81), so on Oppsett the chip carries the ring the
 * open menu has. Nothing is offered that the product does not have — there is no
 * profile page, so there is no profile link.
 *
 * It behaves as a disclosure: Escape and a click outside close it, and focus returns to the
 * chip. "Logg ut" is a form posting to a server action, so it works before hydration too.
 */
export function AccountMenu({
  initials,
  name,
  email,
  organisation,
  role,
}: {
  initials: string | null
  name: string | null
  email: string | null
  organisation: string | null
  role: string | null
}) {
  const t = useTranslations('header.account')
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const root = useRef<HTMLDivElement>(null)
  const chip = useRef<HTMLButtonElement>(null)
  const first = useRef<HTMLAnchorElement>(null)
  // Oppsett has no nav entry (D-81), so on Oppsett the chip is what shows where you are
  const here = usePathname().startsWith('/oppsett')

  useEffect(() => {
    if (!open) return
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      chip.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  // no name on the profile: the address's first letter, so the chip is never blank
  const mark = initials ?? email?.charAt(0).toLocaleUpperCase('nb') ?? '?'
  const who = name ?? email

  return (
    <div ref={root} className="relative flex-none">
      <button
        ref={chip}
        type="button"
        aria-label={who ? t('aria', { who }) : t('ariaPlain')}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-pill border-none bg-sbg text-[12px] font-bold text-ink ${
          open || here ? 'ring-[1.5px] ring-ink' : ''
        }`}
      >
        {mark}
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[272px] rounded-panel border border-line bg-sf p-[8px] shadow-[0_18px_40px_-24px_rgba(25,21,16,.45)]"
        >
          <div className="border-b border-line px-[12px] pb-[12px] pt-[8px]">
            {name ? <span className="block truncate text-[14px] font-bold">{name}</span> : null}
            {email ? <span className="mt-[2px] block truncate text-[12.5px] text-mut">{email}</span> : null}
            {organisation || role ? (
              <span className="mt-[8px] block truncate text-[12px] font-semibold text-mut">
                {[organisation, role].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-[2px] pt-[6px]">
            <Link
              ref={first}
              href="/oppsett"
              aria-current={here ? 'page' : undefined}
              onClick={() => setOpen(false)}
              className="flex h-[38px] items-center rounded-ctl px-[12px] text-[13.5px] font-semibold text-ink no-underline hover:bg-bg hover:text-ink hover:no-underline"
            >
              {t('settings')}
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="flex h-[38px] w-full cursor-pointer items-center rounded-ctl border-none bg-transparent px-[12px] text-left text-[13.5px] font-semibold text-ink hover:bg-bg"
              >
                {t('signOut')}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
