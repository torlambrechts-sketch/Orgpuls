'use client'

import { useState, useTransition } from 'react'
import { updateModuleMeasure } from '@/app/(app)/tiltak/module-actions'

/**
 * Measures from an industry module (D-115): the same steps, owner and deadline as every
 * measure, beside the board rather than on it, because the board is drawn around the eleven
 * core factors. Each row saves on change; the database decides who may and refuses a close
 * that skips the effect measurement (0015).
 */
export type ModuleMeasureRow = {
  id: string
  title: string
  goal: string | null
  step: string
  dueDate: string | null
  ownerId: string | null
  factor: string
  remeasure: string
}

export function ModuleMeasures({
  rows,
  steps,
  owners,
  labels,
}: {
  rows: ModuleMeasureRow[]
  steps: { value: string; label: string }[]
  owners: { value: string; label: string }[]
  labels: {
    head: string
    lead: string
    step: string
    due: string
    owner: string
    ownerUnset: string
    saved: string
    problems: Record<string, string>
  }
}) {
  const [state, setState] = useState(rows)
  const [msg, setMsg] = useState<{ id: string; text: string; bad: boolean } | null>(null)
  const [pending, start] = useTransition()

  const save = (id: string, next: Partial<ModuleMeasureRow>) => {
    const row = state.find((r) => r.id === id)
    if (!row) return
    const merged = { ...row, ...next }
    setState(state.map((r) => (r.id === id ? merged : r)))
    start(async () => {
      const data = new FormData()
      data.set('id', id)
      data.set('step', merged.step)
      data.set('dueDate', merged.dueDate ?? '')
      data.set('ownerId', merged.ownerId ?? '')
      const r = await updateModuleMeasure(data)
      if (!r.ok) setState(state)
      setMsg({ id, text: r.ok ? labels.saved : (labels.problems[r.problem] ?? labels.problems.denied ?? ''), bad: !r.ok })
    })
  }

  const control = 'h-[36px] rounded-btn border border-line bg-sf px-[10px] text-[13px] text-ink'

  return (
    <section className="rounded-card border border-line bg-sf px-[22px] py-[20px]" aria-labelledby="modultiltak">
      <h2 id="modultiltak" className="m-0 font-display text-[20px] font-semibold leading-[1.2]">
        {labels.head}
      </h2>
      <p className="m-0 mt-[6px] max-w-[640px] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">{labels.lead}</p>
      <ul className="m-0 mt-[12px] list-none p-0">
        {state.map((r) => (
          <li key={r.id} className="border-t border-line py-[14px]">
            <div className="text-[12px] font-bold text-mut">{r.factor}</div>
            <div className="mt-[2px] text-[15px] font-bold">{r.title}</div>
            {r.goal ? <p className="m-0 mt-[4px] max-w-[680px] text-[13px] leading-[1.5] text-body">{r.goal}</p> : null}
            <div className="mt-[4px] text-[12.5px] text-mut">{r.remeasure}</div>
            <div className="mt-[10px] flex flex-wrap items-end gap-[10px]">
              <label className="flex flex-col gap-[4px] text-[12px] font-semibold text-mut">
                {labels.step}
                <select className={control} value={r.step} disabled={pending} onChange={(e) => save(r.id, { step: e.target.value })}>
                  {steps.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-[4px] text-[12px] font-semibold text-mut">
                {labels.owner}
                <select
                  className={control}
                  value={r.ownerId ?? ''}
                  disabled={pending}
                  onChange={(e) => save(r.id, { ownerId: e.target.value || null })}
                >
                  <option value="">{labels.ownerUnset}</option>
                  {owners.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-[4px] text-[12px] font-semibold text-mut">
                {labels.due}
                <input
                  type="date"
                  className={control}
                  value={r.dueDate ?? ''}
                  disabled={pending}
                  onChange={(e) => save(r.id, { dueDate: e.target.value || null })}
                />
              </label>
            </div>
            {msg?.id === r.id ? (
              <div role={msg.bad ? 'alert' : 'status'} className={`mt-[6px] text-[12.5px] font-semibold ${msg.bad ? 'text-danger' : 'text-link'}`}>
                {msg.text}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
