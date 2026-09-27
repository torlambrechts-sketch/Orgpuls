'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { legalApproveAll, legalSet, localePilot, translationsApprove, type AdminResult } from '@/lib/admin/actions'
import { Outcome, useKeptAction } from './ActionForms'

type Problems = Record<string, string>

/**
 * One text's «Approved» box (0082, D-130). Ticking it approves the text by the hash of what is
 * on the screen; clearing it withdraws that approval. It submits on change. The admin app needs
 * script to sign in at all (the second factor), so there is no script-less path here.
 */
export function LegalCheck({
  unitKey,
  hash,
  approved,
  label,
  labels,
}: {
  unitKey: string
  hash: string
  /** approved, and for this very text */
  approved: boolean
  /** names the text, for a screen reader: "Approved: <title>" */
  label: string
  labels: { approved: string; saving: string; done: string; problems: Problems }
}) {
  const [checked, setChecked] = useState(approved)
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(legalSet, null)
  // the box follows the database: after a save the page is revalidated and `approved` is the answer;
  // a refusal puts it back as it was
  useEffect(() => setChecked(approved), [approved])
  useEffect(() => {
    if (state && !state.ok) setChecked(approved)
  }, [state, approved])

  return (
    <form action={action} className="flex flex-none flex-col items-end gap-[4px]">
      <input type="hidden" name="key" value={unitKey} />
      <input type="hidden" name="hash" value={hash} />
      <label className="inline-flex cursor-pointer items-center gap-[8px] rounded-ctl border border-line bg-bg px-[11px] py-[7px] text-[13px] font-semibold">
        <input
          type="checkbox"
          name="approved"
          value="true"
          checked={checked}
          // not disabled while saving: a disabled box loses the keyboard's focus
          aria-disabled={pending}
          aria-label={label}
          onChange={(e) => {
            if (pending) return
            const next = e.target.checked
            setChecked(next)
            // the new value is sent as it is, not read back from the form after a render
            const fd = new FormData()
            fd.set('key', unitKey)
            fd.set('hash', hash)
            fd.set('approved', String(next))
            startTransition(() => action(fd))
          }}
          className="h-[16px] w-[16px] cursor-pointer accent-ink"
        />
        {pending ? labels.saving : labels.approved}
      </label>
      <Outcome state={state} problems={labels.problems} done={labels.done} />
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

/**
 * «Approve all» for one section of the legal review: the texts it lists that are open or changed,
 * each by the hash shown. Nothing to approve, nothing shown but the last answer.
 */
export function LegalApproveAll({
  units,
  labels,
}: {
  units: readonly { key: string; hash: string }[]
  labels: { submit: string; saving: string; done: string; problems: Problems }
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(legalApproveAll, null)
  if (!units.length) return state?.ok ? <Outcome state={state} problems={labels.problems} done={labels.done} /> : null
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-[8px]">
      <input type="hidden" name="units" value={JSON.stringify(units)} />
      <Outcome state={state} problems={labels.problems} done={labels.done} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? labels.saving : labels.submit}
      </Button>
    </form>
  )
}
