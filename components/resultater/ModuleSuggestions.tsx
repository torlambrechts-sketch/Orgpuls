'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { createModuleMeasure } from '@/app/(app)/tiltak/module-actions'

/**
 * A module factor's three suggestions — workshop, rutine, lederpraksis — each with the
 * statement the next puls re-measures it with (D-115). "Lag tiltak" makes it a measure; the
 * database decides who may.
 */
export function ModuleSuggestions({
  roundId,
  suggestions,
  labels,
}: {
  roundId: string
  suggestions: { id: string; type: string; typeLabel: string; title: string; description: string; remeasure: string }[]
  labels: { head: string; create: string; created: string; open: string; failed: string }
}) {
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [failed, setFailed] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="mt-[12px]">
      <div className="text-[12px] font-semibold text-mut">{labels.head}</div>
      <div className="mt-[6px] grid gap-[8px]">
        {suggestions.map((s) => (
          <div key={s.id} className="rounded-tile bg-cream px-[14px] py-[12px]">
            <div className="text-[12px] font-bold text-mut">{s.typeLabel}</div>
            <div className="mt-[2px] text-[14px] font-bold">{s.title}</div>
            <p className="m-0 mt-[4px] text-[13px] leading-[1.5] text-body [text-wrap:pretty]">{s.description}</p>
            <div className="mt-[6px] text-[12.5px] text-mut">{s.remeasure}</div>
            {done[s.id] ? (
              <div className="mt-[8px] text-[12.5px] font-semibold text-link">
                {labels.created}{' '}
                <Link href="/tiltak" className="text-link">
                  {labels.open}
                </Link>
              </div>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const data = new FormData()
                    data.set('suggestionId', s.id)
                    data.set('roundId', roundId)
                    const r = await createModuleMeasure(data)
                    if (r.ok) {
                      setDone({ ...done, [s.id]: true })
                      setFailed(null)
                    } else setFailed(s.id)
                  })
                }
                className="mt-[8px] inline-flex h-[34px] cursor-pointer items-center rounded-btn border border-ink bg-ac px-[14px] text-[13px] font-bold text-ink disabled:cursor-wait"
              >
                {labels.create}
              </button>
            )}
            {failed === s.id ? (
              <div role="alert" className="mt-[6px] text-[12.5px] font-semibold text-danger">
                {labels.failed}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
