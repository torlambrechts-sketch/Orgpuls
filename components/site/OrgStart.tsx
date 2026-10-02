'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { trackEvent } from '@/lib/marketing/events'
import { currentUtm } from '@/lib/marketing/utm'

/**
 * "Organisasjonsnummer" and "Prøv gratis" in the band at the foot of each page (D-88, D-190;
 * nettside-v3/*.dc.html, `#kom-i-gang`).
 *
 * The design answers a submit with a line under the field: "Vi henter 123 456 789 fra
 * Brønnøysundregistrene …" for nine digits, "Et organisasjonsnummer har 9 sifre." for anything
 * else. Here the first is also what happens: the line is announced, then /registrer opens with the
 * number filled in and looked up, with the campaign tags the visit came with. It is a GET form to
 * /registrer, so it works before JavaScript has loaded.
 *
 * The field (G-12): a visible label above it (D-187), 16px text, a border dark enough to see
 * (#8A8272, 3:1), and a polite live region that is always in the page, empty until a submit. An
 * error keeps focus in the field and is tied to it (`aria-describedby`). Arriving at the band
 * (`#kom-i-gang`, from any «Prøv gratis» on the page) puts focus in the field once the browser has
 * scrolled there.
 */
export function OrgStart({
  label,
  placeholder,
  submit,
  fetching,
  invalid,
  stacked = false,
}: {
  /** shown above the field (D-187): a placeholder alone disappears as the reader types */
  label: string
  placeholder: string
  submit: string
  /** with `{orgnr}`, grouped in threes */
  fetching: string
  invalid: string
  /** the field fills its row and the button goes under it (the v3 start band, D-190) */
  stacked?: boolean
}) {
  const id = useId()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  // adoption 1.3: a link to the band lands in the field (after the browser's own scroll)
  useEffect(() => {
    const field = input.current
    if (!field?.closest('#kom-i-gang')) return
    const land = () => setTimeout(() => field?.focus({ preventScroll: true }), 0)
    const onHash = () => location.hash === '#kom-i-gang' && land()
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]')
      if (a && new URL((a as HTMLAnchorElement).href).hash === '#kom-i-gang' && (a as HTMLAnchorElement).pathname === location.pathname) land()
    }
    window.addEventListener('hashchange', onHash)
    document.addEventListener('click', onClick)
    onHash()
    return () => {
      window.removeEventListener('hashchange', onHash)
      document.removeEventListener('click', onClick)
    }
  }, [])

  const error = note && !note.ok
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
          input.current?.focus()
          return
        }
        // the org.nr. grouped in threes with narrow no-break spaces (copy T2)
        setNote({ ok: true, text: fetching.replace('{orgnr}', digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')) })
        trackEvent('signup_started')
        // a moment for the live region to be read before the page changes
        setTimeout(() => router.push(`/registrer?${new URLSearchParams({ orgnr: digits, ...currentUtm() })}` as Route), 300)
      }}
    >
      <div className="flex flex-wrap gap-[9px]">
        <label htmlFor={`${id}-orgnr`} className="basis-full text-[13px] font-bold">
          {label}
        </label>
        <input
          ref={input}
          id={`${id}-orgnr`}
          name="orgnr"
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setNote(null)
          }}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-note` : undefined}
          className={`h-[52px] ${stacked ? 'w-full min-w-0' : 'min-w-[200px] flex-1'} rounded-tile border bg-bg px-[16px] text-[16px] text-ink placeholder:text-mut ${
            error ? 'border-danger' : 'border-faint'
          }`}
        />
        <button
          type="submit"
          className="min-h-[52px] cursor-pointer rounded-tile border border-ink bg-ac px-[22px] text-[16px] font-bold text-ink"
        >
          {submit}
        </button>
      </div>
      <p
        id={`${id}-note`}
        aria-live="polite"
        aria-atomic="true"
        className={`m-0 text-[13px] leading-[1.5] ${note ? 'mt-[9px]' : ''} ${note?.ok ? 'text-link' : 'text-danger'}`}
      >
        {note?.text}
      </p>
    </form>
  )
}
