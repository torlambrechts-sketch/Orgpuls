'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { trackEvent } from '@/lib/marketing/events'
import { currentUtm } from '@/lib/marketing/utm'

/**
 * The first step of registering, on the page a visitor is already reading: their
 * organisation number and "Start gratis". It opens /registrer with the number filled in
 * and looked up, and the campaign tags the visit came with (lib/marketing/utm).
 *
 * It is an ordinary GET form, so it works before JavaScript has loaded; with it, a number
 * that is not nine digits is caught here, with a message that says what is wrong.
 */
export function SignupStart({ label, submit, invalid }: { label: string; submit: string; invalid: string }) {
  const router = useRouter()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState(false)

  return (
    <form
      action="/registrer"
      method="get"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const orgnr = (input.current?.value ?? '').replace(/\s/g, '')
        if (!/^\d{9}$/.test(orgnr)) {
          setError(true)
          input.current?.focus()
          return
        }
        trackEvent('signup_started')
        const query = new URLSearchParams({ orgnr, ...currentUtm() })
        router.push(`/registrer?${query}` as Route)
      }}
      className="w-full max-w-[460px]"
    >
      <label htmlFor={`${id}-orgnr`} className="mb-[7px] block text-[13px] font-bold">
        {label}
      </label>
      <div className="flex flex-wrap gap-[10px]">
        <input
          ref={input}
          id={`${id}-orgnr`}
          name="orgnr"
          inputMode="numeric"
          autoComplete="off"
          maxLength={11}
          aria-invalid={error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={() => error && setError(false)}
          className={`h-[50px] min-w-0 flex-[1_1_180px] rounded-tile border-[1.5px] bg-sf px-[16px] text-[18px] font-semibold tracking-[0.06em] text-ink ${
            error ? 'border-danger' : 'border-line'
          }`}
        />
        <button
          type="submit"
          className="inline-flex h-[50px] flex-none cursor-pointer items-center rounded-tile border border-ink bg-ac px-[24px] text-[16px] font-bold text-ink"
        >
          {submit}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mb-0 mt-[8px] text-[13px] font-semibold text-danger">
          {invalid}
        </p>
      ) : null}
    </form>
  )
}
