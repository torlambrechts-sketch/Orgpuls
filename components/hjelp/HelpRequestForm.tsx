'use client'

import { useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { sendHelpRequest } from '@/app/(app)/hjelp/actions'
import { REQUEST_CATEGORIES } from '@/lib/help/request'

/**
 * "Skriv til oss her" (D-92): a request to Orgpuls from inside the product, filed as a ticket
 * with the member's organisation, role and browser, so nobody has to be asked for them. A survey answer does not belong here, and the hint says so.
 *
 * One form in two places (D-174): on /hjelp, and at the end of the header's help panel, where
 * it names the screen the panel was opened on. `page` is that path, already cut to the path by
 * `helpPagePath`. The product sends no referrer (it protects the respondent's token), so the
 * page is passed in by whoever renders the form, never read from the request.
 */
export function HelpRequestForm({
  page,
  formClassName = '',
  defaultOpen = false,
}: {
  page: string
  /** where the open form sits in its container: the panel sets it on a line of its own */
  formClassName?: string
  /** the panel opens the form from its own trigger in the «Les mer om dette» row */
  defaultOpen?: boolean
}) {
  const t = useTranslations('hjelp.form')
  const id = useId()
  const [open, setOpen] = useState(defaultOpen)
  const [category, setCategory] = useState<(typeof REQUEST_CATEGORIES)[number]>('getting_started')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [sending, start] = useTransition()

  const field = 'box-border w-full rounded-ctl border border-line bg-sf px-[11px] text-[13px] text-ink outline-none'

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-[11px] inline-flex h-[34px] cursor-pointer items-center justify-center rounded-bar border border-ink bg-ac px-[14px] text-[12.5px] font-bold text-ink"
      >
        {t('open')}
      </button>
    )
  }

  return (
    <form
      className={`mt-[12px] flex flex-col gap-[10px] ${formClassName}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (!body.trim()) {
          setNote({ ok: false, text: t('invalid') })
          return
        }
        start(async () => {
          const browser = navigator.userAgent.slice(0, 400)
          const r = await sendHelpRequest({ category, subject, body, page, browser }).catch(() => null)
          if (r?.ok) {
            setSubject('')
            setBody('')
            // passed as text, so the case number is not set with a thousands separator
            setNote({ ok: true, text: t('sent', { number: String(r.number) }) })
          } else {
            setNote({
              ok: false,
              text: t(r?.problem === 'rate_limited' ? 'limited' : r?.problem === 'invalid' ? 'invalid' : 'failed'),
            })
          }
        })
      }}
    >
      <label className="block text-[12px] font-semibold">
        <span className="mb-[5px] block">{t('category')}</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className={`${field} h-[36px]`}>
          {REQUEST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`categories.${c}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[12px] font-semibold">
        <span className="mb-[5px] block">{t('subject')}</span>
        <input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className={`${field} h-[36px]`} />
      </label>
      <label className="block text-[12px] font-semibold">
        <span className="mb-[5px] block">{t('body')}</span>
        <textarea
          value={body}
          required
          maxLength={5000}
          rows={5}
          aria-describedby={`${id}-hint`}
          onChange={(e) => (setBody(e.target.value), setNote(null))}
          className={`${field} resize-y py-[8px] leading-[1.5]`}
        />
        <span id={`${id}-hint`} className="mt-[5px] block text-[11.5px] font-normal leading-[1.45] text-mut">
          {t('bodyHint')}
        </span>
      </label>
      <button
        type="submit"
        disabled={sending}
        className="inline-flex h-[34px] cursor-pointer items-center justify-center self-start rounded-bar border border-ink bg-ac px-[14px] text-[12.5px] font-bold text-ink disabled:cursor-default disabled:opacity-60"
      >
        {sending ? t('sending') : t('send')}
      </button>
      {note ? (
        <span
          role={note.ok ? 'status' : 'alert'}
          className={`text-[12.5px] leading-[1.5] ${note.ok ? 'text-link' : 'text-danger'}`}
        >
          {note.text}
        </span>
      ) : null}
    </form>
  )
}
