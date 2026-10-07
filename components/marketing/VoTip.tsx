'use client'

import { useId, useMemo, useState } from 'react'

export type VoTipWords = {
  kicker: string
  title: string
  lead: string
  you: string
  leader: string
  org: string
  optional: string
  preview: string
  open: string
  copy: string
  copied: string
  failed: string
  subject: string
  /** with `{leader}` */
  greeting: string
  greetingPlain: string
  /** paragraphs; `{org}` where the workplace is named, `{inOrg}` the phrase with it or nothing */
  body: string[]
  inOrg: string
  /** with `{you}` */
  sign: string
  signPlain: string
}

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')

/**
 * «Tips ledelsen» (D-246): a verneombud writes a few names and gets a finished e-mail to the daglig
 * leder, to send from their own address. Nothing leaves the browser: the text is put together here,
 * and Orgpuls neither sends it nor stores who wrote it or to whom – no list of anybody's addresses, no
 * message on anyone's behalf. The link in it carries only where it came from (utm), never a person.
 */
export function VoTip({ words: w, link }: { words: VoTipWords; link: string }) {
  const [you, setYou] = useState('')
  const [leader, setLeader] = useState('')
  const [org, setOrg] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const id = useId()

  const text = useMemo(() => {
    const vars = { org: org.trim(), inOrg: org.trim() ? fill(w.inOrg, { org: org.trim() }) : '', link }
    const lines = [
      leader.trim() ? fill(w.greeting, { leader: leader.trim() }) : w.greetingPlain,
      ...w.body.map((p) => fill(p, vars)),
      you.trim() ? fill(w.sign, { you: you.trim() }) : w.signPlain,
    ]
    return lines.join('\n\n')
  }, [w, you, leader, org, link])

  const mailto = `mailto:?subject=${encodeURIComponent(w.subject)}&body=${encodeURIComponent(text)}`
  // the template form's field (TemplateDownload): 16px, so a phone does not zoom into it
  const field = 'h-[46px] rounded-cta border border-line bg-bg px-[14px] text-[16px] font-normal text-ink'

  return (
    <section
      id="tips-ledelsen"
      aria-labelledby={`${id}-h`}
      className="mt-[34px] scroll-mt-[118px] rounded-note border border-line bg-sf px-[24px] py-[22px]"
    >
      <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-mut">{w.kicker}</span>
      <h2 id={`${id}-h`} className="m-0 mt-[4px] font-display text-[22px] font-semibold leading-[1.2]">
        {w.title}
      </h2>
      <p className="m-0 mt-[8px] max-w-[60ch] text-[14px] leading-[1.6] text-body [text-wrap:pretty]">{w.lead}</p>

      <div className="mt-[16px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
        <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
          {w.you}
          <input value={you} autoComplete="name" onChange={(e) => (setYou(e.target.value), setNote(null))} className={field} />
        </label>
        <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
          <span>
            {w.leader} <span className="font-normal text-mut">({w.optional})</span>
          </span>
          <input value={leader} autoComplete="off" onChange={(e) => (setLeader(e.target.value), setNote(null))} className={field} />
        </label>
        <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
          <span>
            {w.org} <span className="font-normal text-mut">({w.optional})</span>
          </span>
          <input value={org} autoComplete="organization" onChange={(e) => (setOrg(e.target.value), setNote(null))} className={field} />
        </label>
      </div>

      <div className="mt-[16px]">
        <span id={`${id}-p`} className="block text-[12px] font-bold uppercase tracking-[0.08em] text-mut">
          {w.preview}
        </span>
        <div
          aria-labelledby={`${id}-p`}
          className="mt-[8px] whitespace-pre-line rounded-cta border border-line bg-bg px-[16px] py-[14px] text-[13.5px] leading-[1.6] text-body"
        >
          <strong className="block font-semibold text-ink">{w.subject}</strong>
          <span className="mt-[8px] block">{text}</span>
        </div>
      </div>

      <div className="mt-[14px] flex flex-wrap items-center gap-[10px]">
        <a
          href={mailto}
          className="inline-flex min-h-[44px] items-center rounded-tile border border-ink bg-ac px-[18px] text-[14.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
        >
          {w.open}
        </a>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(`${w.subject}\n\n${text}`).then(
              () => setNote({ ok: true, text: w.copied }),
              () => setNote({ ok: false, text: w.failed }),
            )
          }}
          className="inline-flex min-h-[44px] cursor-pointer items-center rounded-tile border border-line bg-transparent px-[18px] text-[14.5px] font-semibold text-ink"
        >
          {w.copy}
        </button>
        {note ? (
          <span role={note.ok ? 'status' : 'alert'} className={`text-[13px] ${note.ok ? 'text-link' : 'text-danger'}`}>
            {note.text}
          </span>
        ) : null}
      </div>
    </section>
  )
}
