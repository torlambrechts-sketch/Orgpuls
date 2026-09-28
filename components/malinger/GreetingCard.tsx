'use client'

import { useState, useTransition } from 'react'
import { Section } from '@/components/maleoppsett/controls'
import { Button } from '@/components/ui/Button'
import { saveInviteGreeting } from '@/app/(app)/malinger/innstillinger-actions'

/**
 * The daglig leder's greeting in the invitation (0099, gap analysis P1-1): a few words on why
 * the organisation measures and what it will do with the answers, printed in the invitation
 * with the leader's name under it. A leader's words, so they may go in a mail; empty means
 * the invitation goes without one. Drawn with Innstillinger's own card and controls.
 */
export function GreetingCard({
  initial,
  canEdit,
  copy,
}: {
  initial: string
  canEdit: boolean
  copy: { head: string; lead: string; placeholder: string; save: string; saved: string; cleared: string; onlyLeader: string; failed: string }
}) {
  const [text, setText] = useState(initial)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  return (
    <Section head={copy.head}>
      <p className="m-0 mt-[7px] max-w-[600px] text-[13px] leading-[1.6] text-mut [text-wrap:pretty]">{copy.lead}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={600}
        disabled={!canEdit || pending}
        placeholder={copy.placeholder}
        aria-label={copy.head}
        className="mt-[12px] min-h-[96px] w-full resize-y rounded-cta border border-line bg-bg px-[14px] py-[12px] text-[13.5px] leading-[1.55] text-ink outline-none focus-visible:border-ink"
      />
      <div className="mt-[10px] flex flex-wrap items-center gap-[12px]">
        <Button
          size="sm"
          tone="primary"
          pad={15}
          disabled={!canEdit || pending || text.trim() === initial.trim()}
          onClick={() =>
            start(async () => {
              const result = await saveInviteGreeting(text)
              setNote(
                result.ok
                  ? { ok: true, text: text.trim() ? copy.saved : copy.cleared }
                  : { ok: false, text: result.problem === 'not_allowed' ? copy.onlyLeader : copy.failed },
              )
            })
          }
        >
          {copy.save}
        </Button>
        {!canEdit ? <span className="text-[12px] text-mut">{copy.onlyLeader}</span> : null}
        {note ? (
          <span role={note.ok ? 'status' : 'alert'} className={`text-[12.5px] ${note.ok ? 'text-link' : 'text-danger'}`}>
            {note.text}
          </span>
        ) : null}
      </div>
    </Section>
  )
}
