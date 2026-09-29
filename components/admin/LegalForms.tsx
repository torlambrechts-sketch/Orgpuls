'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { legalReview, localePilot, translationsApprove, type AdminResult } from '@/lib/admin/actions'
import { Outcome, useKeptAction } from './ActionForms'

type Problems = Record<string, string>

/**
 * «Mark reviewed» on one legal document (X-096): the document as the page shows it, by its hash.
 * A document changed since the page was opened is refused as stale, and the page reloaded shows it.
 */
export function LegalReviewButton({ docKey, hash, labels }: { docKey: string; hash: string; labels: { submit: string; saving: string; done: string; problems: Problems } }) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(legalReview, null)
  return (
    <form action={action} className="flex flex-none flex-wrap items-center justify-end gap-[8px]">
      <input type="hidden" name="key" value={docKey} />
      <input type="hidden" name="hash" value={hash} />
      <Outcome state={state} problems={labels.problems} done={labels.done} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? labels.saving : labels.submit}
      </Button>
    </form>
  )
}

/** Approve a language's survey at once (0082): a box saying the texts were read, then the button. */
export function TranslationsApproveForm({
  locale,
  digest,
  open,
  labels,
}: {
  locale: string
  /** what the page showed (0082 app.translation_digest): the database refuses if it has changed */
  digest: string
  /** something is left to approve; when not, only the outcome of the last approval is shown */
  open: boolean
  labels: { read: string; submit: string; saving: string; done: string; problems: Problems }
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(translationsApprove, null)
  // kept ticked across a refusal, so trying again does not mean saying it again; cleared by an
  // approval, since what it said was read has then been approved
  const [read, setRead] = useState(false)
  // the answer shown: the last approval's, until there are new texts to approve
  const [outcome, setOutcome] = useState<AdminResult | null>(null)
  useEffect(() => {
    setOutcome(state)
    if (state?.ok) setRead(false)
  }, [state])
  const wasOpen = useRef(open)
  useEffect(() => {
    if (open && !wasOpen.current) setOutcome(null)
    wasOpen.current = open
  }, [open])
  // an approval that leaves nothing open takes the button away with it: the keyboard's focus
  // moves to the answer rather than falling to the page, once for that answer
  const answer = useRef<HTMLParagraphElement>(null)
  const focused = useRef<AdminResult | null>(null)
  useEffect(() => {
    if (!open && outcome?.ok && focused.current !== outcome) {
      focused.current = outcome
      answer.current?.focus()
    }
  }, [open, outcome])
  if (!open) {
    // only an approval's answer: a refusal belongs to a form that is no longer here
    return outcome?.ok ? (
      // the focus ring every control has (app/globals.css, bundle line 23)
      <p
        ref={answer}
        tabIndex={-1}
        className="m-0 rounded-[6px] outline-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <Outcome state={outcome} problems={labels.problems} done={labels.done} />
      </p>
    ) : null
  }
  return (
    <form
      // submitted by hand rather than as a form action, which React resets afterwards and would
      // clear the «read» box on a refusal
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(() => action(fd))
      }}
      className="flex flex-col gap-[10px]"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="digest" value={digest} />
      <label className="inline-flex items-start gap-[8px] text-[13px] leading-[1.5]">
        <input
          type="checkbox"
          name="read"
          required
          checked={read}
          onChange={(e) => setRead(e.target.checked)}
          className="mt-[3px] h-[16px] w-[16px] flex-none accent-ink"
        />
        <span>{labels.read}</span>
      </label>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Outcome state={outcome} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}

/** Offer a survey language to one organisation first (0085): its id and a reason, audited. */
export function LocalePilotForm({
  locales,
  labels,
}: {
  locales: readonly { code: string; name: string }[]
  labels: {
    locale: string
    org: string
    reason: string
    add: string
    remove: string
    saving: string
    done: string
    problems: Problems
  }
}) {
  const [reason, setReason] = useState('')
  const [org, setOrg] = useState('')
  const [state, action, pending] = useKeptAction(localePilot, () => setReason(''))
  const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
  const label = 'mb-[5px] block text-[12px] font-semibold'
  return (
    <form action={action} className="flex flex-col gap-[8px]">
      <div className="grid gap-[10px] [grid-template-columns:minmax(0,1fr)] sm:[grid-template-columns:minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block">
          <span className={label}>{labels.locale}</span>
          <select name="locale" className={`${field} h-[38px]`}>
            {locales.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>{labels.org}</span>
          <input name="org" required value={org} onChange={(e) => setOrg(e.target.value)} className={`${field} h-[38px] font-mono text-[12.5px]`} />
        </label>
        <label className="block">
          <span className={label}>{labels.reason}</span>
          <input name="reason" required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} h-[38px]`} />
        </label>
      </div>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" name="on" value="on" size="sm" disabled={pending}>
          {pending ? labels.saving : labels.add}
        </Button>
        <Button type="submit" name="on" value="off" size="sm" tone="secondary" disabled={pending}>
          {labels.remove}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}
