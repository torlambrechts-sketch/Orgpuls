'use client'

import type { Route } from 'next'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { submitResponse, type SubmitResult } from '@/app/s/[token]/actions'
import { ThreadLinks } from './ThreadLinks'
import type { CountAnswer } from '@/lib/respond/answers'
import { bcp47 } from '@/lib/i18n/locales'

/**
 * The respondent flow. Bundle lines 1893-1929.
 *
 * The design draws one question at a time, the factor visible above it, the comment optional,
 * inside a phone mock on the Målinger preview; here it is the whole surface, so the phone
 * chrome is not reproduced — everything inside the mock's screen is. Since P1-4 (D-150) a
 * factor's statements share a page, which the research finds completes better than one at a
 * time, and the flow opens with its promises, keeps the respondent's choices in the browser
 * until they are sent, goes back, says how long is left, and takes the number keys.
 *
 * Answers accumulate in this component and are sent once, when the last page is
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
  // P1-4 (D-150): the page before the first question, going back, time left, a resumed survey
  introTitle: string
  /** the four promises, as respond.promise1–4 say them */
  promises: string[]
  start: string
  back: string
  /** raw template: {minutes} */
  timeLeft: string
  restored: string
  keyboardHint: string
  since: { title: string; done: string; ongoing: string; first: string }
}

/**
 * Engagement phase 2 (0105, D-156), each behind its flag and all of it the whole organisation's:
 * what was done since the last grunnlinje, on the page before the first question; why a pulse asks a
 * factor again, under its heading; and the thank-you that says when everyone is told the results.
 */
export interface RespondEngagement {
  /** «Siden sist»: `first` on a first survey; else at most three items and the month they answer to */
  since: { first: true } | { first: false; items: { title: string; done: boolean }[]; footer: string } | null
  /** per factor key, the lines «Spørres fordi dere jobber med: …» */
  reasons: Record<string, string[]>
  /** the thank-you's lines, in order; null keeps the design's «Takk. Det tok fire minutter.» */
  thanks: { title: string; lines: string[] } | null
}

/** about seven seconds a question, as app.round_minutes counts an invitation (0099) */
const SECONDS_PER_QUESTION = 7

/**
 * The flow's pages (P1-4, D-150): a factor's statements together — the core survey's three, a
 * module factor's — and every other question on a page of its own. A factor's page stands where
 * its first statement came in the server's order, which is shuffled per token, so the factors
 * still come in an order of the respondent's own.
 */
function paginate(questions: Question[]): Question[][] {
  const pages: Question[][] = []
  const byFactor = new Map<string, number>()
  for (const q of questions) {
    if (q.kind === 'factor' || q.kind === 'module') {
      const key = `${q.kind}:${q.kind === 'factor' ? q.factor : q.factorLabel}`
      const at = byFactor.get(key)
      if (at === undefined) {
        byFactor.set(key, pages.length)
        pages.push([q])
      } else pages[at]!.push(q)
    } else pages.push([q])
  }
  return pages
}

const hasChoices = (q: Question) => q.kind !== 'extra-text' && q.kind !== 'own-text'

/**
 * What is kept in the browser while a survey is under way (P1-4): which option was picked for
 * which question, and the page. Never what someone wrote — a text left on a shared computer is
 * exactly what the product promises not to expose — and never on the server, where it could be
 * joined to the invitation. Kept under a digest of the link, gone once the answer is sent.
 */
type Draft = { picked: Record<string, number>; page: number; at: number }
const DRAFT_DAYS = 30

async function draftKey(token: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`orgpuls-draft:${token}`))
    return `orgpuls:utkast:${Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return null
  }
}

function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    if (typeof d?.at !== 'number' || Date.now() - d.at > DRAFT_DAYS * 86_400_000) return null
    return d && typeof d.picked === 'object' && typeof d.page === 'number' ? d : null
  } catch {
    return null
  }
}

function writeDraft(key: string, d: Draft | null) {
  try {
    if (d) window.localStorage.setItem(key, JSON.stringify(d))
    else window.localStorage.removeItem(key)
  } catch {
    // a private window or blocked storage: the survey works, it only cannot be resumed
  }
}

export function RespondFlow({
  token,
  org,
  questions,
  copy,
  preview,
  languages,
  logo = null,
  engagement = null,
}: {
  token: string
  org: string
  /** the organisation's own logo beside its name (0104, D-154), or null */
  logo?: string | null
  /** engagement phase 2 (0105, D-156): null with every flag off */
  engagement?: RespondEngagement | null
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
  const pages = useMemo(() => paginate(questions), [questions])
  // -1 is the page before the first question, with the promises (P1-4)
  const [page, setPage] = useState(-1)
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [text, setText] = useState<Record<string, string>>({})
  const [commentOpen, setCommentOpen] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState(false)
  const [threads, setThreads] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const [restored, setRestored] = useState(false)
  const [pending, startTransition] = useTransition()
  const key = useRef<string | null>(null)
  const top = useRef<HTMLDivElement>(null)

  // a survey begun on this device and not sent: its choices and its page, never its words
  useEffect(() => {
    if (preview || !token) return
    let live = true
    void draftKey(token).then((k) => {
      if (!live || !k) return
      key.current = k
      const d = readDraft(k)
      if (d && Object.keys(d.picked).length) {
        const known = new Set(questions.map((q) => q.id))
        setPicked(Object.fromEntries(Object.entries(d.picked).filter(([id]) => known.has(id))))
        setPage(Math.min(Math.max(0, d.page), pages.length - 1))
        setRestored(true)
      }
    })
    return () => {
      live = false
    }
    // once, on arrival: a language change keeps the state it has
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (key.current && !done && page >= 0) writeDraft(key.current, { picked, page, at: Date.now() })
  }, [picked, page, done])

  const current = page >= 0 ? (pages[page] ?? []) : []
  const answeredBefore = pages.slice(0, Math.max(0, page)).reduce((n, p) => n + p.length, 0)
  const remaining = questions.length - answeredBefore
  const minutesLeft = Math.max(1, Math.ceil((remaining * SECONDS_PER_QUESTION) / 60))
  const isLast = page === pages.length - 1

  function build() {
    const answers = []
    const extra = []
    const own: ({ question: string; value: number } | { question: string; text: string })[] = []
    const mod = {
      answers: [] as ({ item: string; value: number } | { item: string; na: true })[],
      count: [] as { item: string; answer: CountAnswer }[],
      segments: [] as { item: string; option: number }[],
    }
    for (const q of questions) {
      if (q.kind === 'own-scale') {
        const value = picked[q.id]
        if (value !== undefined) own.push({ question: q.question, value })
      } else if (q.kind === 'own-text') {
        const body = text[q.id]?.trim()
        if (body) own.push({ question: q.question, text: body })
      } else if (q.kind === 'module' || q.kind === 'count' || q.kind === 'segment') {
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

  function go(to: number) {
    setPage(to)
    setRestored(false)
    top.current?.scrollIntoView({ block: 'start' })
  }

  /**
   * «Hopp over» skips the page: whatever was picked on it is dropped, so nothing is sent for it
   * (a comment written on it still is, as the person wrote it). «Neste» with nothing picked is
   * the same skip.
   */
  function skip() {
    const ids = new Set(current.map((q) => q.id))
    setPicked(Object.fromEntries(Object.entries(picked).filter(([id]) => !ids.has(id))))
    advance()
  }

  function advance() {
    if (!isLast) {
      go(page + 1)
      return
    }
    if (preview) {
      setDone(true)
      return
    }
    startTransition(async () => {
      const result: SubmitResult = await submitResponse(build())
      if (result.ok) {
        if (key.current) writeDraft(key.current, null)
        setThreads(result.threads)
        setDone(true)
      } else setFailed(true)
    })
  }

  // number keys choose for the first question on the page without an answer; Enter goes on
  useEffect(() => {
    if (page < 0 || done) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.altKey || e.ctrlKey || e.metaKey || target?.closest('textarea, input, select')) return
      if (/^[1-9]$/.test(e.key)) {
        const q = current.find((x) => hasChoices(x) && picked[x.id] === undefined) ?? current.find(hasChoices)
        if (!q || !('choices' in q)) return
        const n = Number(e.key)
        if (!q.choices.some((c) => c.ordinal === n)) return
        e.preventDefault()
        setPicked((p) => ({ ...p, [q.id]: n }))
      } else if (e.key === 'Enter' && target?.tagName !== 'BUTTON' && target?.tagName !== 'A') {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /**
   * One answer option: the scale's, a choice question's, or «Ikke relevant for meg», whose label is
   * muted until picked, so it reads as outside the scale rather than a sixth point on it (D-134).
   */
  function choice(q: Question, value: number, label: string, muted = false) {
    const on = picked[q.id] === value
    return (
      <button
        key={value}
        type="button"
        aria-pressed={on}
        onClick={() => setPicked({ ...picked, [q.id]: value })}
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

  const head = (
    <div className="flex items-center justify-between px-[20px] pb-[6px] pt-[13px] text-[11.5px] font-semibold text-mut">
      <span className="flex min-w-0 items-center gap-[8px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- same-origin, 22 px; the name beside it says who */}
        {logo ? <img src={logo} alt="" className="block h-[22px] w-auto max-w-[88px] object-contain" /> : null}
        <span>{org}</span>
      </span>
      {languages ? <LanguagePicker {...languages} /> : null}
    </div>
  )

  if (done) {
    return (
      <>
      {banner}
      <div className="px-[22px] pb-[24px] pt-[34px] text-center">
        <div className="mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-pill bg-mint text-[30px] text-greendeep">
          ✓
        </div>
        <div className="mt-[18px] font-display text-[26px] font-medium leading-[1.2] [text-wrap:balance]">
          {engagement?.thanks ? engagement.thanks.title : copy.doneTitle}
        </div>
        {engagement?.thanks ? (
          <div className="mx-auto mt-[12px] flex max-w-[330px] flex-col gap-[8px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {engagement.thanks.lines.map((l) => (
              <p key={l} className="m-0">{l}</p>
            ))}
          </div>
        ) : (
          <div className="mt-[10px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {copy.doneLead}
          </div>
        )}
      </div>
      <ThreadLinks keys={threads} />
      </>
    )
  }

  // the page before the first question: what is promised, and how long it takes
  if (page < 0) {
    return (
      <>
        {banner}
        {head}
        <div className="px-[22px] pb-[22px] pt-[20px]">
          <h1 className="m-0 font-display text-[26px] font-medium leading-[1.2] [text-wrap:balance]">{copy.introTitle}</h1>
          <ul className="m-0 mt-[16px] flex list-none flex-col gap-[10px] p-0">
            {copy.promises.map((p) => (
              <li key={p} className="flex gap-[10px] text-[14px] leading-[1.5] [text-wrap:pretty]">
                <span aria-hidden="true" className="mt-[2px] flex h-[20px] w-[20px] flex-none items-center justify-center rounded-pill bg-mint text-[11px] font-bold text-greendeep">
                  ✓
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
          {engagement?.since ? (
            <section aria-labelledby="since" className="mt-[20px] rounded-cta border border-line bg-sf px-[16px] py-[14px]">
              <h2 id="since" className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-mut">{copy.since.title}</h2>
              {engagement.since.first ? (
                <p className="m-0 mt-[8px] text-[13.5px] leading-[1.55] [text-wrap:pretty]">{copy.since.first}</p>
              ) : (
                <>
                  <ul className="m-0 mt-[10px] flex list-none flex-col gap-[9px] p-0">
                    {engagement.since.items.map((i) => (
                      <li key={i.title} className="flex items-start justify-between gap-[10px] text-[13.5px] leading-[1.45]">
                        <span className="min-w-0 [overflow-wrap:anywhere]">{i.title}</span>
                        <span
                          className={`flex-none rounded-pill px-[9px] py-[2px] text-[11.5px] font-bold ${i.done ? 'bg-mint text-greendeep' : 'bg-sbg text-ink'}`}
                        >
                          {i.done ? copy.since.done : copy.since.ongoing}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="m-0 mt-[10px] text-[12px] leading-[1.5] text-mut">{engagement.since.footer}</p>
                </>
              )}
            </section>
          ) : null}
          <div className="mt-[16px] text-[12.5px] font-semibold text-mut">
            {copy.timeLeft.replace('{minutes}', String(Math.max(1, Math.ceil((questions.length * SECONDS_PER_QUESTION) / 60))))}
          </div>
          <button
            type="button"
            autoFocus
            onClick={() => go(0)}
            className="mt-[18px] h-[46px] w-full cursor-pointer rounded-opt border border-ink bg-ink px-[26px] text-[15px] font-bold text-bg"
          >
            {copy.start}
          </button>
          <div className="mt-[12px] hidden text-center text-[11.5px] text-mut sm:block">{copy.keyboardHint}</div>
        </div>
      </>
    )
  }

  const pct = Math.round(((page + 1) / pages.length) * 100)
  const first = current[0]

  return (
    <>
      {banner}
      <div ref={top} />
      {head}

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
            {copy.progress.replace('{n}', String(page + 1)).replace('{total}', String(pages.length))}
          </span>
        </div>
        <div className="mt-[6px] text-right text-[11px] text-mut" aria-live="polite">
          {copy.timeLeft.replace('{minutes}', String(minutesLeft))}
        </div>
      </div>

      {restored ? (
        <div role="status" className="mx-[22px] mt-[10px] rounded-ctl bg-mint px-[12px] py-[9px] text-[12.5px] leading-[1.45] text-ink">
          {copy.restored}
        </div>
      ) : null}

      <div className="px-[22px] pb-[18px] pt-[18px]">
        {first ? (
          <div className="inline-block rounded-pill bg-sbg px-[11px] py-[4px] text-[11px] font-bold uppercase tracking-[0.05em]">
            {first.factorLabel}
          </div>
        ) : null}
        {first?.kind === 'factor'
          ? (engagement?.reasons[first.factor] ?? []).map((r) => (
              <div key={r} className="mt-[10px] text-[13px] leading-[1.5] text-mut [text-wrap:pretty]">
                {r}
              </div>
            ))
          : null}
        {first && 'lead' in first ? (
          <div className="mt-[12px] text-[13px] font-semibold leading-[1.5] text-mut [text-wrap:pretty]">{first.lead}</div>
        ) : null}

        {current.map((q, i) => (
          <fieldset key={q.id} className={`m-0 min-w-0 border-0 p-0 ${i > 0 ? 'mt-[26px] border-t border-line pt-[20px]' : ''}`}>
            <legend className={`p-0 font-display font-medium leading-[1.27] [text-wrap:pretty] ${current.length > 1 ? 'mt-[12px] text-[20px]' : 'mt-[14px] text-[24px]'}`}>
              {q.text}
            </legend>
            {'help' in q && q.help ? (
              <div className="mt-[8px] text-[13px] leading-[1.5] text-mut [text-wrap:pretty]">{q.help}</div>
            ) : null}

            {'choices' in q && hasChoices(q) ? (
              <>
                <div className="mt-[16px] flex flex-col gap-[9px]">{q.choices.map((c) => choice(q, c.ordinal, c.label))}</div>
                {q.kind === 'factor' || q.kind === 'module' ? (
                  <div className="mt-[12px] flex flex-col">{choice(q, NOT_RELEVANT, copy.notRelevant, true)}</div>
                ) : null}

                {q.kind === 'factor' ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={!!commentOpen[q.id]}
                      onClick={() => setCommentOpen({ ...commentOpen, [q.id]: !commentOpen[q.id] })}
                      className="mt-[12px] flex w-full cursor-pointer items-center justify-between gap-[10px] rounded-opt border border-dashed border-rule bg-transparent px-[16px] py-[13px] text-left text-ink"
                    >
                      <span className="text-[13.5px] text-mut">{copy.commentPrompt}</span>
                      <span aria-hidden="true" className="text-[17px] leading-none text-mut">
                        {commentOpen[q.id] ? '−' : '+'}
                      </span>
                    </button>
                    {commentOpen[q.id] ? (
                      <textarea
                        value={text[`${q.id}:comment`] ?? ''}
                        onChange={(e) => setText({ ...text, [`${q.id}:comment`]: e.target.value })}
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
                  value={text[q.id] ?? ''}
                  onChange={(e) => setText({ ...text, [q.id]: e.target.value })}
                  placeholder={copy.openPlaceholder}
                  aria-label={q.text}
                  className="mt-[20px] min-h-[130px] w-full resize-y rounded-opt border border-line bg-sf px-[15px] py-[13px] text-[14px] leading-[1.55] text-ink outline-none"
                />
                {'note' in q ? (
                  <div className="mt-[9px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{q.note}</div>
                ) : null}
              </>
            )}
          </fieldset>
        ))}

        {failed ? (
          <div role="alert" className="mt-[14px] text-[13px] font-semibold text-danger">
            {copy.submitFailed}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-[12px] border-t border-line px-[22px] pb-[22px] pt-[14px]">
        <span className="flex items-center gap-[16px]">
          {page > 0 ? (
            <button
              type="button"
              onClick={() => go(page - 1)}
              disabled={pending}
              className="cursor-pointer border-none bg-transparent py-[8px] text-[13.5px] font-semibold text-ink"
            >
              ← {copy.back}
            </button>
          ) : null}
          <button
            type="button"
            onClick={skip}
            disabled={pending}
            className="cursor-pointer border-none bg-transparent py-[8px] text-[13.5px] font-semibold text-mut"
          >
            {copy.skip}
          </button>
        </span>
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
