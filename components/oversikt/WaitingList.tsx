'use client'

import { useState, useTransition } from 'react'
import { replyToThread } from '@/app/(app)/kommentarer/actions'

export interface WaitingItem {
  id: string
  factor: string
  text: string
  age: string
  old: boolean
}

/**
 * "Venter på svar fra deg" (design 3, `ov.waiting`): the two comments that have waited
 * longest, each with the design's inline reply. The reply goes through the same action as
 * Kommentarer (`reply_to_thread`, which checks the employer's role in the database), and the
 * page is revalidated, so the answered comment leaves and the next one takes its place.
 *
 * Nothing typed is logged, and a failure returns a key, never the text (CLAUDE.md 7).
 */
export function WaitingList({
  items,
  labels,
}: {
  items: WaitingItem[]
  labels: { placeholder: string; replyAria: string; send: string; sent: string; problem: string; empty: string }
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'sent' | 'problem' | null>(null)
  const [pending, startTransition] = useTransition()

  if (items.length === 0) {
    return (
      <div className="rounded-cta bg-mint p-[16px] text-center text-[13px] font-semibold text-greendeep">{labels.empty}</div>
    )
  }

  const send = (id: string) => {
    const body = (drafts[id] ?? '').trim()
    if (!body) return
    startTransition(async () => {
      const data = new FormData()
      data.set('id', id)
      data.set('body', body)
      const result = await replyToThread(data)
      setStatus(result.ok ? 'sent' : 'problem')
      if (result.ok) setDrafts((d) => ({ ...d, [id]: '' }))
    })
  }

  return (
    <>
      {items.map((c) => (
        <div key={c.id} className="rounded-tile border border-line bg-bg px-[16px] py-[14px]">
          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="rounded-pill border border-line bg-sf px-[9px] py-[2px] text-[11px] font-bold">{c.factor}</span>
            <span className={`ml-auto text-[11.5px] font-semibold ${c.old ? 'text-danger' : 'text-mut'}`}>{c.age}</span>
          </div>
          <div className="mt-[8px] text-[14px] leading-[1.55] [text-wrap:pretty]">«{c.text}»</div>
          <form
            className="mt-[10px] flex gap-[8px]"
            onSubmit={(e) => {
              e.preventDefault()
              send(c.id)
            }}
          >
            <input
              value={drafts[c.id] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
              placeholder={labels.placeholder}
              aria-label={labels.replyAria}
              maxLength={4000}
              className="h-[38px] min-w-0 flex-1 rounded-ctl border border-line bg-sf px-[13px] text-[13px] text-ink outline-none"
            />
            <button
              type="submit"
              disabled={pending}
              className="h-[38px] flex-none cursor-pointer rounded-ctl border border-ink bg-ac px-[16px] text-[12.5px] font-bold text-ink disabled:cursor-default"
            >
              {labels.send}
            </button>
          </form>
        </div>
      ))}
      {status ? (
        <p role="status" className={`m-0 text-[12.5px] ${status === 'sent' ? 'text-greendeep' : 'text-danger'}`}>
          {status === 'sent' ? labels.sent : labels.problem}
        </p>
      ) : null}
    </>
  )
}
