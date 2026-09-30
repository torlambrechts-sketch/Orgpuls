'use client'

import { useActionState, useState } from 'react'
import { rateCase } from '@/app/(marketing)/vurdering/actions'
import { COMMENT_MAX, type CsatResult } from '@/lib/csat/parse'

const cta =
  'mt-[6px] h-[50px] cursor-pointer self-start rounded-tile border border-ink bg-ac px-[22px] text-[15.5px] font-bold text-ink disabled:cursor-default disabled:opacity-70'

type Words = {
  legend: string
  scores: Record<'1' | '2' | '3' | '4' | '5', string>
  comment: string
  commentHint: string
  submit: string
  sending: string
  thanksTitle: string
  thanksLead: string
  problems: Record<'invalid' | 'invalid_rating' | 'too_long' | 'rate_limited' | 'failed', string>
}

/**
 * The rating (0135): five choices from «very poor» to «very good», a comment if wanted, one press.
 * The choices are radio buttons drawn as the site's option boxes (as the newsletter's lists), so
 * the arrow keys move between them and the focus ring shows where you are. Nothing is sent until
 * the button is pressed, so a mail program's link check cannot rate anything.
 */
export function CsatForm({ token, words: w }: { token: string; words: Words }) {
  const [rating, setRating] = useState('')
  const [comment, setComment] = useState('')
  const [state, action, pending] = useActionState<CsatResult | null, FormData>(rateCase, null)

  if (state?.ok) {
    return (
      <div role="status" className="mt-[18px]">
        <p className="m-0 font-display text-[22px] font-semibold leading-[1.2]">{w.thanksTitle}</p>
        <p className="m-0 mt-[8px] max-w-[46ch] text-[14px] leading-[1.6] text-body">{w.thanksLead}</p>
      </div>
    )
  }

  return (
    <form action={action} className="mt-[18px] flex flex-col gap-[10px]">
      <input type="hidden" name="key" value={token} />
      <fieldset className="m-0 flex flex-col gap-[8px] border-0 p-0">
        <legend className="mb-[8px] p-0 text-[13.5px] font-bold">{w.legend}</legend>
        {(['5', '4', '3', '2', '1'] as const).map((n) => (
          <label
            key={n}
            className="flex cursor-pointer items-center gap-[11px] rounded-tile border-[1.5px] bg-bg px-[14px] py-[12px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink"
            style={{ borderColor: rating === n ? '#191510' : '#E8DFC9' }}
          >
            <input
              type="radio"
              name="rating"
              value={n}
              required
              checked={rating === n}
              onChange={() => setRating(n)}
              className="h-[16px] w-[16px] flex-none cursor-pointer accent-ink"
            />
            <span className="text-[14px] font-bold">{w.scores[n]}</span>
          </label>
        ))}
      </fieldset>
      <label className="mt-[6px] block">
        <span className="mb-[6px] block text-[13.5px] font-bold">{w.comment}</span>
        <textarea
          name="comment"
          rows={4}
          maxLength={COMMENT_MAX}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="box-border block w-full resize-y rounded-tile border-[1.5px] border-line bg-bg px-[14px] py-[12px] text-[14px] leading-[1.5] text-ink outline-none focus-visible:border-ink"
        />
        <span className="mt-[5px] block text-[12.5px] leading-[1.5] text-mut">{w.commentHint}</span>
      </label>
      <button type="submit" disabled={pending} className={cta}>
        {pending ? w.sending : w.submit}
      </button>
      {state && !state.ok ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {w.problems[state.problem]}
        </p>
      ) : null}
    </form>
  )
}
