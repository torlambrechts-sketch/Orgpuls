'use client'

import { useState, useTransition } from 'react'
import { setThreshold } from '@/app/(app)/oppsett/actions'
import { belowDefault } from '@/lib/org/threshold'

/**
 * The threshold chips.
 *
 * Five is the default and the strong recommendation; a small team may go down to three, never
 * lower (`app.k_floor()`, 0150, D-198). The design offers 3, 4, 5 and 8; 6 and 10 stay, as they
 * were offered before (D-31), so an organisation can still be stricter.
 *
 * A pick of 5 or more saves at once, as before. A pick under five does not: it opens the warning
 * — the design's low-threshold card, its peach fill and orange edge — and saves only when the
 * daglig leder confirms. Saved, the note under the chips says the threshold is under five in the
 * design's warning colour, as the design's `threshWarn` does.
 *
 * What the chip changes is the rounds that have not opened. A round that has opened keeps the
 * threshold its respondents were shown, and the database refuses any change to it.
 */
const CHOICES = [3, 4, 5, 6, 8, 10]

const PRIMARY =
  'inline-flex h-[40px] cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border border-ink bg-ac px-[16px] text-[13.5px] font-bold text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default disabled:opacity-60'
const SECONDARY =
  'inline-flex h-[40px] cursor-pointer items-center justify-center whitespace-nowrap rounded-ctl border border-line bg-transparent px-[14px] text-[13px] font-semibold text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default disabled:opacity-60'

export type LowChoice = { n: number; warn: string; confirm: string }

export function ThresholdPicker({
  value,
  canWrite,
  labels,
}: {
  value: number
  canWrite: boolean
  labels: {
    floorNote: string
    /** the note under the chips while the saved threshold is under five */
    lowNote: string
    /** the warning and the confirm button for each choice under five */
    low: LowChoice[]
    cancel: string
    denied: string
    saved: string
  }
}) {
  const [v, setV] = useState(value)
  const [asking, setAsking] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const save = (next: number) => {
    setV(next)
    setAsking(null)
    if (!canWrite) return
    startTransition(async () => {
      const data = new FormData()
      data.set('threshold', String(next))
      const result = await setThreshold(data)
      setProblem(result.ok ? null : result.problem)
      setSaved(result.ok)
    })
  }

  const pick = (next: number) => {
    if (next === v) return setAsking(null)
    if (belowDefault(next) && canWrite) {
      setSaved(false)
      setProblem(null)
      return setAsking(next)
    }
    save(next)
  }

  const shown = asking ?? v
  const ask = labels.low.find((l) => l.n === asking) ?? null

  return (
    <>
      <div className="mt-[14px] flex flex-wrap gap-[7px]">
        {CHOICES.map((n) => (
          <label key={n} className="inline-flex flex-none">
            <input
              type="radio"
              name="threshold"
              value={n}
              checked={shown === n}
              disabled={!canWrite || pending}
              onChange={() => pick(n)}
              className="peer absolute h-px w-px overflow-hidden opacity-0"
            />
            <span
              className={`inline-flex cursor-pointer items-center rounded-pill border px-[15px] py-[8px] text-[12.5px] font-bold peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                shown === n ? 'border-ink bg-sbg' : 'border-line bg-transparent'
              }`}
            >
              {n}
            </span>
          </label>
        ))}
      </div>

      {ask ? (
        <div role="alert" className="mt-[14px] max-w-[620px] rounded-row border border-orange bg-peach px-[20px] py-[16px]">
          <p className="m-0 text-[13.5px] leading-[1.6] text-rustdeep [text-wrap:pretty]">{ask.warn}</p>
          <div className="mt-[12px] flex flex-wrap gap-[8px]">
            <button type="button" className={PRIMARY} disabled={pending} onClick={() => save(ask.n)}>
              {ask.confirm}
            </button>
            <button type="button" className={SECONDARY} disabled={pending} onClick={() => setAsking(null)}>
              {labels.cancel}
            </button>
          </div>
        </div>
      ) : null}

      <p
        className={`mt-[13px] max-w-[620px] text-[12.5px] leading-[1.55] [text-wrap:pretty] ${
          !problem && !saved && belowDefault(v) ? 'text-danger' : 'text-mut'
        }`}
      >
        {problem ? labels.denied : saved && !pending ? labels.saved : belowDefault(v) ? labels.lowNote : labels.floorNote}
      </p>
    </>
  )
}
