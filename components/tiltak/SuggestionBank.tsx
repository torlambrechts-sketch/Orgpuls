'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PlaybookCards, PlaybookEvidence } from '@/components/playbook/PlaybookCards'
import type { AdoptLabels, PlaybookBlock } from '@/lib/playbook/cards'

/**
 * "Forslag fra resultatene" (bundle 1810-1843): the factors as chips from the lowest
 * index to the highest, one selected, then that factor's evidence line and playbook.
 *
 * The chips are links, not buttons: which factor is open is in the URL (`?forslag=`),
 * as the status, measurement and owner filters above the list already are, so a colleague
 * can be sent the very suggestion. Only "Skjul forslag" is local — folding a block is not
 * a state anyone else needs.
 */
export interface BankChip {
  key: string
  label: string
  /** the factor's index in the round the suggestions rest on, or null when none has closed */
  score: string | null
  scoreBg: string
  selected: boolean
  href: { pathname: '/tiltak'; query: Record<string, string> }
}

export function SuggestionBank({
  head,
  lead,
  hideLabel,
  showLabel,
  chips,
  block,
  adopt,
  roundId,
}: {
  head: string
  lead: string
  hideLabel: string
  showLabel: string
  chips: BankChip[]
  block: PlaybookBlock
  adopt: AdoptLabels
  roundId: string | null
}) {
  const [open, setOpen] = useState(true)

  return (
    <section className="mt-[22px] rounded-panel border border-line bg-sf px-[24px] py-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-[14px]">
        <span className="min-w-0">
          <span className="block font-display text-[21px] font-semibold">{head}</span>
          <span className="mt-[3px] block max-w-[640px] text-[12.5px] text-mut [text-wrap:pretty]">{lead}</span>
        </span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-[32px] cursor-pointer items-center rounded-bar border border-line bg-transparent px-[13px] text-[12px] font-semibold text-ink"
        >
          {open ? hideLabel : showLabel}
        </button>
      </div>

      {open ? (
        <>
          <div className="mt-[14px] flex flex-wrap gap-[7px]">
            {chips.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                scroll={false}
                aria-current={c.selected ? 'true' : undefined}
                className={`inline-flex h-[34px] items-center gap-[7px] rounded-pill border px-[13px] text-[12.5px] text-ink no-underline hover:text-ink hover:no-underline ${
                  c.selected ? 'border-ink bg-sbg font-bold' : 'border-line bg-transparent font-medium'
                }`}
              >
                <span>{c.label}</span>
                {c.score !== null ? (
                  <span
                    className="rounded-pill px-[7px] py-[1px] text-[11px] font-bold tabular-nums"
                    style={{ background: c.scoreBg }}
                  >
                    {c.score}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
          <PlaybookEvidence text={block.evidence} className="mt-[14px] max-w-[760px]" />
          <PlaybookCards cards={block.cards} minCard={240} labels={adopt} roundId={roundId} />
        </>
      ) : null}
    </section>
  )
}
