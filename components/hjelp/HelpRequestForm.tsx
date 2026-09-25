'use client'

import { useId, useState, useTransition } from 'react'
import { sendHelpRequest } from '@/app/(app)/hjelp/actions'
import { REQUEST_CATEGORIES } from '@/lib/help/request'

type Labels = {
  open: string
  category: string
  categories: Record<(typeof REQUEST_CATEGORIES)[number], string>
  subject: string
  body: string
  bodyHint: string
  send: string
  sending: string
  /** with `{number}` */
  sent: string
  invalid: string
  limited: string
  failed: string
}

/**
 * "Skriv til oss her" (D-92): a request to Orgpuls from inside the product, filed as a ticket
 * with the member's organisation, role and browser, so nobody has to be asked for them. A survey answer does not belong here, and the hint says so.
 */
export function HelpRequestForm({ labels: l }: { labels: Labels }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<(typeof REQUEST_CATEGORIES)[number]>('getting_started')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [sending, start] = useTransition()

  const field = 'box-border w-full rounded-ctl border border-line bg-sf px-[11px] text-[13px] text-ink outline-none'

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-[11px] inline-flex h-[34px] cursor-pointer items-center justify-center rounded-bar border border-ink bg-ac px-[14px] text-[12.5px] font-bold text-ink"
      >
        {l.open}
      </button>
    )
  }

  return (
    <form
      className="mt-[12px] flex flex-col gap-[10px]"
      onSubmit={(e) => {
        e.preventDefault()
        if (!body.trim()) {
          setNote({ ok: false, text: l.invalid })
          return
        }
        start(async () => {
          // no page: the product sends no referrer (it protects the respondent's token), so
          // the page someone came from is not known here, and /hjelp itself says nothing
          const browser = navigator.userAgent.slice(0, 400)
          const r = await sendHelpRequest({ category, subject, body, page: '', browser }).catch(() => null)
          if (r?.ok) {
            setSubject('')
            setBody('')
            setNote({ ok: true, text: l.sent.replace('{number}', String(r.number)) })
          } else {
            setNote({
              ok: false,
              text: r?.problem === 'rate_limited' ? l.limited : r?.problem === 'invalid' ? l.invalid : l.failed,
            })
          }
        })
      }}
    >
      <label className="block text-[12px] font-semibold">
        <span className="mb-[5px] block">{l.category}</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className={`${field} h-[36px]`}>
          {REQUEST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {l.categories[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[12px] font-semibold">
        <span className="mb-[5px] block">{l.subject}</span>
        <input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className={`${field} h-[36px]`} />
      </label>
      <label className="block text-[12px] font-semibold">
        <span className="mb-[5px] block">{l.body}</span>
        <textarea
          value={body}
          required
          maxLength={5000}
          rows={5}
          aria-describedby={`${id}-hint`}
          onChange={(e) => (setBody(e.target.value), setNote(null))}
          className={`${field} resize-y py-[8px] leading-[1.5]`}
        />
        <span id={`${id}-hint`} className="mt-[5px] block text-[11.5px] font-normal leading-[1.45] text-mut">
          {l.bodyHint}
        </span>
      </label>
      <button
        type="submit"
        disabled={sending}
        className="inline-flex h-[34px] cursor-pointer items-center justify-center self-start rounded-bar border border-ink bg-ac px-[14px] text-[12.5px] font-bold text-ink disabled:cursor-default disabled:opacity-60"
      >
        {sending ? l.sending : l.send}
      </button>
      {note ? (
        <span
          role={note.ok ? 'status' : 'alert'}
          className={`text-[12.5px] leading-[1.5] ${note.ok ? 'text-link' : 'text-danger'}`}
        >
          {note.text}
        </span>
      ) : null}
    </form>
  )
}
