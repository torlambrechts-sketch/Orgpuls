'use client'

import { startTransition, useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { legalSet, translationsApprove, type AdminResult } from '@/lib/admin/actions'
import { Outcome } from './ActionForms'

type Problems = Record<string, string>

/**
 * One text's «Approved» box (0082, D-130). Ticking it approves the text by the hash of what is
 * on the screen; clearing it withdraws the approval. It submits on change, and works as a plain
 * form with its button when script has not loaded.
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
  labels: { approved: string; save: string; saving: string; done: string; problems: Problems }
}) {
  const [checked, setChecked] = useState(approved)
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(async (prev, fd) => {
    const r = await legalSet(prev, fd)
    // a refusal puts the box back as the database has it
    if (!r.ok) setChecked(approved)
    return r
  }, null)

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
          disabled={pending}
          aria-label={label}
          onChange={(e) => {
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
      <noscript>
        <Button type="submit" size="sm" tone="secondary">
          {labels.save}
        </Button>
      </noscript>
      <Outcome state={state} problems={labels.problems} done={labels.done} />
    </form>
  )
}

/** Approve a language's survey at once (0082): a box saying the texts were read, then the button. */
export function TranslationsApproveForm({
  locale,
  labels,
}: {
  locale: string
  labels: { read: string; submit: string; saving: string; done: string; problems: Problems }
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(translationsApprove, null)
  return (
    <form action={action} className="flex flex-col gap-[10px]">
      <input type="hidden" name="locale" value={locale} />
      <label className="inline-flex items-start gap-[8px] text-[13px] leading-[1.5]">
        <input type="checkbox" name="read" required className="mt-[3px] h-[16px] w-[16px] flex-none accent-ink" />
        <span>{labels.read}</span>
      </label>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}
