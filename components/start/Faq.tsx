'use client'

import { useState } from 'react'

/**
 * The FAQ accordion. Orgpuls_Start.dc.html lines 232-248.
 *
 * A `<button>` per question with `aria-expanded`, which is what this control is: it
 * toggles content in place rather than navigating. The design opens the first one on load
 * and this keeps that — a closed accordion looks like a list of links nobody has written
 * the answers to.
 */
export function Faq({ items }: { items: { key: string; q: string; a: string }[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.key ?? null)

  return (
    <div className="mt-[18px] flex flex-col gap-[9px]">
      {items.map((item) => {
        const isOpen = open === item.key
        return (
          <div key={item.key} className="overflow-hidden rounded-row border border-line bg-sf">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : item.key)}
              className="flex w-full cursor-pointer items-center justify-between gap-[14px] border-none bg-transparent px-[20px] py-[17px] text-left text-ink"
            >
              <span className="min-w-0 text-[15px] font-semibold [text-wrap:pretty]">{item.q}</span>
              <span aria-hidden="true" className="flex-none text-[19px] leading-none text-mut">
                {isOpen ? '−' : '+'}
              </span>
            </button>
            {isOpen ? (
              <div className="max-w-[70ch] px-[20px] pb-[19px] text-[14px] leading-[1.65] text-body [text-wrap:pretty]">
                {item.a}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
