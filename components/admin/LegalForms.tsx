'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { legalSet, translationsApprove, type AdminResult } from '@/lib/admin/actions'
import { Outcome } from './ActionForms'

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
