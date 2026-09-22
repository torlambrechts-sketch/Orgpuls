'use client'

import { useState, useTransition } from 'react'
import { saveBht } from '@/app/(app)/oppsett/actions'

/**
 * Bedriftshelsetjeneste. Bundle line 2102.
 *
 * Saved on blur rather than on every keystroke: a name is typed a character at a time and
 * a write per character is a write per character. The design draws a bare input with no
 * save button, so blur is the only moment that is both a real edit and not a round trip
 * per letter.
 */
export function BhtField({
  value,
  canWrite,
  label,
  placeholder,
  saved,
  denied,
}: {
  value: string
  canWrite: boolean
  label: string
  placeholder: string
  saved: string
  denied: string
}) {
  const [v, setV] = useState(value)
  const [state, setState] = useState<'idle' | 'saved' | 'problem'>('idle')
  const [, startTransition] = useTransition()

  return (
    <label className="mt-[16px] block border-t border-line pt-[14px]">
      <span className="mb-[6px] block text-[12.5px] font-semibold">{label}</span>
      <input
        value={v}
        onChange={(e) => {
          setV(e.target.value)
          setState('idle')
        }}
        onBlur={() => {
          if (!canWrite || v === value) return
          startTransition(async () => {
            const data = new FormData()
            data.set('bhtName', v)
            const result = await saveBht(data)
            setState(result.ok ? 'saved' : 'problem')
          })
        }}
        disabled={!canWrite}
        maxLength={120}
        placeholder={placeholder}
        className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
      />
      {state === 'idle' ? null : (
        <span
          className="mt-[6px] block text-[12px] leading-[1.5]"
          style={{ color: state === 'saved' ? '#2F5D2A' : '#A33A16' }}
        >
          {state === 'saved' ? saved : denied}
        </span>
      )}
    </label>
  )
}
