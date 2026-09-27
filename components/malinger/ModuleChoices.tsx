'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { setOrgModule, setOrgModuleItem, setOrgModuleWording } from '@/app/(app)/malinger/actions'
import { pickWording, WORDINGS, type Wording, type WordingVariants } from '@/lib/modules/wording'

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
  /** a worded module (0083): the wording its rounds ask, and whether the organisation chose it */
  wording: { value: Wording; source: 'chosen' | 'nace' | 'default' } | null
  factors: {
    key: string
    name: string
    nameVariants?: WordingVariants
    summary: string
    statements: {
      code: string
      text: string
      variants?: WordingVariants
      /** left out of the organisation's grunnlinjer (0088, D-136) */
      off: boolean
      /** "34 % svarte «ikke relevant» i grunnlinjen 2026", where at least k did (0087) */
      notRelevant: string | null
    }[]
  }[]
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
  labels: {
    on: string
    off: string
    onNote: string
    offNote: string
    readOnly: string
    none: string
    failed: string
    seeAll: string
    wording: { legend: string; suggested: string; byDefault: string; chosen: string; failed: string } & Record<Wording, string>
    items: { lead: string; off: string; last: string; failed: string }
  }
}) {
  const [open, setOpen] = useState('')
  const [state, setState] = useState(() => new Map(cards.map((c) => [c.key, c.on])))
  const [wordings, setWordings] = useState(() => new Map(cards.flatMap((c) => (c.wording ? [[c.key, c.wording] as const] : []))))
  const [failed, setFailed] = useState<string | null>(null)
  // statements left out, by module key and code; shown at once and put back if the database refuses
  const [itemsOff, setItemsOff] = useState(
    () => new Set(cards.flatMap((c) => c.factors.flatMap((f) => f.statements.filter((s) => s.off).map((s) => `${c.key}:${s.code}`)))),
  )
  const [itemProblem, setItemProblem] = useState<{ key: string; text: string } | null>(null)
  const [wordingFailed, setWordingFailed] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // shown at once, as a radio should; put back if the database refuses
  const choose = (key: string, value: Wording) => {
    const before = wordings
    setWordingFailed(null)
    setWordings(new Map(before).set(key, { value, source: 'chosen' }))
    start(async () => {
      const r = await setOrgModuleWording(key, value)
      if (r.ok) setWordings(new Map(before).set(key, { value: r.wording, source: 'chosen' }))
      else {
        setWordings(before)
        setWordingFailed(key)
      }
    })
  }

  const toggleItem = (key: string, code: string, reason: string | null) => {
    const id = `${key}:${code}`
    const asked = itemsOff.has(id)
    const before = itemsOff
    const next = new Set(before)
    if (asked) next.delete(id)
    else next.add(id)
    setItemProblem(null)
    setItemsOff(next)
    start(async () => {
      const r = await setOrgModuleItem(key, code, asked, asked ? null : reason)
      if (!r.ok) {
        setItemsOff(before)
        setItemProblem({ key, text: r.problem === 'last_statement' ? labels.items.last : labels.items.failed })
      }
    })
  }

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
            const wording = wordings.get(c.key) ?? null
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
                {wording ? (
                  // the module's statements say «barna», «elevene» or both (0083); a native radio
                  // group, styled as the switch above it
                  <fieldset className="m-0 min-w-0 border-0 border-t border-solid border-line px-[16px] py-[10px]">
                    <legend className="float-left mb-[6px] w-full p-0 text-[12px] font-semibold text-mut">{labels.wording.legend}</legend>
                    <div className="clear-both flex flex-wrap gap-x-[18px] gap-y-[6px]">
                      {WORDINGS.map((w) => (
                        <label key={w} className={`flex items-center gap-[7px] text-[13px] ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}>
                          <input
                            type="radio"
                            name={`wording-${c.key}`}
                            value={w}
                            checked={wording.value === w}
                            // not disabled while saving: arrowing through the group would lose the focus
                            disabled={!canEdit}
                            onChange={() => choose(c.key, w)}
                            className="h-[16px] w-[16px] cursor-pointer accent-ink disabled:cursor-default"
                          />
                          {labels.wording[w]}
                        </label>
                      ))}
                    </div>
                    <span className="mt-[6px] block text-[12px] text-mut" role="status">
                      {wordingFailed === c.key ? (
                        <span className="text-caution">{labels.wording.failed}</span>
                      ) : (
                        // say where it came from, and only what is so
                        { chosen: labels.wording.chosen, nace: labels.wording.suggested, default: labels.wording.byDefault }[wording.source]
                      )}
                    </span>
                  </fieldset>
                ) : null}
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
                {isOpen && on && canEdit ? (
                  <p className="m-0 px-[16px] pb-[8px] text-[12px] leading-[1.5] text-mut [text-wrap:pretty]" role="status">
                    {itemProblem?.key === c.key ? <span className="text-caution">{itemProblem.text}</span> : labels.items.lead}
                  </p>
                ) : null}
                {isOpen ? (
                  <div className="grid gap-[10px] px-[16px] pb-[15px] [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
                    {c.factors.map((f) => (
                      <div key={f.key} className="rounded-ctl border border-line bg-sf px-[12px] py-[10px]">
                        <span className="block text-[13px] font-semibold">{pickWording(f.name, f.nameVariants, wording?.value)}</span>
                        <span className="mt-[2px] block text-[11.5px] leading-[1.45] text-mut">{f.summary}</span>
                        <ol className="m-0 mt-[8px] flex list-none flex-col gap-[6px] p-0">
                          {f.statements.map((s, i) => {
                            const out = itemsOff.has(`${c.key}:${s.code}`)
                            const text = pickWording(s.text, s.variants, wording?.value)
                            return (
                              <li key={s.code} className="flex items-start gap-[8px] text-[12.5px] leading-[1.45]">
                                {canEdit && on ? (
                                  // a native checkbox, as the module switch above it: ticked is asked
                                  <input
                                    type="checkbox"
                                    checked={!out}
                                    disabled={pending}
                                    onChange={() => toggleItem(c.key, s.code, s.notRelevant)}
                                    aria-label={text}
                                    className="mt-[2px] h-[15px] w-[15px] flex-none cursor-pointer accent-ink disabled:cursor-default"
                                  />
                                ) : (
                                  <span className="mt-[1px] flex-none text-[11px] font-bold text-mut">{i + 1}</span>
                                )}
                                <span className="[text-wrap:pretty]">
                                  <span className={out ? 'text-mut line-through' : ''}>{text}</span>
                                  {out ? <span className="ml-[6px] text-[11px] font-bold text-mut">{labels.items.off}</span> : null}
                                  {s.notRelevant ? <span className="mt-[2px] block text-[11.5px] font-semibold text-caution">{s.notRelevant}</span> : null}
                                </span>
                              </li>
                            )
                          })}
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
