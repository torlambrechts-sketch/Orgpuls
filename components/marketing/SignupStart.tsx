'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { trackEvent } from '@/lib/marketing/events'
import { currentUtm } from '@/lib/marketing/utm'
import { hasValidCheckDigit } from '@/lib/brreg/orgnr'

/**
 * The first step of registering, on the page a visitor is already reading: their
 * organisation number and "Start gratis". It opens /registrer with the number filled in
 * and looked up, and the campaign tags the visit came with (lib/marketing/utm).
 *
 * It is an ordinary GET form, so it works before JavaScript has loaded; with it, a number
 * that is not nine digits is caught here, with a message that says what is wrong.
 */
export function SignupStart({
  label,
  submit,
  invalid,
  invalidChecksum,
  tone = 'light',
}: {
  label: string
  submit: string
  invalid: string
  /** nine digits that fail the check digit: a number that cannot exist in the register */
  invalidChecksum?: string
  /** on the dark closing block of the industry pages */
  tone?: 'light' | 'dark'
}) {
  const router = useRouter()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      action="/registrer"
      method="get"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const orgnr = (input.current?.value ?? '').replace(/\s/g, '')
        const problem = !/^\d{9}$/.test(orgnr)
          ? invalid
          : invalidChecksum && !hasValidCheckDigit(orgnr)
            ? invalidChecksum
            : null
        if (problem) {
          setError(problem)
          input.current?.focus()
          return
        }
        trackEvent('signup_started')
        const query = new URLSearchParams({ orgnr, ...currentUtm() })
        router.push(`/registrer?${query}` as Route)
      }}
      className="w-full max-w-[460px]"
    >
      <label htmlFor={`${id}-orgnr`} className={`mb-[7px] block text-[13px] font-bold ${tone === 'dark' ? 'text-bg' : ''}`}>
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
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={() => error && setError(null)}
          className={`h-[50px] min-w-0 flex-[1_1_150px] rounded-tile border-[1.5px] bg-sf px-[16px] text-[18px] font-semibold tracking-[0.06em] text-ink ${
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
        <p
          id={`${id}-error`}
          role="alert"
          className={`mb-0 mt-[8px] text-[13px] font-semibold ${tone === 'dark' ? 'text-ac' : 'text-danger'}`}
        >
          {error}
        </p>
      ) : null}
    </form>
  )
}
