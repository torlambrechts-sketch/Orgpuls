'use client'

import { useState, useTransition } from 'react'
import { setMeasureDone } from '@/app/(app)/innsikt/actions'

export interface TodoItem {
  id: string
  title: string
  meta: string
  late: boolean
  /** the checkbox's accessible name: "Merk «…» som gjennomført" */
  aria: string
  /** the step it is at, which is the step unchecking returns it to */
  from: 'besluttet' | 'pagar'
}

/**
 * "Gjør dette nå" (design 3, `ov.todo`): the three measures that are decided or running,
 * each a row that is also its checkbox. Checking marks the measure carried out
 * (app/(app)/innsikt/actions.ts); the row stays, struck through and dimmed, as the design
 * draws it. A refused write puts the box back and says so.
 */
export function TodoList({
  items,
  labels,
}: {
  items: TodoItem[]
  labels: { problem: string; empty: string }
}) {
  // the rows of this visit: a re-render after a reply must not drop a row just checked
  const [list] = useState(items)
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [problem, setProblem] = useState(false)
  const [, startTransition] = useTransition()

  if (list.length === 0) {
    return (
      <div className="rounded-cta border border-dashed border-rule p-[16px] text-center text-[13px] text-mut">
        {labels.empty}
      </div>
    )
  }

  const toggle = (item: TodoItem) => {
    const next = !done[item.id]
    setDone((d) => ({ ...d, [item.id]: next }))
    setProblem(false)
    startTransition(async () => {
      const data = new FormData()
      data.set('id', item.id)
      data.set('done', String(next))
      data.set('from', item.from)
      const result = await setMeasureDone(data)
      if (!result.ok) {
        setDone((d) => ({ ...d, [item.id]: !next }))
        setProblem(true)
      }
    })
  }

  return (
    <>
      {list.map((item) => {
        const ok = !!done[item.id]
        return (
          <button
            key={item.id}
            type="button"
            role="checkbox"
            aria-checked={ok}
            aria-label={item.aria}
            onClick={() => toggle(item)}
            className="flex w-full cursor-pointer items-center gap-[14px] rounded-tile border border-line bg-bg px-[15px] py-[13px] text-left text-ink"
            style={{ opacity: ok ? 0.55 : 1 }}
          >
            <span
              aria-hidden="true"
              className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] border-2 border-ink text-[12px] font-bold ${
                ok ? 'bg-ink text-bg' : 'bg-sf text-transparent'
              }`}
            >
              {ok ? '✓' : ''}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[14.5px] font-semibold ${ok ? 'line-through' : ''}`}>{item.title}</span>
              <span className={`mt-[2px] block text-[12.5px] ${item.late && !ok ? 'text-danger' : 'text-mut'}`}>
                {item.meta}
              </span>
            </span>
          </button>
        )
      })}
      {problem ? (
        <p role="alert" className="m-0 text-[12.5px] text-danger">
          {labels.problem}
        </p>
      ) : null}
    </>
  )
}
