'use client'

import { useState, useTransition } from 'react'
import { sendContact } from '@/app/(marketing)/kontakt/actions'

type Words = {
  k: string
  t: string
  d: string
  topics: string[]
  topicsLabel: string
  name: string
  mail: string
  org: string
  orgPlaceholder: string
  msg: string
  send: string
  invalid: string
  sent: string
  limited: string
  /** with `{mail}` */
  failed: string
}

/**
 * "Skriv til oss" (D-88; Om oss.dc.html lines 167-186; on /kontakt since D-95): four topics, then name, e-mail,
 * company and message.
 *
 * "Send melding" files the message as a ticket in the admin's queue (D-92), with the topic
 * choosing the queue. The design's check stays: a name and an e-mail address that looks like
 * one, or the line under the button says what is missing. If the message cannot be filed,
 * the line gives the address to write to instead. A field no person sees catches form bots.
 */
export function ContactBlock({ words: w, to }: { words: Words; to: string }) {
  const [topic, setTopic] = useState(0)
  const [name, setName] = useState('')
  const [mail, setMail] = useState('')
  const [org, setOrg] = useState('')
  const [msg, setMsg] = useState('')
  const [trap, setTrap] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [sending, startSending] = useTransition()

  const field = 'h-[46px] rounded-cta border border-line bg-bg px-[14px] text-[14.5px] font-normal text-ink'

  return (
    <div className="grid items-start gap-[30px] rounded-[24px] border border-line bg-sf px-[40px] py-[36px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))] max-sm:px-[22px]">
      <div>
        <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{w.k}</span>
        <h2 className="m-0 mt-[9px] max-w-[18ch] font-display text-[32px] font-semibold leading-[1.14] [text-wrap:balance]">
          {w.t}
        </h2>
        <p className="m-0 mt-[12px] max-w-[44ch] text-[15px] leading-[1.65] text-body [text-wrap:pretty]">{w.d}</p>
        <div role="radiogroup" aria-label={w.topicsLabel} className="mt-[18px] flex flex-col gap-[8px]">
          {w.topics.map((l, i) => {
            const on = topic === i
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTopic(i)}
                className={`flex cursor-pointer items-center gap-[10px] rounded-cta border px-[14px] py-[11px] text-left text-[13.5px] text-ink ${
                  on ? 'border-ink bg-sbg font-bold' : 'border-line bg-sf font-medium'
                }`}
              >
                <span className="flex h-[16px] w-[16px] flex-none items-center justify-center rounded-pill border-2 border-ink">
                  <span className={`block h-[7px] w-[7px] rounded-pill ${on ? 'bg-ink' : 'bg-transparent'}`} />
                </span>
                {l}
              </button>
            )
          })}
        </div>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || !/.+@.+\..+/.test(mail)) {
            setNote({ ok: false, text: w.invalid })
            return
          }
          startSending(async () => {
            const r = await sendContact({ topic, name, mail, org, msg, trap }).catch(() => null)
            if (r?.ok) {
              setMsg('')
              setNote({ ok: true, text: w.sent })
            } else if (r?.problem === 'invalid') setNote({ ok: false, text: w.invalid })
            else if (r?.problem === 'rate_limited') setNote({ ok: false, text: w.limited })
            else setNote({ ok: false, text: w.failed.replace('{mail}', to) })
          })
        }}
        className="flex flex-col gap-[12px]"
      >
        <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
          {w.name}
          <input value={name} autoComplete="name" onChange={(e) => (setName(e.target.value), setNote(null))} className={field} />
        </label>
        <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
          {w.mail}
          <input
            value={mail}
            type="email"
            autoComplete="email"
            onChange={(e) => (setMail(e.target.value), setNote(null))}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
          {w.org}
          <input
            value={org}
            autoComplete="organization"
            placeholder={w.orgPlaceholder}
            onChange={(e) => (setOrg(e.target.value), setNote(null))}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
          {w.msg}
          <textarea
            value={msg}
            rows={4}
            onChange={(e) => (setMsg(e.target.value), setNote(null))}
            className="resize-y rounded-cta border border-line bg-bg px-[14px] py-[12px] text-[14.5px] font-normal leading-[1.5] text-ink"
          />
        </label>
        {/* for form bots only: off screen, out of the tab order, hidden from assistive technology */}
        <input
          name="website"
          value={trap}
          onChange={(e) => setTrap(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-10000px] h-px w-px overflow-hidden"
        />
        <button
          type="submit"
          disabled={sending}
          className="h-[50px] cursor-pointer rounded-tile border border-ink bg-ac text-[15.5px] font-bold text-ink"
        >
          {w.send}
        </button>
        {note ? (
          <span
            role={note.ok ? 'status' : 'alert'}
            className={`text-[13px] leading-[1.5] ${note.ok ? 'text-link' : 'text-danger'}`}
          >
            {note.text}
          </span>
        ) : null}
      </form>
    </div>
  )
}
