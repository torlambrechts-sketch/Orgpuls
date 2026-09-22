'use client'

import { useState, useTransition } from 'react'
import { setThreshold } from '@/app/(app)/oppsett/actions'

/**
 * The threshold chips.
 *
 * **The design offers 3 and this does not.** `app.k_min()` is a function returning 5 and
 * `app.k_threshold` takes the greater of it and the column, so a 3 would be stored — if
 * the column's own CHECK allowed it, which it does not — and then ignored. A chip that
 * appears to lower the floor and cannot is worse than an absent one: it tells a leader
 * they have a setting they do not have. D-31.
 *
 * The consequence is that the design's warning card for a sub-5 threshold is unreachable,
 * and the note under these chips says what is true instead: five is the floor, and it is
 * the product's, not this organisation's.
 */
const CHOICES = [5, 6, 8, 10]

export function ThresholdPicker({
  value,
  canWrite,
  labels,
}: {
  value: number
  canWrite: boolean
  labels: { floorNote: string; denied: string; saved: string }
}) {
  const [v, setV] = useState(value)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const pick = (next: number) => {
    setV(next)
    if (!canWrite) return
    startTransition(async () => {
      const data = new FormData()
      data.set('threshold', String(next))
      const result = await setThreshold(data)
      setProblem(result.ok ? null : result.problem)
      setSaved(result.ok)
    })
  }

  return (
    <>
      <div className="mt-[14px] flex flex-wrap gap-[7px]">
        {CHOICES.map((n) => (
          <label key={n} className="inline-flex flex-none">
            <input
              type="radio"
              name="threshold"
              value={n}
              checked={v === n}
              disabled={!canWrite}
              onChange={() => pick(n)}
              className="peer absolute h-px w-px overflow-hidden opacity-0"
            />
            <span
              className={`inline-flex cursor-pointer items-center rounded-pill border px-[15px] py-[8px] text-[12.5px] font-bold peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                v === n ? 'border-ink bg-sbg' : 'border-line bg-transparent'
              }`}
            >
              {n}
            </span>
          </label>
        ))}
      </div>

      <p className="mt-[13px] max-w-[620px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
        {problem ? labels.denied : saved && !pending ? labels.saved : labels.floorNote}
      </p>
    </>
  )
}
