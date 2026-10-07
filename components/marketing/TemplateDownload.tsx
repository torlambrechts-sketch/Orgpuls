'use client'

import { useState, useTransition } from 'react'
import { requestTemplate } from '@/app/(marketing)/maler/actions'
import { Rich } from './Rich'

export type TemplateDownloadWords = {
  title: string
  text: string
  name: string
  mail: string
  org: string
  orgPlaceholder: string
  role: string
  rolePlaceholder: string
  consent: string
  send: string
  invalid: string
  limited: string
  /** with `{mail}` */
  failed: string
  privacy: string
  readyTitle: string
  readyText: string
}

/**
 * The form beside a template's page (D-241): a name and an address, the organisation and role if the
 * person wants, and a box – unticked – for e-mail about new templates and articles. When the request
 * is filed, the files are there to download; a browser that has asked before sees them at once. A
 * field no person sees catches form bots. The fields and their check are the contact form's (D-88).
 */
export function TemplateDownload({
  slug,
  files,
  ready: readyAtFirst,
  to,
  words: w,
}: {
  slug: string
  files: { name: string; label: string; format: string }[]
  ready: boolean
  to: string
  words: TemplateDownloadWords
}) {
  const [ready, setReady] = useState(readyAtFirst)
  const [name, setName] = useState('')
  const [mail, setMail] = useState('')
  const [org, setOrg] = useState('')
  const [role, setRole] = useState('')
  const [consent, setConsent] = useState(false)
  const [trap, setTrap] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [sending, startSending] = useTransition()
  const field = 'h-[46px] rounded-cta border border-line bg-bg px-[14px] text-[16px] font-normal text-ink'

  if (ready)
    return (
      <div
        id="last-ned"
        className="scroll-mt-[118px] rounded-note border border-line bg-sf px-[24px] py-[22px] shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)]"
      >
        <h2 className="m-0 font-display text-[22px] font-semibold leading-[1.2]">{w.readyTitle}</h2>
        <p role="status" className="m-0 mt-[8px] text-[14px] leading-[1.6] text-body [text-wrap:pretty]">
          {w.readyText}
        </p>
        <ul className="m-0 mt-[16px] flex list-none flex-col gap-[10px] p-0">
          {files.map((f) => (
            <li key={f.name}>
              <a
                href={`/maler/fil/${f.name}`}
                download
                className="flex min-h-[50px] items-center justify-between gap-[12px] rounded-tile border border-ink bg-ac px-[16px] py-[10px] text-[15px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
              >
                <span>{f.label}</span>
                <span className="rounded-pill bg-sf px-[8px] py-[2px] text-[11.5px] uppercase tracking-[0.06em]">{f.format}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <form
      id="last-ned"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || !/.+@.+\..+/.test(mail)) {
          setNote(w.invalid)
          return
        }
        startSending(async () => {
          const r = await requestTemplate({ slug, name, mail, org, role, consent, trap }).catch(() => null)
          if (r?.ok) setReady(true)
          else if (r?.problem === 'invalid') setNote(w.invalid)
          else if (r?.problem === 'rate_limited') setNote(w.limited)
          else setNote(w.failed.replace('{mail}', to))
        })
      }}
      className="flex scroll-mt-[118px] flex-col gap-[12px] rounded-note border border-line bg-sf px-[24px] py-[22px] shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)]"
    >
      <h2 className="m-0 font-display text-[22px] font-semibold leading-[1.2]">{w.title}</h2>
      <p className="m-0 text-[14px] leading-[1.6] text-body [text-wrap:pretty]">{w.text}</p>
      <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
        {w.name}
        <input value={name} autoComplete="name" onChange={(e) => (setName(e.target.value), setNote(null))} className={field} />
      </label>
      <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
        {w.mail}
        <input value={mail} type="email" autoComplete="email" onChange={(e) => (setMail(e.target.value), setNote(null))} className={field} />
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
        {w.role}
        <input
          value={role}
          autoComplete="organization-title"
          placeholder={w.rolePlaceholder}
          onChange={(e) => (setRole(e.target.value), setNote(null))}
          className={field}
        />
      </label>
      <label className="flex cursor-pointer items-start gap-[10px] text-[13.5px] leading-[1.5] text-body">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-[3px] h-[18px] w-[18px] flex-none accent-ink"
        />
        <span>{w.consent}</span>
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
        <span role="alert" className="text-[13px] leading-[1.5] text-danger">
          {note}
        </span>
      ) : null}
      <p className="m-0 text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">
        <Rich text={w.privacy} />
      </p>
    </form>
  )
}
