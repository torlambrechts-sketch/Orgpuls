'use client'

import { startTransition, useActionState, useState } from 'react'
import { siteNoticeSet } from '@/lib/admin/cmsActions'
import type { AdminResult } from '@/lib/admin/actions'
import { BTN, FIELD, FIELD_LABEL } from './ui'
import { Outcome } from './ActionForms'

/**
 * The site notice (0123), the design's «Splash page»: the switch in the card's corner turns it on or
 * off at once with the words below; «Edit notice» opens the words. On with no bokmål text is refused.
 */
export function SiteNoticeForm({
  on,
  no,
  en,
  canWrite,
  labels,
}: {
  on: boolean
  no: string
  en: string
  canWrite: boolean
  labels: { switch: string; edit: string; no: string; en: string; save: string; saving: string; done: string; problems: Record<string, string> }
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(siteNoticeSet, null)
  const [texts, setTexts] = useState({ no, en })
  const [editing, setEditing] = useState(false)
  const submit = (next: boolean) => {
    const fd = new FormData()
    fd.set('on', next ? 'on' : 'off')
    fd.set('no', texts.no)
    fd.set('en', texts.en)
    startTransition(() => action(fd))
  }
  return (
    <div>
      <div className="absolute right-[26px] top-[24px]">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={labels.switch}
          disabled={!canWrite || pending}
          onClick={() => submit(!on)}
          className={`relative block h-[22px] w-[38px] flex-none cursor-pointer rounded-pill border-0 p-0 disabled:cursor-default ${on ? 'bg-ink' : 'bg-line'}`}
        >
          <span aria-hidden="true" className={`absolute top-[2px] block h-[18px] w-[18px] rounded-pill bg-sf transition-[left] ${on ? 'left-[18px]' : 'left-[2px]'}`} />
        </button>
      </div>
      {editing ? (
        <form
          className="mt-[16px] flex flex-col gap-[12px]"
          onSubmit={(e) => {
            e.preventDefault()
            submit(on)
          }}
        >
          <label className="block">
            <span className={FIELD_LABEL}>{labels.no}</span>
            <input value={texts.no} maxLength={300} onChange={(e) => setTexts({ ...texts, no: e.target.value })} className={FIELD} />
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>{labels.en}</span>
            <input value={texts.en} maxLength={300} onChange={(e) => setTexts({ ...texts, en: e.target.value })} className={FIELD} />
          </label>
          <span className="flex flex-wrap items-center gap-[10px]">
            <button type="submit" disabled={pending} className={BTN.dark}>
              {pending ? labels.saving : labels.save}
            </button>
            <Outcome state={state} problems={labels.problems} done={labels.done} />
          </span>
        </form>
      ) : (
        <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
          {canWrite ? (
            <button type="button" onClick={() => setEditing(true)} className={BTN.secondary}>
              {labels.edit}
            </button>
          ) : null}
          <Outcome state={state} problems={labels.problems} done={labels.done} />
        </div>
      )}
    </div>
  )
}
