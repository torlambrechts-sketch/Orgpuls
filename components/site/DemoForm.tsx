'use client'

import { useState, useTransition } from 'react'
import { requestDemo } from '@/lib/demo/actions'

/**
 * The demo's request form (D-143). No design exists for it; it is the newsletter's form
 * (NewsletterForms.tsx) with one field and the consent box, so it reads as the same site. The
 * box is never ticked for the visitor: consent is what they give, not what we assume.
 */
const field = 'h-[46px] rounded-cta border border-line bg-bg px-[14px] text-[14.5px] font-normal text-ink'
const cta =
  'mt-[6px] h-[50px] cursor-pointer rounded-tile border border-ink bg-ac px-[22px] text-[15.5px] font-bold text-ink disabled:cursor-default disabled:opacity-70'

type Words = {
  mail: string
  consent: string
  submit: string
  sending: string
  sentTitle: string
  /** with `{mail}` */
  sentLead: string
  invalid: string
  limited: string
  closed: string
  failed: string
}

export function DemoRequest({ words: w, lang }: { words: Words; lang: 'no' | 'en' }) {
  const [mail, setMail] = useState('')
  const [consent, setConsent] = useState(false)
  const [trap, setTrap] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [sending, start] = useTransition()

  if (sent) {
    return (
      <div role="status" className="mt-[18px] rounded-cta border border-line bg-sbg px-[16px] py-[14px]">
        <p className="m-0 text-[15px] font-bold">{w.sentTitle}</p>
        <p className="m-0 mt-[4px] text-[14px] leading-[1.6] text-body">{w.sentLead.replace('{mail}', sent)}</p>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="mt-[18px] flex flex-col gap-[12px]"
      onSubmit={(e) => {
        e.preventDefault()
        if (!/.+@.+\..+/.test(mail.trim())) {
          setProblem(w.invalid)
          return
        }
        start(async () => {
          const r = await requestDemo({ mail, consent, lang, trap }).catch(() => null)
          if (r?.ok) setSent(mail.trim())
          else
            setProblem(
              r?.problem === 'invalid' ? w.invalid : r?.problem === 'limited' ? w.limited : r?.problem === 'closed' ? w.closed : w.failed,
            )
        })
      }}
    >
      <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
        {w.mail}
        <input
          value={mail}
          type="email"
          autoComplete="email"
          required
          onChange={(e) => (setMail(e.target.value), setProblem(null))}
          className={field}
        />
      </label>
      <label className="flex items-start gap-[10px] text-[13.5px] font-normal leading-[1.5] text-body">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-[3px] h-[16px] w-[16px] flex-none accent-ink"
        />
        <span>{w.consent}</span>
      </label>
      {/* for form bots only: off screen, out of the tab order, hidden from assistive technology */}
      <input
        name="website"
        value={trap}
        onChange={(e) => setTrap(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-10000px] h-px w-px overflow-hidden"
      />
      <button type="submit" disabled={sending} className={cta}>
        {sending ? w.sending : w.submit}
      </button>
      {problem ? (
        <span role="alert" className="text-[13px] leading-[1.5] text-danger">
          {problem}
        </span>
      ) : null}
    </form>
  )
}
