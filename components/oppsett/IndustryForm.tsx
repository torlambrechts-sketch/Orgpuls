'use client'

import { useState, useTransition } from 'react'
import { keepIndustry, saveIndustry } from '@/app/(app)/oppsett/actions'

/**
 * «Bransje» (innstillinger-og-forside.md § 3.1, 0091, D-139): the registered industry, what it
 * suggests, and the choice — «Ingen bransjemodul» or one of the industries — in the chips the
 * settings card already uses. Where the NACE code has moved since a manual choice, the notice
 * offers the new suggestion once: «Bytt» follows it, «Behold» keeps the choice.
 */
export function IndustryForm({
  canWrite,
  options,
  selected,
  changed,
  labels,
}: {
  canWrite: boolean
  options: { value: string; label: string }[]
  selected: string
  /** the new suggestion to offer, where the code changed after a manual choice */
  changed: { value: string; text: string } | null
  labels: { switchTo: string; keep: string; saved: string; problems: Record<string, string> }
}) {
  const [value, setValue] = useState(selected)
  const [notice, setNotice] = useState(changed)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const choose = (next: string) => {
    setValue(next)
    setNotice(null)
    const data = new FormData()
    data.set('industry', next)
    startTransition(async () => {
      const r = await saveIndustry(data)
      setProblem(r.ok ? null : (r.problem ?? 'denied'))
      setSaved(r.ok)
    })
  }
  const keep = () =>
    startTransition(async () => {
      const r = await keepIndustry()
      setProblem(r.ok ? null : (r.problem ?? 'denied'))
      setSaved(r.ok)
      if (r.ok) setNotice(null)
    })

  const status = problem
    ? { text: labels.problems[problem] ?? labels.problems.denied, colour: '#A33A16' }
    : saved && !pending
      ? { text: labels.saved, colour: '#2F5D2A' }
      : null

  return (
    <>
      {notice ? (
        <div className="mt-[14px] rounded-tile border border-line bg-sbg px-[15px] py-[13px]">
          <p className="m-0 max-w-[600px] text-[13px] leading-[1.55] text-body [text-wrap:pretty]">{notice.text}</p>
          <div className="mt-[10px] flex flex-wrap gap-[8px]">
            <button
              type="button"
              disabled={!canWrite || pending}
              onClick={() => choose(notice.value)}
              className="inline-flex h-[36px] cursor-pointer items-center rounded-btn border border-ink bg-ac px-[14px] text-[12.5px] font-bold text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {labels.switchTo}
            </button>
            <button
              type="button"
              disabled={!canWrite || pending}
              onClick={keep}
              className="inline-flex h-[36px] cursor-pointer items-center rounded-btn border border-line bg-transparent px-[14px] text-[12.5px] font-semibold text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {labels.keep}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-[14px] flex flex-wrap gap-[7px]">
        {options.map((o) => (
          <label key={o.value} className="inline-flex flex-none">
            <input
              type="radio"
              name="industry"
              value={o.value}
              checked={value === o.value}
              disabled={!canWrite}
              onChange={() => choose(o.value)}
              className="peer absolute h-px w-px overflow-hidden opacity-0"
            />
            <span
              className={`inline-flex cursor-pointer items-center rounded-pill border px-[15px] py-[8px] text-[12.5px] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                value === o.value ? 'border-ink bg-sbg font-bold' : 'border-line bg-transparent font-medium'
              }`}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>

      {status ? (
        <p className="mt-[12px] text-[12.5px] leading-[1.5]" style={{ color: status.colour }}>
          {status.text}
        </p>
      ) : null}
    </>
  )
}
