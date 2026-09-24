'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { replyToThread } from '@/app/(app)/kommentarer/actions'

/**
 * Resultat's Samtaler column: the round's comments, three at most, with a reply box on
 * the ones still waiting. Bundle lines 889-918 (markup), 3690 (state).
 *
 * Omitted until the two-way thread existed (D-14). It reads the same k-gated
 * `public.conversations()` that Samtaler does, for the selected round, so a comment from
 * a group under the threshold is absent here for the same reason it is absent there. A
 * reply goes through the same `reply_to_thread`. D-54.
 *
 * A client component for the reply box only; every string arrives resolved, as on
 * Samtaler's own card, so the client holds no catalogue and no free text is logged.
 */

export interface ColumnThread {
  id: string
  /** the factor's compact name, as the design's label */
  factor: string
  /** the comment itself */
  text: string
  /** "venter · 6 dager" or "besvart" */
  age: string
  late: boolean
  /** the latest leadership reply, if any */
  reply: string | null
  /** still waiting, and the viewer may reply */
  open: boolean
}

export interface ColumnLabels {
  head: string
  seeAll: string
  lead: string
  replied: string
  placeholder: string
  send: string
  problems: Record<string, string>
}

export function ConversationColumn({ threads, labels }: { threads: ColumnThread[]; labels: ColumnLabels }) {
  return (
    <div className="min-w-0 border-line px-[28px] py-[24px] max-md:px-[18px] md:col-start-2 md:border-l">
      <span className="flex flex-wrap items-baseline justify-between gap-[12px]">
        <span className="font-display text-[21px] font-semibold">{labels.head}</span>
        {/* the design's button to Samtaler, as the link it is (D-06) */}
        <Link
          href="/kommentarer"
          className="inline-flex h-[30px] items-center rounded-bar border border-line bg-transparent px-[12px] text-[12px] font-semibold text-ink no-underline hover:text-ink hover:no-underline"
        >
          {labels.seeAll}
        </Link>
      </span>
      <span className="mt-[3px] block text-[12.5px] text-mut">{labels.lead}</span>
      <div className="mt-[14px] flex flex-col gap-[10px]">
        {threads.map((c) => (
          <Thread key={c.id} thread={c} labels={labels} />
        ))}
      </div>
    </div>
  )
}

function Thread({ thread: c, labels }: { thread: ColumnThread; labels: ColumnLabels }) {
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="rounded-tile border border-line bg-sf px-[16px] py-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <span className="text-[11px] uppercase tracking-[0.09em] text-mut">{c.factor}</span>
        <span className="text-[11.5px]" style={{ color: c.late ? '#A33A16' : '#5F5849' }}>
          {c.age}
        </span>
      </div>
      <div className="mt-[7px] text-[13.5px] leading-[1.55] [text-wrap:pretty]">«{c.text}»</div>

      {c.reply ? (
        <div className="mt-[10px] rounded-ctl bg-mint px-[13px] py-[11px] text-[13px] leading-[1.5] [text-wrap:pretty]">
          <strong>{labels.replied}</strong> {c.reply}
        </div>
      ) : null}

      {c.open ? (
        <form
          className="mt-[11px] flex flex-wrap gap-[9px]"
          action={() =>
            start(async () => {
              setProblem(null)
              const data = new FormData()
              data.set('id', c.id)
              data.set('body', draft)
              const result = await replyToThread(data)
              if (result.ok) setDraft('')
              else setProblem(result.problem)
            })
          }
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            className="h-[38px] min-w-[150px] flex-1 rounded-ctl border border-line bg-bg px-[13px] text-[13px] text-ink outline-none"
          />
          <button
            type="submit"
            disabled={pending || draft.trim() === ''}
            className="inline-flex h-[38px] flex-none cursor-pointer items-center justify-center rounded-ctl border border-ink bg-ac px-[16px] text-[12.5px] font-bold text-ink disabled:cursor-default"
          >
            {labels.send}
          </button>
        </form>
      ) : null}

      {problem ? (
        <p role="alert" className="mt-[8px] text-[12.5px] leading-[1.5] text-danger">
          {labels.problems[problem] ?? labels.problems.denied}
        </p>
      ) : null}
    </div>
  )
}
