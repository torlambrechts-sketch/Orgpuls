'use client'

import { useState } from 'react'

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
  /** with `{mail}` */
  opened: string
  /** with `{msg}`, `{name}`, `{mail}`, `{org}` */
  mailBody: string
}

/**
 * "Skriv til oss" (D-88; Om oss.dc.html lines 167-186): four topics, then name, e-mail,
 * company and message.
 *
 * Nothing on the site receives a message, so "Send melding" does what the site can honestly
 * do: it opens the visitor's own e-mail program with the message written out to Orgpuls'
 * address, the topic as its subject. Nothing is stored here or sent from here; the visitor
 * sends it, from their own address. The design's check stays: a name and an e-mail address
 * that looks like one, or the line under the button says what is missing.
 */
export function ContactBlock({ words: w, to }: { words: Words; to: string }) {
  const [topic, setTopic] = useState(0)
  const [name, setName] = useState('')
  const [mail, setMail] = useState('')
  const [org, setOrg] = useState('')
  const [msg, setMsg] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

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
          const body = w.mailBody
            .replace('{msg}', msg.trim())
            .replace('{name}', name.trim())
            .replace('{mail}', mail.trim())
            .replace('{org}', org.trim() || '—')
          window.location.href = `mailto:${to}?subject=${encodeURIComponent(w.topics[topic] ?? '')}&body=${encodeURIComponent(body)}`
          setNote({ ok: true, text: w.opened.replace('{mail}', to) })
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
        <button
          type="submit"
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
