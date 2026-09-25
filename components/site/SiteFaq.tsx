'use client'

import { useState } from 'react'

/**
 * "Det folk lurer på før de starter" (D-88; Hvorfor.dc.html lines 167-174): questions
 * separated by hairlines, the first open. Each question is a `<button>` with `aria-expanded`,
 * because it opens its answer in place.
 */
export function SiteFaq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0)
  return (
    <div className="flex flex-col">
      {items.map((x, i) => (
        <div key={x.q} className="border-t border-line">
          <button
            type="button"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? -1 : i)}
            className="flex w-full cursor-pointer justify-between gap-[14px] border-none bg-transparent py-[16px] text-left text-[15.5px] font-bold text-ink"
          >
            <span>{x.q}</span>
            <span aria-hidden="true" className="flex-none font-normal text-mut">
              {open === i ? '−' : '+'}
            </span>
          </button>
          {open === i ? (
            <p className="m-0 mb-[16px] max-w-[60ch] text-[14px] leading-[1.65] text-body [text-wrap:pretty]">{x.a}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
