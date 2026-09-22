'use client'

import { useState, useTransition } from 'react'
import { saveLawMode } from '@/app/(app)/oppsett/actions'

/**
 * Lovmodus. Bundle lines 2075-2092.
 *
 * The design is emphatic that this changes wording and nothing else — "Dokumentasjonen
 * blir den samme uansett", "Ingenting slettes når du bytter" — and the schema keeps that
 * promise by construction: `app.organizations.law_mode` is read by no policy, no RPC and
 * no trigger. It is a column nothing but a label depends on, and the comment on the column
 * says so, so that a future query that starts keying behaviour off it is visibly a change.
 */
export function LawModeForm({
  value,
  canWrite,
  options,
  note,
  problems,
}: {
  value: boolean
  canWrite: boolean
  options: { on: boolean; label: string; note: string }[]
  note: string
  problems: Record<string, string>
}) {
  const [v, setV] = useState(value)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <div className="mt-[13px] flex flex-col gap-[9px]">
        {options.map((o) => (
          <label
            key={String(o.on)}
            className={`flex items-start gap-[11px] rounded-tile border px-[15px] py-[14px] text-left ${
              canWrite ? 'cursor-pointer' : 'cursor-not-allowed'
            } ${v === o.on ? 'border-ink bg-sf' : 'border-rule bg-transparent'}`}
          >
            <input
              type="radio"
              name="lawMode"
              value={o.on ? 'on' : 'off'}
              checked={v === o.on}
              disabled={!canWrite || pending}
              onChange={() => {
                setV(o.on)
                startTransition(async () => {
                  const data = new FormData()
                  data.set('lawMode', o.on ? 'on' : 'off')
                  const result = await saveLawMode(data)
                  setProblem(result.ok ? null : result.problem)
                })
              }}
              className="peer absolute h-px w-px overflow-hidden opacity-0"
            />
            <span className="mt-[2px] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-pill border-2 border-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
              <span
                className="block h-[8px] w-[8px] rounded-pill"
                style={{ background: v === o.on ? '#191510' : 'transparent' }}
              />
            </span>
            <span className="min-w-0">
              <span className={`block text-[14px] ${v === o.on ? 'font-bold' : 'font-medium'}`}>
                {o.label}
              </span>
              <span className="mt-[3px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                {o.note}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div
        className="mt-[12px] text-[12.5px] leading-[1.55] [text-wrap:pretty]"
        style={{ color: problem ? '#A33A16' : '#3A342A' }}
      >
        {problem ? (problems[problem] ?? problems.denied) : note}
      </div>
    </>
  )
}
