'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { setResultsPage } from '@/app/(app)/resultater/share-actions'

/**
 * «Dette sa dere, dette gjør vi» from the daglig leder's side (0100, P1-3, D-151): the link to
 * the round's page for employees, which the results notice and the next invitation carry, and
 * the switch that hides it. Under the workspace, in the same card as the questions outside the
 * index. The page itself shows the whole organisation only; this card says so.
 */
export function SharePageCard({
  roundId,
  url,
  initialOn,
  opensOn,
  copy,
}: {
  roundId: string
  url: string
  initialOn: boolean
  /** the day the page opens to employees, while that is still ahead (0105); null once it is open */
  opensOn: string | null
  copy: { title: string; lead: string; linkLabel: string; copyLink: string; copied: string; open: string; on: string; off: string; hide: string; show: string; failed: string; onlyLeader: string }
}) {
  const [on, setOn] = useState(initialOn)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  return (
    <section className="mt-[14px] rounded-card border border-line bg-sf px-[22px] py-[20px]" aria-labelledby="ansattside">
      <h2 id="ansattside" className="m-0 font-display text-[20px] font-semibold leading-[1.2]">
        {copy.title}
      </h2>
      <p className="m-0 mt-[6px] max-w-[640px] text-[13px] leading-[1.55] text-mut [text-wrap:pretty]">{copy.lead}</p>
      <div className="mt-[12px] flex flex-wrap items-center gap-[10px]">
        <input
          readOnly
          value={url}
          aria-label={copy.linkLabel}
          onFocus={(e) => e.currentTarget.select()}
          className={`h-[36px] min-w-0 flex-1 basis-[280px] rounded-cta border border-line bg-bg px-[12px] text-[13px] outline-none focus-visible:border-ink ${on ? 'text-ink' : 'text-mut line-through'}`}
        />
        <Button
          size="sm"
          tone="secondary"
          pad={14}
          disabled={!on}
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(
              () => setNote({ ok: true, text: copy.copied }),
              () => setNote({ ok: false, text: copy.failed }),
            )
          }}
        >
          {copy.copyLink}
        </Button>
        {on && !opensOn ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-[12.5px] font-bold text-link">
            {copy.open}
          </a>
        ) : null}
      </div>
      <div className="mt-[12px] flex flex-wrap items-center gap-[12px]">
        <span className="text-[12.5px] text-body">{on ? (opensOn ?? copy.on) : copy.off}</span>
        <Button
          size="sm"
          tone={on ? 'ghost' : 'primary'}
          pad={14}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await setResultsPage(roundId, !on)
              if (result.ok) {
                setOn(result.on)
                setNote(null)
              } else setNote({ ok: false, text: result.problem === 'not_allowed' ? copy.onlyLeader : copy.failed })
            })
          }
        >
          {on ? copy.hide : copy.show}
        </Button>
        {note ? (
          <span role={note.ok ? 'status' : 'alert'} className={`text-[12.5px] ${note.ok ? 'text-link' : 'text-danger'}`}>
            {note.text}
          </span>
        ) : null}
      </div>
    </section>
  )
}
