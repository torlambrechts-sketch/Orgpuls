'use client'

import { useState } from 'react'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import { BTN, FIELD, FIELD_LABEL } from '@/components/admin/ui'
import { Button } from '@/components/ui/Button'
import { markMentionsSeen, saveCanned, setCannedActive } from '@/lib/admin/ticketActions'

type Words = { saving: string; done: string; problems: Record<string, string> }

/**
 * A canned reply (0135): its title in the reply box's list, its text, and where it sits in the
 * list. Fields are controlled, so a refused save keeps what was typed.
 */
export function CannedForm({
  reply,
  words,
}: {
  reply?: { id: string; title: string; body: string; sort: number }
  words: Words & { title: string; body: string; bodyHint: string; sort: string; save: string }
}) {
  const [title, setTitle] = useState(reply?.title ?? '')
  const [body, setBody] = useState(reply?.body ?? '')
  const [sort, setSort] = useState(String(reply?.sort ?? 0))
  const [state, action, pending] = useKeptAction(saveCanned, () => {
    if (!reply) {
      setTitle('')
      setBody('')
      setSort('0')
    }
  })
  return (
    <form action={action} className="flex flex-col gap-[14px]">
      <input type="hidden" name="id" value={reply?.id ?? ''} />
      <div className="grid gap-[14px] [grid-template-columns:minmax(0,1fr)] sm:[grid-template-columns:minmax(0,1fr)_120px]">
        <label className="block">
          <span className={FIELD_LABEL}>{words.title}</span>
          <input name="title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
        </label>
        <label className="block">
          <span className={FIELD_LABEL}>{words.sort}</span>
          <input name="sort" type="number" min={0} max={999} value={sort} onChange={(e) => setSort(e.target.value)} className={FIELD} />
        </label>
      </div>
      <label className="block">
        <span className={FIELD_LABEL}>{words.body}</span>
        <textarea
          name="body"
          required
          maxLength={10000}
          rows={9}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${FIELD} resize-y leading-[1.5]`}
        />
        <span className="mt-[6px] block text-[12px] text-mut">{words.bodyHint}</span>
      </label>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? words.saving : words.save}
        </Button>
        <Outcome state={state} problems={words.problems} done={words.done} />
      </span>
    </form>
  )
}

/** Archive or restore, in the row */
export function CannedToggle({ id, active, words }: { id: string; active: boolean; words: Words & { archive: string; restore: string } }) {
  const [state, action, pending] = useKeptAction(setCannedActive, () => undefined)
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-[8px]">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? 'no' : 'yes'} />
      {state && !state.ok ? <Outcome state={state} problems={words.problems} done={words.done} /> : null}
      <button type="submit" disabled={pending} className={BTN.row}>
        {pending ? words.saving : active ? words.archive : words.restore}
      </button>
    </form>
  )
}

/** «Mark all as seen» on the mentions list */
export function MentionsSeen({ words }: { words: Words & { label: string } }) {
  const [state, action, pending] = useKeptAction(async (prev) => markMentionsSeen(prev), () => undefined)
  return (
    <form action={action} className="flex flex-wrap items-center gap-[10px]">
      {state && !state.ok ? <Outcome state={state} problems={words.problems} done={words.done} /> : null}
      <button type="submit" disabled={pending} className={BTN.secondary}>
        {pending ? words.saving : words.label}
      </button>
    </form>
  )
}
