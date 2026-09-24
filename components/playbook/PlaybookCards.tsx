'use client'

import { useState, useTransition } from 'react'
import { adoptPlaybookMeasure } from '@/app/(app)/tiltak/actions'
import type { AdoptLabels, PlaybookCard } from '@/lib/playbook/cards'

/**
 * The playbook's cards: a type pill and a duration, a title, how it is done, the statement
 * to follow, and "Gjør til tiltak" (bundle 846-865 under a Resultat factor row, 1810-1843
 * on Tiltak — the same card, only the grid's minimum column differs).
 *
 * The button is a real button posting to a server action, as "＋ Nytt tiltak" is: creating
 * a row is not a navigation. Whether it reads "Lagt til i Tiltak ✓" is not remembered
 * here — it comes back from the server with the re-rendered screen, read from the
 * measure the action wrote (0031), so a reload, a colleague and this tab all agree.
 */
export function PlaybookCards({
  cards,
  minCard,
  labels,
  roundId,
}: {
  cards: PlaybookCard[]
  /** the grid's `minmax(<minCard>px, 1fr)`: 230 under a factor row, 240 on Tiltak */
  minCard: number
  labels: AdoptLabels
  roundId: string | null
}) {
  return (
    <div className="mt-[12px] grid gap-[10px]" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${minCard}px, 1fr))` }}>
      {cards.map((c) => (
          <div
            key={c.key}
            className="flex min-w-0 flex-col gap-[8px] rounded-tile border border-line bg-sf px-[16px] py-[15px]"
          >
            <span className="flex flex-wrap items-center gap-[8px]">
              <span
                className="rounded-pill px-[10px] py-[3px] text-[11px] font-bold"
                style={{ background: c.kindBg }}
              >
                {c.kindLabel}
              </span>
              <span className="text-[11.5px] text-mut">{c.time}</span>
            </span>
            <span className="text-[14px] font-bold leading-[1.35] [text-wrap:pretty]">{c.title}</span>
            <span className="text-[12.5px] leading-[1.55] text-body [text-wrap:pretty]">{c.how}</span>
            <span className="text-[11.5px] leading-[1.5] text-mut [text-wrap:pretty]">{c.watchLine}</span>
            <AdoptButton playbookKey={c.key} adopted={c.adopted} labels={labels} roundId={roundId} />
          </div>
        ))}
    </div>
  )
}

/** The evidence line that stands above the cards (bundle 847, 1826). */
export function PlaybookEvidence({ text, className = '' }: { text: string; className?: string }) {
  return <div className={`text-[12px] leading-[1.55] text-mut [text-wrap:pretty] ${className}`}>{text}</div>
}

function AdoptButton({
  playbookKey,
  adopted,
  labels,
  roundId,
}: {
  playbookKey: string
  adopted: boolean
  labels: AdoptLabels
  roundId: string | null
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <span className="mt-auto flex flex-col items-start self-start">
      <button
        type="button"
        disabled={adopted || pending}
        aria-pressed={adopted}
        onClick={() =>
          startTransition(async () => {
            const data = new FormData()
            data.set('key', playbookKey)
            if (roundId) data.set('roundId', roundId)
            const result = await adoptPlaybookMeasure(data)
            setProblem(result.ok ? null : result.problem)
          })
        }
        className={`inline-flex h-[32px] cursor-pointer items-center whitespace-nowrap rounded-bar border border-ink px-[13px] text-[12px] font-bold text-ink disabled:cursor-default ${
          adopted ? 'bg-mint' : 'bg-ac'
        }`}
      >
        {adopted ? labels.adopted : labels.adopt}
      </button>
      {problem ? (
        <span className="mt-[6px] text-[11.5px] leading-[1.4] text-danger">
          {labels.problems[problem] ?? labels.problems.denied}
        </span>
      ) : null}
    </span>
  )
}
