'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The design's modal (Sentral_Admin.dc, `modal`): a dimmed page, a 560 px panel at radius 22 with
 * a display-face title, a lead and a round close button. Escape or a click outside closes it; focus
 * moves into it when it opens, stays in it while open, and goes back where it came from.
 */
export function Modal({
  open,
  onClose,
  title,
  sub,
  closeLabel,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  sub?: string
  closeLabel: string
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const back = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>('input:not([type=hidden]),select,textarea,button:not([data-close])')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab' || !panel.current) return
      const all = [...panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([type=hidden]),select,textarea')]
      if (!all.length) return
      const [a, z] = [all[0]!, all[all.length - 1]!]
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault()
        z.focus()
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault()
        a.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      back?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/[.42] p-[24px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[88vh] w-full max-w-[560px] animate-ht-in overflow-y-auto rounded-[22px] border border-line bg-sf p-[26px] shadow-[0_34px_80px_rgba(25,21,16,0.3)]"
      >
        <div className="flex items-start justify-between gap-[16px]">
          <div>
            <h2 className="m-0 font-display text-[25px] font-medium leading-[1.15] [text-wrap:balance]">{title}</h2>
            {sub ? <p className="mb-0 mt-[6px] text-[13px] text-mut [text-wrap:pretty]">{sub}</p> : null}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            className="flex h-[36px] w-[36px] flex-none cursor-pointer items-center justify-center rounded-pill border border-line bg-transparent text-[18px] text-ink"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
