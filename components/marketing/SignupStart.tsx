'use client'

import { useId, useRef, useState } from 'react'
import { trackEvent } from '@/lib/marketing/events'
import { currentUtm } from '@/lib/marketing/utm'
import { normalizeOrgNumber, signupOrgNumber } from '@/lib/org-number'
import { useSiteMarket, useSiteNavigate, useSitePaths } from '@/components/site/SitePaths'

/**
 * The first step of registering, on the page a visitor is already reading: the company's name and
 * "Start gratis" (X-114, D-279). It opens /registrer with the name filled in (`?firma=`), and the
 * campaign tags the visit came with (lib/marketing/utm). Somebody who types a number the market
 * accepts is sent on with it as the number (`?orgnr=`).
 *
 * It is an ordinary GET form, so it works before JavaScript has loaded; with it, an empty field is
 * caught here, with a message that says what is missing.
 */
export function SignupStart({
  label,
  submit,
  invalid,
  tone = 'light',
}: {
  label: string
  submit: string
  invalid: string
  /** on the dark closing block of the industry pages */
  tone?: 'light' | 'dark'
}) {
  const go = useSiteNavigate()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  // the market this host signs up into, and the sign-up's address on this site (D-270)
  const market = useSiteMarket()
  const signUp = useSitePaths().address('/registrer')

  return (
    <form
      action={signUp}
      method="get"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const typed = (input.current?.value ?? '').trim().slice(0, 200)
        if (!typed) {
          setError(invalid)
          input.current?.focus()
          return
        }
        // a number the market accepts goes on as the number (eight characters typed at least: the UK
        // rule pads a short run of digits); anything else is the company's name
        const number = normalizeOrgNumber(typed).length >= 8 && signupOrgNumber(market, typed) ? normalizeOrgNumber(typed, market) : null
        trackEvent('signup_started')
        const query = new URLSearchParams({ ...(number ? { orgnr: number } : { firma: typed }), ...currentUtm() })
        go(`/registrer?${query}`)
      }}
      className="w-full max-w-[460px]"
    >
      <label htmlFor={`${id}-firma`} className={`mb-[7px] block text-[13px] font-bold ${tone === 'dark' ? 'text-bg' : ''}`}>
        {label}
      </label>
      <div className="flex flex-wrap gap-[10px]">
        <input
          ref={input}
          id={`${id}-firma`}
          name="firma"
          autoComplete="organization"
          maxLength={200}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={() => error && setError(null)}
          className={`h-[50px] min-w-0 flex-[1_1_150px] rounded-tile border-[1.5px] bg-sf px-[16px] text-[18px] font-semibold text-ink ${
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
