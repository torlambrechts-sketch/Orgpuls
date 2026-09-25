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
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const isOpen = open === item.key
        return (
          <div key={item.key} className="overflow-hidden rounded-row border border-line bg-sf">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : item.key)}
              className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 border-none bg-transparent px-5 py-4 text-left text-ink"
            >
              <span className="min-w-0 text-mk-card font-semibold [text-wrap:pretty]">{item.q}</span>
              <span aria-hidden="true" className="flex-none text-mk-h3 leading-none text-mut">
                {isOpen ? '−' : '+'}
              </span>
            </button>
            {/* in the HTML while closed, so an answer can be found and indexed; `hidden` keeps
                it out of view and out of the accessibility tree until it is opened */}
            <div
              hidden={!isOpen}
              className="max-w-prose px-5 pb-5 text-mk-card text-body [text-wrap:pretty]"
            >
              {item.a}
            </div>
          </div>
        )
      })}
    </div>
  )
}
