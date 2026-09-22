'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { closeThread, replyToThread, type ThreadActionResult } from '@/app/(app)/samtaler/actions'

/**
 * One conversation. Bundle lines 990-1013.
 *
 * A client component because the reply box and the send action live here. Everything it
 * prints was resolved by the server — the factor's name, the tone, the dates — so the
 * client holds no catalogue and no knowledge of what a thread state means.
 *
 * **There is no author on a message beyond "Ansatt · anonym", and that is the product.**
 * Nothing in the payload names the person, nothing names their department, and nothing
 * identifies the response. A leader replying here genuinely does not know who they are
 * answering, which is what makes it safe to write honestly in the first place.
 */

export interface ThreadMessage {
  author: 'ansatt' | 'leder'
  name: string
  when: string
  body: string
}

export interface ThreadCardProps {
  id: string
  canWrite: boolean
  view: {
    factor: string
    tone: string | null
    toneStyle?: { background: string; color: string }
    round: string
    age: string
    ageAlert: boolean
    borderColour: string
    flagged: boolean
    flagNote: string
    messages: ThreadMessage[]
  }
  labels: {
    placeholder: string
    send: string
    makeMeasure: string
    shareVerneombud: string
    close: string
    problems: Record<string, string>
  }
}

export function ThreadCard({ id, canWrite, view, labels }: ThreadCardProps) {
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<ThreadActionResult>) =>
    startTransition(async () => {
      const result = await fn()
      setProblem(result.ok ? null : result.problem)
      if (result.ok) setDraft('')
    })

  return (
    <div
      className="overflow-hidden rounded-panel border bg-sf"
      style={{ borderColor: view.borderColour }}
    >
      <div className="flex flex-wrap items-center justify-between gap-[12px] border-b border-line px-[20px] py-[15px]">
        <span className="flex min-w-0 flex-wrap items-center gap-[9px]">
          <span className="rounded-pill bg-sbg px-[11px] py-[4px] text-[11px] font-bold uppercase tracking-[0.04em]">
            {view.factor}
          </span>
          {view.tone ? (
            <span
              className="rounded-pill px-[11px] py-[4px] text-[11px] font-bold"
              style={view.toneStyle}
            >
              {view.tone}
            </span>
          ) : null}
          <span className="text-[12px] text-mut">{view.round}</span>
        </span>
        <span
          className={`flex-none text-[12.5px] font-bold ${
            view.ageAlert ? 'text-danger' : 'text-mut'
          }`}
        >
          {view.age}
        </span>
      </div>

      {view.flagged ? (
        <div className="flex items-start gap-[11px] bg-peach px-[20px] py-[13px]">
          <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-pill bg-sf text-[12px] font-bold text-dangerdeep">
            !
          </span>
          <span className="text-[12.5px] leading-[1.55] text-rustdeep [text-wrap:pretty]">
            {view.flagNote}
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-[10px] px-[20px] py-[18px]">
        {view.messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.author === 'leder' ? 'justify-end' : 'justify-start'}`}
          >
            <span
              className={`max-w-[88%] rounded-opt border px-[15px] py-[13px] ${
                m.author === 'leder' ? 'border-teal bg-mint' : 'border-line bg-bg'
              }`}
            >
              <span className="flex items-baseline justify-between gap-[12px]">
                <span className="text-[11px] font-bold text-mut">{m.name}</span>
                <span className="flex-none text-[11px] text-faint">{m.when}</span>
              </span>
              <span className="mt-[6px] block text-[13.5px] leading-[1.6] [text-wrap:pretty]">
                {m.body}
              </span>
            </span>
          </div>
        ))}
      </div>

      {canWrite ? (
        <form
          className="flex flex-wrap gap-[9px] px-[20px] pb-[16px]"
          action={() => {
            const data = new FormData()
            data.set('id', id)
            data.set('body', draft)
            run(() => replyToThread(data))
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            placeholder={labels.placeholder}
            className="h-[42px] min-w-[190px] flex-1 rounded-btn border border-line bg-bg px-[14px] text-[13.5px] text-ink outline-none"
          />
          {/* h42 / pad 18 / radius 11 at 13.5px — not a size in the scale (bundle 1025) */}
          <button
            type="submit"
            disabled={pending || draft.trim() === ''}
            className="inline-flex h-[42px] flex-none cursor-pointer items-center justify-center whitespace-nowrap rounded-btn border border-ink bg-ac px-[18px] text-[13.5px] font-bold text-ink"
          >
            {labels.send}
          </button>
        </form>
      ) : null}

      {problem ? (
        <p className="px-[20px] pb-[14px] text-[12.5px] leading-[1.5] text-danger">
          {labels.problems[problem] ?? labels.problems.denied}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-[8px] border-t border-line bg-bg px-[20px] py-[13px]">
        <Button size="xs" tone="secondary" pad={14} disabled>
          {labels.makeMeasure}
        </Button>
        <Button size="xs" tone="secondary" pad={14} disabled>
          {labels.shareVerneombud}
        </Button>
        <Button
          size="xs"
          tone="secondary"
          pad={14}
          className="text-mut"
          disabled={!canWrite || pending}
          onClick={() => {
            const data = new FormData()
            data.set('id', id)
            run(() => closeThread(data))
          }}
        >
          {labels.close}
        </Button>
      </div>
    </div>
  )
}
