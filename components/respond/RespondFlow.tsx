'use client'

import type { Route } from 'next'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { submitResponse, type SubmitResult } from '@/app/s/[token]/actions'
import { ThreadLinks } from './ThreadLinks'
import type { CountAnswer } from '@/lib/respond/answers'
import { bcp47 } from '@/lib/i18n/locales'

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
/** what `picked` holds for «Ikke relevant for meg»: not an ordinal, which start at 1 */
const NOT_RELEVANT = 0

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
      /** an industry module's statement (0069): the wording is the registry's */
      kind: 'module'
      id: string
      item: string
      factorLabel: string
      text: string
      /** a line under the statement, e.g. what it does not cover (0089) */
      help?: string
      choices: Choice[]
    }
  | ({
      /** counted only for the whole organisation; the lead says so before it is answered */
      kind: 'count'
      /** the answer each option is sent as (0090) */
      answers: CountAnswer[]
    } & LeadQuestion)
  | ({
      /** an optional background question, used only to compare groups of at least k */
      kind: 'segment'
    } & LeadQuestion)
  | {
      kind: 'extra-text'
      id: string
      factorLabel: string
      extraKey: string
      text: string
      note: string
    }
  | {
      /** the organisation's own question on the extent scale (0095, D-145) */
      kind: 'own-scale'
      id: string
      question: string
      factorLabel: string
      text: string
      choices: Choice[]
    }
  | {
      /** the organisation's own question answered in words, masked before anyone reads it */
      kind: 'own-text'
      id: string
      question: string
      factorLabel: string
      text: string
      note: string
    }

interface LeadQuestion {
  id: string
  item: string
  factorLabel: string
  lead: string
  text: string
  choices: Choice[]
}

export interface RespondCopy {
  progress: string
  next: string
  submit: string
  skip: string
  /** «Ikke relevant for meg» (0087, D-134), offered on statements only */
  notRelevant: string
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
  preview,
  languages,
}: {
  token: string
  org: string
  questions: Question[]
  copy: RespondCopy
  /**
   * The languages this survey is offered in (engagement P1.2, D-127), each by its own name, or
   * null for one. Choosing one reloads the words and keeps every answer given: the state here
   * is not reset by new props, only the text it shows.
   */
  languages?: { current: string; label: string; options: { code: string; name: string }[] } | null
  /**
   * A leader's preview (/forhandsvis): the same screens, a banner saying so, and a last
   * step that sends nothing. There is no token behind it and no answer is ever written.
   */
  preview?: string
}) {
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [text, setText] = useState<Record<string, string>>({})
  const [commentOpen, setCommentOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [threads, setThreads] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  const total = questions.length
  const current = questions[step]

  function build() {
    const answers = []
    const extra = []
    const mod = {
      answers: [] as ({ item: string; value: number } | { item: string; na: true })[],
      count: [] as { item: string; answer: CountAnswer }[],
      segments: [] as { item: string; option: number }[],
    }
    const own: ({ question: string; value: number } | { question: string; text: string })[] = []
    for (const q of questions) {
      if (q.kind === 'own-scale') {
        const value = picked[q.id]
        if (value !== undefined) own.push({ question: q.question, value })
        continue
      }
      if (q.kind === 'own-text') {
        const body = text[q.id]?.trim()
        if (body) own.push({ question: q.question, text: body })
        continue
      }
      if (q.kind === 'module' || q.kind === 'count' || q.kind === 'segment') {
        const value = picked[q.id]
        if (value === undefined) continue
        if (q.kind === 'module') mod.answers.push(value === NOT_RELEVANT ? { item: q.item, na: true } : { item: q.item, value })
        else if (q.kind === 'segment') mod.segments.push({ item: q.item, option: value })
        else {
          const answer = q.answers[value - 1]
          if (answer) mod.count.push({ item: q.item, answer })
        }
      } else if (q.kind === 'factor') {
        const value = picked[q.id]
        const comment = text[`${q.id}:comment`]?.trim()
        if (value === undefined && !comment) continue
        answers.push({
          factor: q.factor,
          ordinal: q.ordinal,
          ...(value === undefined ? {} : value === NOT_RELEVANT ? { na: true as const } : { value }),
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
    const asked = questions.some((q) => q.kind === 'module' || q.kind === 'count' || q.kind === 'segment')
    return { token, answers, extra, ...(asked ? { module: mod } : {}), ...(own.length ? { own } : {}) }
  }

  /**
   * «Hopp over» is a skip: whatever was picked on this question is dropped, so nothing is sent
   * for it (a comment written on it still is, as the person wrote it). «Neste» with nothing
   * picked is the same skip.
   */
  function skip() {
    if (current && current.id in picked) {
      const { [current.id]: _dropped, ...rest } = picked
      setPicked(rest)
    }
    advance()
  }

  function advance() {
    setCommentOpen(false)
    if (step < total - 1) {
      setStep(step + 1)
      return
    }
    if (preview) {
      setDone(true)
      return
    }
    startTransition(async () => {
      const result: SubmitResult = await submitResponse(build())
      if (result.ok) {
        setThreads(result.threads)
        setDone(true)
      } else setFailed(true)
    })
  }

  /**
   * One answer option: the scale's, a choice question's, or «Ikke relevant for meg», whose label is
   * muted until picked, so it reads as outside the scale rather than a sixth point on it (D-134).
   */
  function choice(value: number, label: string, muted = false) {
    if (!current) return null
    const on = picked[current.id] === value
    return (
      <button
        key={value}
        type="button"
        aria-pressed={on}
        onClick={() => setPicked({ ...picked, [current.id]: value })}
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
          <span className={`block h-[8px] w-[8px] rounded-pill ${on ? 'bg-sbg' : 'bg-transparent'}`} />
        </span>
        <span className={`text-[14.5px] ${on ? 'font-bold' : `font-medium${muted ? ' text-mut' : ''}`}`}>{label}</span>
      </button>
    )
  }

  const banner = preview ? (
    <div role="note" className="bg-sbg px-[20px] py-[10px] text-[12.5px] font-semibold leading-[1.45] text-ink">
      {preview}
    </div>
  ) : null

  if (done) {
    return (
      <>
      {banner}
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
      <ThreadLinks keys={threads} />
      </>
    )
  }

  if (!current) return null

  const pct = Math.round(((step + 1) / total) * 100)
  const isLast = step === total - 1
  const hasChoices = current.kind !== 'extra-text' && current.kind !== 'own-text'

  return (
    <>
      {banner}
      <div className="flex items-center justify-between px-[20px] pb-[6px] pt-[13px] text-[11.5px] font-semibold text-mut">
        <span>{org}</span>
        {languages ? <LanguagePicker {...languages} /> : null}
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
        {'lead' in current ? (
          <div className="mt-[12px] text-[13px] font-semibold leading-[1.5] text-mut [text-wrap:pretty]">
            {current.lead}
          </div>
        ) : null}
        <div className="mt-[14px] font-display text-[24px] font-medium leading-[1.27] [text-wrap:pretty]">
          {current.text}
        </div>
        {'help' in current && current.help ? (
          <div className="mt-[8px] text-[13px] leading-[1.5] text-mut [text-wrap:pretty]">{current.help}</div>
        ) : null}

        {hasChoices ? (
          <>
            <div className="mt-[20px] flex flex-col gap-[9px]">
              {current.choices.map((c) => choice(c.ordinal, c.label))}
            </div>
            {current.kind === 'factor' || current.kind === 'module' ? (
              <div className="mt-[16px] flex flex-col">{choice(NOT_RELEVANT, copy.notRelevant, true)}</div>
            ) : null}

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
          onClick={skip}
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

/**
 * The language picker (engagement P1.2): each language by its own name, the current one marked.
 * A link, so it works without script; with script it replaces the address in place, which keeps
 * the answers already given. The choice is the address's `?lang=` and nothing else.
 */
function LanguagePicker({ current, label, options }: { current: string; label: string; options: { code: string; name: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, start] = useTransition()
  return (
    <nav aria-label={label} className="-my-[4px] flex flex-none items-center gap-[2px]">
      {options.map((o) => {
        const on = o.code === current
        return (
          <a
            key={o.code}
            href={`${pathname}?lang=${o.code}`}
            hrefLang={bcp47(o.code)}
            lang={bcp47(o.code)}
            aria-current={on ? 'true' : undefined}
            aria-disabled={pending || undefined}
            onClick={(e) => {
              e.preventDefault()
              if (on || pending) return
              start(() => router.replace(`${pathname}?lang=${o.code}` as Route, { scroll: false }))
            }}
            className={`rounded-pill px-[9px] py-[4px] text-[11.5px] no-underline ${on ? 'bg-sbg font-bold text-ink' : 'font-semibold text-mut hover:text-ink'}`}
          >
            {o.name}
          </a>
        )
      })}
    </nav>
  )
}
