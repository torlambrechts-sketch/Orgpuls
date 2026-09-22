'use client'

import { useState, useTransition } from 'react'
import { submitResponse, type SubmitResult } from '@/app/s/[token]/actions'

/**
 * The respondent flow. Bundle lines 1893-1929.
 *
 * One question at a time, the factor visible above it, the comment optional. The design
 * shows this inside a phone mock on the Målinger preview; here it is the whole surface,
 * so the phone chrome is not reproduced — everything inside the mock's screen is.
 *
 * Answers accumulate in this component and are sent once, when the last question is
 * answered, because that is what the design's "Send inn" does. A skipped question sends
 * no value; a comment on a skipped question is still sent, because the person wrote it.
 *
 * Nothing here is derived. The questions, their order, the option labels and the
 * threshold all arrive as props, resolved on the server from the database and next-intl.
 * In particular the ORDER is the server's: rpc.respond_form shuffles it per token,
 * because the screen promises the respondent that it is random per person.
 */
export interface Choice {
  /** 1-based, matching app.extra_options.ordinal and the 1..5 answer scale */
  ordinal: number
  label: string
}

export type Question =
  | {
      kind: 'factor'
      /** stable identity for React and for the answer payload */
      id: string
      factorLabel: string
      factor: string
      ordinal: number
      text: string
      choices: Choice[]
    }
  | {
      kind: 'extra-choice'
      id: string
      factorLabel: string
      extraKey: string
      text: string
      choices: Choice[]
    }
  | {
      kind: 'extra-text'
      id: string
      factorLabel: string
      extraKey: string
      text: string
      note: string
    }

export interface RespondCopy {
  progress: string
  next: string
  submit: string
  skip: string
  commentPrompt: string
  commentPlaceholder: string
  openPlaceholder: string
  doneTitle: string
  doneLead: string
  submitFailed: string
}

export function RespondFlow({
  token,
  org,
  questions,
  copy,
}: {
  token: string
  org: string
  questions: Question[]
  copy: RespondCopy
}) {
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [text, setText] = useState<Record<string, string>>({})
  const [commentOpen, setCommentOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  const total = questions.length
  const current = questions[step]

  function build() {
    const answers = []
    const extra = []
    for (const q of questions) {
      if (q.kind === 'factor') {
        const value = picked[q.id]
        const comment = text[`${q.id}:comment`]?.trim()
        if (value === undefined && !comment) continue
        answers.push({
          factor: q.factor,
          ordinal: q.ordinal,
          ...(value === undefined ? {} : { value }),
          ...(comment ? { comment } : {}),
        })
      } else if (q.kind === 'extra-choice') {
        const option = picked[q.id]
        if (option !== undefined) extra.push({ key: q.extraKey, option })
      } else {
        const body = text[q.id]?.trim()
        if (body) extra.push({ key: q.extraKey, text: body })
      }
    }
    return { token, answers, extra }
  }

  function advance() {
    setCommentOpen(false)
    if (step < total - 1) {
      setStep(step + 1)
      return
    }
    startTransition(async () => {
      const result: SubmitResult = await submitResponse(build())
      if (result.ok) setDone(true)
      else setFailed(true)
    })
  }

  if (done) {
    return (
      <div className="px-[22px] pb-[24px] pt-[34px] text-center">
        <div className="mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-pill bg-mint text-[30px] text-greendeep">
          ✓
        </div>
        <div className="mt-[18px] font-display text-[26px] font-medium leading-[1.2] [text-wrap:balance]">
          {copy.doneTitle}
        </div>
        <div className="mt-[10px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
          {copy.doneLead}
        </div>
      </div>
    )
  }

  if (!current) return null

  const pct = Math.round(((step + 1) / total) * 100)
  const isLast = step === total - 1
  const hasChoices = current.kind !== 'extra-text'

  return (
    <>
      <div className="flex items-center justify-between px-[20px] pb-[6px] pt-[13px] text-[11.5px] font-semibold text-mut">
        <span>{org}</span>
      </div>

      <div className="px-[22px] pt-[10px]">
        <div className="flex items-center gap-[10px]">
          <span
            className="h-[5px] flex-1 overflow-hidden rounded-pill"
            style={{ background: 'rgba(25,21,16,.1)' }}
          >
            <span
              className="block h-full rounded-pill bg-ac"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="flex-none text-[11.5px] font-semibold text-mut">
            {copy.progress.replace('{n}', String(step + 1)).replace('{total}', String(total))}
          </span>
        </div>
      </div>

      <div className="px-[22px] pb-[18px] pt-[24px]">
        <div className="inline-block rounded-pill bg-sbg px-[11px] py-[4px] text-[11px] font-bold uppercase tracking-[0.05em]">
          {current.factorLabel}
        </div>
        <div className="mt-[14px] font-display text-[24px] font-medium leading-[1.27] [text-wrap:pretty]">
          {current.text}
        </div>

        {hasChoices ? (
          <>
            <div className="mt-[20px] flex flex-col gap-[9px]">
              {current.choices.map((c) => {
                const on = picked[current.id] === c.ordinal
                return (
                  <button
                    key={c.ordinal}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked({ ...picked, [current.id]: c.ordinal })}
                    className={`flex w-full cursor-pointer items-center gap-[13px] rounded-opt border px-[16px] py-[14px] text-left text-ink ${
                      on ? 'border-ink bg-sbg' : 'border-line bg-sf'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-[23px] w-[23px] flex-none items-center justify-center rounded-pill border-2 ${
                        on ? 'border-ink bg-ink' : 'border-rule bg-transparent'
                      }`}
                    >
                      <span
                        className={`block h-[8px] w-[8px] rounded-pill ${
                          on ? 'bg-sbg' : 'bg-transparent'
                        }`}
                      />
                    </span>
                    <span className={`text-[14.5px] ${on ? 'font-bold' : 'font-medium'}`}>
                      {c.label}
                    </span>
                  </button>
                )
              })}
            </div>

            {current.kind === 'factor' ? (
              <>
                <button
                  type="button"
                  aria-expanded={commentOpen}
                  onClick={() => setCommentOpen(!commentOpen)}
                  className="mt-[14px] flex w-full cursor-pointer items-center justify-between gap-[10px] rounded-opt border border-dashed border-rule bg-transparent px-[16px] py-[13px] text-left text-ink"
                >
                  <span className="text-[13.5px] text-mut">{copy.commentPrompt}</span>
                  <span aria-hidden="true" className="text-[17px] leading-none text-mut">
                    {commentOpen ? '−' : '+'}
                  </span>
                </button>
                {commentOpen ? (
                  <textarea
                    value={text[`${current.id}:comment`] ?? ''}
                    onChange={(e) =>
                      setText({ ...text, [`${current.id}:comment`]: e.target.value })
                    }
                    placeholder={copy.commentPlaceholder}
                    aria-label={copy.commentPrompt}
                    className="mt-[9px] min-h-[74px] w-full resize-y rounded-cta border border-line bg-sf px-[14px] py-[12px] text-[13.5px] leading-[1.5] text-ink outline-none"
                  />
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            <textarea
              value={text[current.id] ?? ''}
              onChange={(e) => setText({ ...text, [current.id]: e.target.value })}
              placeholder={copy.openPlaceholder}
              aria-label={current.text}
              className="mt-[20px] min-h-[130px] w-full resize-y rounded-opt border border-line bg-sf px-[15px] py-[13px] text-[14px] leading-[1.55] text-ink outline-none"
            />
            <div className="mt-[9px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
              {current.note}
            </div>
          </>
        )}

        {failed ? (
          <div role="alert" className="mt-[14px] text-[13px] font-semibold text-danger">
            {copy.submitFailed}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-[12px] border-t border-line px-[22px] pb-[22px] pt-[14px]">
        <button
          type="button"
          onClick={advance}
          disabled={pending}
          className="cursor-pointer border-none bg-transparent py-[8px] text-[13.5px] font-semibold text-mut"
        >
          {copy.skip}
        </button>
        <button
          type="button"
          onClick={advance}
          disabled={pending}
          className="h-[46px] cursor-pointer rounded-opt border border-ink bg-ink px-[26px] text-[15px] font-bold text-bg"
        >
          {isLast ? copy.submit : copy.next}
        </button>
      </div>
    </>
  )
}
