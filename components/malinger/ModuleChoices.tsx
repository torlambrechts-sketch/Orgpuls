'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { setOrgModule } from '@/app/(app)/malinger/actions'

/**
 * The industry question sets under Målinger › Spørsmålssett (0074, D-124): off by default,
 * turned on by a daglig leder. On means the organisation's planned grunnlinjer, and every new
 * one, ask the module; Måleoppsett can still leave it out of one round.
 *
 * The design has no screen for this, so it is built from the core set's own parts above it —
 * the same tile, the same accordion, the same tokens — and the switch is a native checkbox
 * styled as Måleoppsett styles its module checkbox. Everything it prints arrives as props,
 * already translated by the server.
 */
export interface ModuleCard {
  key: string
  name: string
  description: string
  meta: string
  suggested: string | null
  on: boolean
  factors: { key: string; name: string; summary: string; statements: string[] }[]
  href: string | null
  /** "Bruk … i hovedmålingene", for the switch's accessible name */
  toggleLabel: string
  showLabel: string
}

export function ModuleChoices({
  heading,
  lead,
  cards,
  canEdit,
  labels,
}: {
  heading: string
  lead: string
  cards: ModuleCard[]
  canEdit: boolean
  labels: { on: string; off: string; onNote: string; offNote: string; readOnly: string; none: string; failed: string; seeAll: string }
}) {
  const [open, setOpen] = useState('')
  const [state, setState] = useState(() => new Map(cards.map((c) => [c.key, c.on])))
  const [failed, setFailed] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const flip = (key: string) => {
    const next = !state.get(key)
    setFailed(null)
    start(async () => {
      const r = await setOrgModule(key, next)
      if (r.ok) setState(new Map(state).set(key, r.enabled))
      else setFailed(key)
    })
  }

  return (
    <section className="mt-[20px] rounded-panel border border-line bg-sf px-[26px] py-[24px]" aria-labelledby="bransjemoduler">
      <h2 id="bransjemoduler" className="m-0 font-display text-[21px] font-semibold">
        {heading}
      </h2>
      <p className="mt-[6px] max-w-[640px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">{lead}</p>
      {!canEdit ? <p className="mt-[6px] text-[12.5px] text-mut">{labels.readOnly}</p> : null}

      {cards.length === 0 ? (
        <p className="mt-[16px] text-[13px] text-mut">{labels.none}</p>
      ) : (
        <div className="mt-[18px] flex flex-col gap-[10px]">
          {cards.map((c) => {
            const on = state.get(c.key) ?? false
            const isOpen = open === c.key
            return (
              <div key={c.key} className={`overflow-hidden rounded-tile border ${on ? 'border-ink bg-sbg' : 'border-line bg-bg'}`}>
                <div className="flex flex-wrap items-start justify-between gap-[14px] px-[16px] py-[14px]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-[8px]">
                      <span className="text-[14.5px] font-semibold">{c.name}</span>
                      {c.suggested ? (
                        <span className="rounded-pill bg-ac px-[9px] py-[2px] text-[11px] font-bold text-ink">{c.suggested}</span>
                      ) : null}
                    </div>
                    <span className="mt-[3px] block text-[12.5px] text-mut">{c.meta}</span>
                    <span className="mt-[6px] block max-w-[640px] text-[12.5px] leading-[1.55] text-body [text-wrap:pretty]">{c.description}</span>
                  </div>
                  <label className={`flex flex-none items-center gap-[9px] ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={on}
                      disabled={!canEdit || pending}
                      onChange={() => flip(c.key)}
                      aria-label={c.toggleLabel}
                      className="h-[20px] w-[20px] cursor-pointer accent-ink disabled:cursor-default"
                    />
                    <span className="text-[13px] font-bold">{on ? labels.on : labels.off}</span>
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-[10px] border-t border-line px-[16px] py-[10px]">
                  <span className="text-[12px] text-mut" role="status">
                    {failed === c.key ? <span className="text-caution">{labels.failed}</span> : on ? labels.onNote : labels.offNote}
                  </span>
                  <span className="flex items-center gap-[14px]">
                    {c.href ? (
                      <Link href={c.href as Route} className="text-[12.5px] font-semibold">
                        {labels.seeAll}
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? '' : c.key)}
                      className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-[12.5px] font-semibold text-ink"
                    >
                      <span aria-hidden="true" className="mr-[5px] text-[10px] text-mut">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      {c.showLabel}
                    </button>
                  </span>
                </div>
                {isOpen ? (
                  <div className="grid gap-[10px] px-[16px] pb-[15px] [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
                    {c.factors.map((f) => (
                      <div key={f.key} className="rounded-ctl border border-line bg-sf px-[12px] py-[10px]">
                        <span className="block text-[13px] font-semibold">{f.name}</span>
                        <span className="mt-[2px] block text-[11.5px] leading-[1.45] text-mut">{f.summary}</span>
                        <ol className="m-0 mt-[8px] flex list-none flex-col gap-[6px] p-0">
                          {f.statements.map((s, i) => (
                            <li key={i} className="flex items-start gap-[8px] text-[12.5px] leading-[1.45]">
                              <span className="mt-[1px] flex-none text-[11px] font-bold text-mut">{i + 1}</span>
                              <span className="[text-wrap:pretty]">{s}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
