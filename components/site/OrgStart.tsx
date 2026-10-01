'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { trackEvent } from '@/lib/marketing/events'
import { currentUtm } from '@/lib/marketing/utm'

/**
 * "Organisasjonsnummer" and "Kom i gang" in the band at the foot of each page (D-88;
 * nettside/*.dc.html, `#kom-i-gang`).
 *
 * The design answers a submit with a line under the field: "Vi henter 123 456 789 fra
 * Brønnøysundregistrene …" for nine digits, "Et organisasjonsnummer har ni sifre." for
 * anything else. Here the first is also what happens: the line shows while /registrer opens
 * with the number filled in and looked up, with the campaign tags the visit came with. It is
 * a GET form to /registrer, so it works before JavaScript has loaded.
 */
export function OrgStart({
  label,
  placeholder,
  submit,
  fetching,
  invalid,
}: {
  /** shown above the field (D-187): a placeholder alone disappears as the reader types */
  label: string
  placeholder: string
  submit: string
  /** with `{orgnr}`, grouped in threes */
  fetching: string
  invalid: string
}) {
  const id = useId()
  const router = useRouter()
  const [value, setValue] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <form
      action="/registrer"
      method="get"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const digits = value.replace(/\D/g, '')
        if (digits.length !== 9) {
          setNote({ ok: false, text: invalid })
          return
        }
        setNote({ ok: true, text: fetching.replace('{orgnr}', digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')) })
        trackEvent('signup_started')
        router.push(`/registrer?${new URLSearchParams({ orgnr: digits, ...currentUtm() })}` as Route)
      }}
      className="flex flex-wrap gap-[9px]"
    >
      <label htmlFor={`${id}-orgnr`} className="basis-full text-[13px] font-bold">
        {label}
      </label>
      <input
        id={`${id}-orgnr`}
        name="orgnr"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setNote(null)
        }}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={note ? !note.ok : undefined}
        className="h-[52px] min-w-[200px] flex-1 rounded-tile border border-line bg-bg px-[16px] text-[16px] text-ink"
      />
      <button
        type="submit"
        className="h-[52px] cursor-pointer rounded-tile border border-ink bg-ac px-[22px] text-[16px] font-bold text-ink"
      >
        {submit}
      </button>
      {note ? (
        <span
          role={note.ok ? 'status' : 'alert'}
          className={`basis-full text-[13px] leading-[1.5] ${note.ok ? 'text-link' : 'text-danger'}`}
        >
          {note.text}
        </span>
      ) : null}
    </form>
  )
}
