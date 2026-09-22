'use client'

import { useState } from 'react'

/**
 * Spørsmålssettet. Bundle lines 637-688.
 *
 * Eleven factor cards in an auto-filling grid, each expanding to its description and
 * its three statements, then the four questions that sit outside the index.
 *
 * A client component because the accordion is stateful, and the state is the bundle's:
 * `qsOpen` holds at most one key, so opening a card closes the one before it. The
 * design's default is all closed, which is also what the baseline was captured in.
 *
 * Nothing about the instrument is written here. The factors, their statement counts and
 * the extra questions arrive as props read from app.factors / app.statements /
 * app.extra_questions, and every string is resolved from next-intl by the server and
 * passed down — a card is a row plus a message key, never a component.
 */
export interface FactorCard {
  key: string
  label: string
  lawRef: string
  /** "3 påstander", already pluralised by the server */
  count: string
  description: string
  /** statement texts in ordinal order */
  statements: string[]
}

export interface ExtraCard {
  key: string
  label: string
  /** "1 spørsmål" */
  count: string
  text: string
  note: string
}

export function Sporsmalssettet({
  heading,
  lead,
  extraHeading,
  factors,
  extras,
}: {
  heading: string
  lead: string
  extraHeading: string
  factors: FactorCard[]
  extras: ExtraCard[]
}) {
  const [open, setOpen] = useState('')

  return (
    <section className="mt-[20px] rounded-panel border border-line bg-sf px-[26px] py-[24px]">
      <h2 className="m-0 font-display text-[21px] font-semibold">{heading}</h2>
      <p className="mt-[6px] max-w-[640px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
        {lead}
      </p>

      <div className="mt-[18px] grid gap-[10px] [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
        {factors.map((f) => {
          const isOpen = open === f.key
          return (
            <div
              key={f.key}
              className={`overflow-hidden rounded-tile border ${
                isOpen ? 'border-ink bg-sbg' : 'border-line bg-bg'
              }`}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? '' : f.key)}
                className="block w-full cursor-pointer border-none bg-transparent px-[16px] py-[14px] text-left font-[inherit] text-ink"
              >
                <span className="flex items-center justify-between gap-[10px]">
                  <span className="flex min-w-0 items-center gap-[7px]">
                    <span aria-hidden="true" className="flex-none text-[10px] text-mut">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className="text-[13.5px] font-semibold">{f.label}</span>
                  </span>
                  <span className="flex-none text-[11.5px] text-mut">{f.count}</span>
                </span>
                <span className="mt-[4px] block text-[11.5px] text-mut">{f.lawRef}</span>
              </button>

              {isOpen ? (
                <div className="px-[16px] pb-[15px] pt-0">
                  <div className="text-[12.5px] leading-[1.55] text-body [text-wrap:pretty]">
                    {f.description}
                  </div>
                  <div className="mt-[12px] flex flex-col gap-[7px]">
                    {f.statements.map((text, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-[9px] rounded-ctl border border-line bg-sf px-[12px] py-[10px]"
                      >
                        <span className="mt-[1px] flex-none text-[11px] font-bold text-mut">
                          {i + 1}
                        </span>
                        <span className="text-[12.5px] leading-[1.45] [text-wrap:pretty]">
                          {text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="mt-[20px] border-t border-line pt-[18px]">
        <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{extraHeading}</div>
        <div className="mt-[12px] flex flex-col gap-[8px]">
          {extras.map((e) => (
            <div
              key={e.key}
              className="grid gap-[16px] rounded-cta border border-line bg-bg px-[15px] py-[13px] [grid-template-columns:160px_minmax(0,1fr)]"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-bold">{e.label}</span>
                <span className="mt-[2px] block text-[11.5px] text-mut">{e.count}</span>
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] leading-[1.5] [text-wrap:pretty]">
                  {e.text}
                </span>
                <span className="mt-[5px] block text-[11.5px] leading-[1.45] text-mut [text-wrap:pretty]">
                  {e.note}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
