'use client'

import { useState, useTransition } from 'react'
import { siteIndexingSet } from '@/lib/admin/settingsActions'

/**
 * The design's switch (`sw()`: a 38 × 22 track, the knob at 2 or 18 px) for Admin › Site settings.
 * `IndexingSwitch` changes «Allow search engines» (0126); `FixedSwitch` shows a state that is
 * changed elsewhere or not at all, so it is drawn but does nothing.
 */
const track = (on: boolean) => `relative block h-[22px] w-[38px] flex-none rounded-pill border-0 p-0 ${on ? 'bg-ink' : 'bg-ink/15'}`
const knob = (on: boolean) => `absolute top-[2px] block h-[18px] w-[18px] rounded-pill bg-sf transition-[left] duration-150 ${on ? 'left-[18px]' : 'left-[2px]'}`

export function IndexingSwitch({ on, label, confirmOff, problems }: { on: boolean; label: string; confirmOff: string; problems: Record<string, string> }) {
  const [value, setValue] = useState(on)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const toggle = () => {
    const next = !value
    if (!next && !window.confirm(confirmOff)) return
    const fd = new FormData()
    fd.set('on', next ? 'on' : 'off')
    start(async () => {
      const r = await siteIndexingSet(null, fd)
      if (r.ok) {
        setValue(next)
        setProblem(null)
      } else setProblem(problems[r.problem] ?? problems.failed ?? '')
    })
  }
  return (
    <span className="flex flex-none flex-col items-end gap-[4px]">
      <button type="button" role="switch" aria-checked={value} aria-label={label} disabled={busy} onClick={toggle} className={`${track(value)} cursor-pointer disabled:cursor-default disabled:opacity-60`}>
        <span className={knob(value)} />
      </button>
      {problem ? (
        <span role="alert" className="text-[11.5px] font-semibold text-caution">
          {problem}
        </span>
      ) : null}
    </span>
  )
}

export function FixedSwitch({ on, label }: { on: boolean; label: string }) {
  return (
    <span role="switch" aria-checked={on} aria-disabled="true" aria-label={label} className={`${track(on)} opacity-60`}>
      <span className={knob(on)} />
    </span>
  )
}
