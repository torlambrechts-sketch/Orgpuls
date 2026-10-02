'use client'

import { useEffect, useRef, useState } from 'react'

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * «Det små bedrifter lurer på» (D-190; nettside-v3/Pris.dc.html, the FAQ): disclosures (R-07). Each
 * question is an `h3` holding a full-width button with `aria-expanded` and `aria-controls`; Tab moves
 * between them and Enter or Space toggles. The first is open, as both baselines draw it, and several
 * may be open at once, so opening one never moves an answer someone is reading.
 *
 * Every answer is in the server's HTML. A closed one is `hidden="until-found"`, so the browser's
 * find-in-page reaches it and opens it (`beforematch`). React has no such value for `hidden` (it
 * renders the attribute as a boolean), so the answer is written as HTML that React leaves alone, and
 * the attribute is kept in step with the state here.
 */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]))
  const list = useRef<HTMLDivElement>(null)
  const synced = useRef(false)

  // an answer the browser revealed before this script ran (find-in-page, a text fragment) is open
  useEffect(() => {
    const shown = items.flatMap((_, i) => (document.getElementById(`faq-a-${i}`)?.hasAttribute('hidden') ? [] : [i]))
    if (shown.some((i) => i !== 0)) setOpen((s) => new Set([...s, ...shown]))
  }, [items])

  useEffect(() => {
    // the first pass leaves the server's markup (or the browser's reveal) as it is
    if (!synced.current) {
      synced.current = true
      return
    }
    items.forEach((_, i) => {
      const el = document.getElementById(`faq-a-${i}`)
      if (!el) return
      if (open.has(i)) el.removeAttribute('hidden')
      else el.setAttribute('hidden', 'until-found')
    })
  }, [open, items])

  // find-in-page opened a closed answer: it is open now
  useEffect(() => {
    const root = list.current
    const onMatch = (e: Event) => {
      const i = Number((e.target as HTMLElement).id.replace('faq-a-', ''))
      if (Number.isInteger(i)) setOpen((s) => new Set(s).add(i))
    }
    root?.addEventListener('beforematch', onMatch)
    return () => root?.removeEventListener('beforematch', onMatch)
  }, [])

  const toggle = (i: number) =>
    setOpen((s) => {
      const next = new Set(s)
      if (!next.delete(i)) next.add(i)
      return next
    })

  return (
    <div ref={list} className="flex flex-col gap-[9px]">
      {items.map((q, i) => {
        const isOpen = open.has(i)
        return (
          <div key={i} className="rounded-[16px] border border-line bg-sf">
            <h3 className="m-0">
              <button
                type="button"
                id={`faq-q-${i}`}
                aria-expanded={isOpen}
                aria-controls={`faq-a-${i}`}
                onClick={() => toggle(i)}
                className="flex w-full cursor-pointer items-center justify-between gap-[12px] border-0 bg-transparent px-[20px] py-[17px] text-left text-[15.5px] font-bold text-ink"
              >
                {q.q}
                <span aria-hidden="true" className="text-[18px] leading-none text-mut">
                  {isOpen ? '−' : '+'}
                </span>
              </button>
            </h3>
            <div
              dangerouslySetInnerHTML={{
                __html: `<div id="faq-a-${i}"${i === 0 ? '' : ' hidden="until-found"'}><p class="m-0 max-w-[62ch] px-[20px] pb-[18px] text-[14.5px] leading-[1.65] text-body [text-wrap:pretty]">${escape(q.a)}</p></div>`,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
