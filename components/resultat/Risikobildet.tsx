'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { BAND_BAR, RiskBadge, type Band } from '@/components/ui/Risk'

/**
 * Risikobildet — the factor table. Bundle lines 802-861.
 *
 * One row per factor in the selected scope, ordered by index ascending, which is what
 * "Sortert etter risiko" means. A row expands to the factor's description and the
 * statements behind the number.
 *
 * A client component because the accordion is stateful, and the state is the bundle's:
 * `openFactor` holds at most one key, so opening a row closes the previous one. The
 * baseline was captured with every row closed, which is also the default here.
 *
 * Nothing is computed in this file. The index, the band and the delta all arrive as
 * props, read from the RPCs by the server; the statements arrive already resolved from
 * next-intl. A component that recomputed a band could disagree with the statutory
 * report, and the report is the document a labour inspector reads.
 *
 * What the design's expanded row carries and this one does not: a five-segment answer
 * distribution and an index per statement. `results_summary` aggregates to the factor,
 * and no RPC exposes anything per statement — app.answers is unreadable by any client
 * role by design. The statements are shown without them rather than with an invented
 * spread. See docs/DEVIATIONS.md D-13.
 */
export interface FactorRow {
  key: string
  label: string
  /** "aml. § 4-3 · § 2A" — the citation, from app.factors.law_ref */
  lawRef: string
  index: number
  band: Band
  /** Already formatted and signed by the server, or null when there is nothing to compare against. */
  delta: string | null
  deltaColour: string
  bandLabel: string
  actionLabel: string
  description: string
  statements: string[]
}

/** The bundle's four-column grid, used by the header row and every data row (line 804). */
const COLUMNS = 'minmax(0,1.5fr) minmax(0,2fr) 96px 132px'

/** A high-risk row is tinted, so the whole row reads as the thing to look at (line 808). */
const ROW_BACKGROUND: Record<Band, string> = {
  hoy: 'rgba(251,213,196,.3)',
  middels: 'transparent',
  lav: 'transparent',
}

export function Risikobildet({
  rows,
  columnFactor,
  columnIndex,
  columnRisk,
}: {
  rows: FactorRow[]
  columnFactor: string
  columnIndex: string
  columnRisk: string
}) {
  const [open, setOpen] = useState('')

  return (
    <div className="overflow-x-auto bg-bg pb-[10px]">
      <div className="min-w-[660px]">
        <div
          className="grid gap-[14px] px-[28px] py-[12px] text-[10.5px] uppercase tracking-[0.09em] text-mut"
          style={{ gridTemplateColumns: COLUMNS }}
        >
          <span>{columnFactor}</span>
          <span>{columnIndex}</span>
          <span className="text-right">{columnRisk}</span>
          <span />
        </div>

        {rows.map((row) => {
          const isOpen = open === row.key
          return (
            <div
              key={row.key}
              className="border-t border-line"
              style={{ background: ROW_BACKGROUND[row.band] }}
            >
              <div
                className="grid items-center gap-[14px] px-[28px] py-[13px]"
                style={{ gridTemplateColumns: COLUMNS }}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? '' : row.key)}
                  className="min-w-0 cursor-pointer border-none bg-transparent p-0 text-left font-[inherit] text-ink"
                >
                  <span className="flex items-center gap-[8px]">
                    <span aria-hidden="true" className="w-[10px] flex-none text-[11px] text-mut">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold">{row.label}</span>
                      <span className="mt-[2px] block text-[11.5px] text-mut">{row.lawRef}</span>
                    </span>
                  </span>
                </button>

                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-[9px]">
                    <span className="text-[20px] font-bold leading-none tabular-nums">
                      {row.index}
                    </span>
                    {row.delta ? (
                      <span
                        className="text-[12.5px] font-semibold"
                        style={{ color: row.deltaColour }}
                      >
                        {row.delta}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="mt-[7px] block h-[7px] overflow-hidden rounded-pill"
                    style={{ background: 'rgba(25,21,16,.08)' }}
                  >
                    <span
                      className="block h-full rounded-pill"
                      style={{ width: `${row.index}%`, background: BAND_BAR[row.band] }}
                    />
                  </span>
                </span>

                <span className="text-right">
                  <RiskBadge band={row.band} label={row.bandLabel} size="row" />
                </span>

                <Button size="act" tone={row.band === 'hoy' ? 'solid' : 'secondary'}>
                  {row.actionLabel}
                </Button>
              </div>

              {isOpen ? (
                <div className="px-[28px] pb-[20px] pl-[50px] pt-[2px]">
                  <div className="max-w-[680px] text-[13px] leading-[1.6] text-body [text-wrap:pretty]">
                    {row.description}
                  </div>
                  <div className="mt-[14px] flex flex-col gap-[8px]">
                    {row.statements.map((text, i) => (
                      <div
                        key={i}
                        className="rounded-btn border border-line bg-sf px-[14px] py-[11px] text-[13px] leading-[1.45] [text-wrap:pretty]"
                      >
                        {text}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
