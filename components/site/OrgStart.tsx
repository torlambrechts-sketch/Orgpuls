'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { trackEvent } from '@/lib/marketing/events'
import { currentUtm } from '@/lib/marketing/utm'
import { normalizeOrgNumber, signupOrgNumber } from '@/lib/org-number'
import { useSiteMarket, useSiteNavigate, useSitePaths } from './SitePaths'

/**
 * The company's name and "Prøv gratis" in the band at the foot of each page (D-88, D-190, X-114;
 * nettside-v3/*.dc.html, `#kom-i-gang`).
 *
 * The design's field asked for the organisation number and answered "Vi henter 123 456 789 fra
 * Brønnøysundregistrene …". Since X-114 the sign-up starts from the company's name (D-279): the field
 * asks for it, a submit announces "Vi åpner registreringen for … …" in the live region, and
 * /registrer opens with the name filled in (`?firma=`), with the campaign tags the visit came with.
 * Somebody who types a number the market accepts anyway is sent on with it as the number (`?orgnr=`).
 * It is a GET form to /registrer, so it works before JavaScript has loaded.
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
  going,
  invalid,
  stacked = false,
}: {
  /** shown above the field (D-187): a placeholder alone disappears as the reader types */
  label: string
  placeholder: string
  submit: string
  /** with `{company}`: what was typed */
  going: string
  invalid: string
  /** the field fills its row and the button goes under it (the v3 start band, D-190) */
  stacked?: boolean
}) {
  const id = useId()
  const go = useSiteNavigate()
  // the number of the market this host signs up into, and the sign-up's address on this site (D-270)
  const market = useSiteMarket()
  const signUp = useSitePaths().address('/registrer')
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
      action={signUp}
      method="get"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const typed = value.trim().slice(0, 200)
        if (!typed) {
          setNote({ ok: false, text: invalid })
          input.current?.focus()
          return
        }
        // a number the market accepts goes on as the number; anything else is the company's name
        // (eight characters typed at least: the UK rule pads a short run of digits, and «123» is a name)
        const number = normalizeOrgNumber(typed).length >= 8 && signupOrgNumber(market, typed) ? normalizeOrgNumber(typed, market) : null
        setNote({ ok: true, text: going.replace('{company}', typed) })
        trackEvent('signup_started')
        const query = new URLSearchParams({ ...(number ? { orgnr: number } : { firma: typed }), ...currentUtm() })
        // a moment for the live region to be read before the page changes
        setTimeout(() => go(`/registrer?${query}`), 300)
      }}
    >
      <div className="flex flex-wrap gap-[9px]">
        <label htmlFor={`${id}-firma`} className="basis-full text-[13px] font-bold">
          {label}
        </label>
        <input
          ref={input}
          id={`${id}-firma`}
          name="firma"
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setNote(null)
          }}
          autoComplete="organization"
          maxLength={200}
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
