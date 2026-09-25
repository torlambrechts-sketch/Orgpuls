'use client'

import { useEffect, useState } from 'react'

/**
 * The strip of section links under the header on a subpage (D-88; Plattform.dc.html lines
 * 41-49). It sticks under the header, and the section you are reading is bold and
 * underlined: the last one whose top has passed 130px, as the design computes it. A link
 * scrolls to its section 118px below the top, so the heading clears both sticky bars.
 *
 * The links are real `#id` anchors: without JavaScript they still go to the section.
 */
export function SectionNav({ label, items }: { label: string; items: { id: string; label: string }[] }) {
  const [active, setActive] = useState('')

  useEffect(() => {
    const onScroll = () => {
      let cur = ''
      for (const s of items) {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= 130) cur = s.id
      }
      setActive(cur)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [items])

  return (
    <div className="sticky top-[71px] z-30 border-b border-line bg-[rgba(252,246,233,.94)] backdrop-blur-[6px] sm:top-[65px]">
      <div className="mx-auto max-w-[1120px] overflow-x-auto px-[26px] [scrollbar-width:none]">
        <nav aria-label={label} className="flex min-w-max gap-[2px]">
          {items.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={active === s.id ? 'location' : undefined}
              onClick={(e) => {
                const el = document.getElementById(s.id)
                if (!el) return
                e.preventDefault()
                window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 118)
                history.replaceState(null, '', `#${s.id}`)
              }}
              className={`block whitespace-nowrap border-b-2 px-[9px] pb-[11px] pt-[13px] text-[12px] text-ink no-underline hover:text-ink hover:no-underline ${
                active === s.id ? 'border-ink font-bold' : 'border-transparent font-medium'
              }`}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  )
}
