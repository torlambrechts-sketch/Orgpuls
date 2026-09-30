'use client'

import { useRef } from 'react'
import { arrowTarget, tabStop } from '@/lib/respond/radiogroup'

export interface ChoiceOption {
  value: number
  label: string
}

/**
 * One question's options as a radio group (WAI-ARIA APG): named by the statement's legend, each
 * option a radio with aria-checked, one tab stop for the group (the chosen option, else the
 * first), the arrow keys moving and choosing, Space choosing. The options stay <button>s, drawn
 * exactly as before (bundle lines 1893-1929), so the focus ring is the bundle's own
 * (app/globals.css, bundle line 23) and nothing on the screen moves.
 *
 * `apart` is «Ikke relevant for meg» (D-134): in the same group, since it answers the same
 * question, but set below the scale with its label muted until it is chosen, so it reads as
 * outside the scale rather than a sixth point on it.
 */
export function ChoiceGroup({
  labelledBy,
  options,
  apart,
  value,
  onChange,
}: {
  /** the id of the statement's legend */
  labelledBy: string
  options: ChoiceOption[]
  apart?: ChoiceOption | null
  value: number | undefined
  onChange: (value: number) => void
}) {
  const all = apart ? [...options, apart] : options
  const stop = tabStop(
    all.map((o) => o.value),
    value,
  )
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function radio(o: ChoiceOption, i: number, muted = false) {
    const on = value === o.value
    return (
      <button
        key={o.value}
        ref={(el) => {
          refs.current[i] = el
        }}
        type="button"
        role="radio"
        aria-checked={on}
        tabIndex={i === stop ? 0 : -1}
        onClick={() => onChange(o.value)}
        onKeyDown={(e) => {
          const to = arrowTarget(e.key, i, all.length)
          if (to === null || e.altKey || e.ctrlKey || e.metaKey) return
          e.preventDefault()
          onChange(all[to]!.value)
          refs.current[to]?.focus()
        }}
        className={`flex w-full cursor-pointer items-center gap-[13px] rounded-opt border px-[16px] py-[14px] text-left text-ink ${
          on ? 'border-ink bg-sbg' : 'border-line bg-sf'
        }`}
      >
        <span
          aria-hidden="true"
          className={`flex h-[23px] w-[23px] flex-none items-center justify-center rounded-pill border-2 ${
            on ? 'border-ink bg-ink' : 'border-rule bg-transparent'
          }`}
        >
          <span className={`block h-[8px] w-[8px] rounded-pill ${on ? 'bg-sbg' : 'bg-transparent'}`} />
        </span>
        <span className={`text-[14.5px] ${on ? 'font-bold' : `font-medium${muted ? ' text-mut' : ''}`}`}>{o.label}</span>
      </button>
    )
  }

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="mt-[16px]">
      <div className="flex flex-col gap-[9px]">{options.map((o, i) => radio(o, i))}</div>
      {apart ? <div className="mt-[12px] flex flex-col">{radio(apart, options.length, true)}</div> : null}
    </div>
  )
}
