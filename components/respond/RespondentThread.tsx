'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { followUp, readThread, type RespondentThread as Thread } from '@/app/s/samtale/actions'

/**
 * A respondent's own conversation (D-78): their comment, what management answered, and
 * a way to answer back while the thread is open.
 *
 * The key is read from the fragment in the browser and posted in an action body, so the
 * server never sees it in a URL. A key that is malformed, unknown or wrong gets the same
 * answer. Leaders are "Ledelsen" and the person is "Deg": neither side learns a name.
 */
export function RespondentThread() {
  const t = useTranslations('respond.thread')
  const tf = useTranslations()
  const locale = useLocale()
  const [key, setKey] = useState<string | null>(null)
  const [thread, setThread] = useState<Thread | null | 'loading'>('loading')
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<'sent' | 'problem' | null>(null)
  const [pending, start] = useTransition()

  const load = useCallback(async (k: string) => setThread(await readThread(k)), [])

  useEffect(() => {
    const k = window.location.hash.slice(1)
    setKey(k)
    void load(k)
  }, [load])

  // the day only: a message is stored to the hour on purpose, and a clock would suggest more
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short' }).format(new Date(iso))

  const send = () =>
    start(async () => {
      if (!key) return
      const r = await followUp(key, draft)
      if (r.ok) {
        setDraft('')
        // the thread is read back first, so "Sendt." never stands beside a list without it
        await load(key)
        setNote('sent')
      } else setNote('problem')
    })

  const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

  if (thread === 'loading') {
    return <div className="px-[22px] py-[40px] text-center text-[13.5px] text-mut">{t('loading')}</div>
  }
  if (thread === null) {
    return (
      <div className="px-[20px] py-[40px]">
        <div className="rounded-card border border-line bg-sf px-[22px] py-[26px]">
          <h1 className="m-0 font-display text-[24px] font-semibold leading-[1.2]">{t('invalid')}</h1>
          <p className="mb-0 mt-[10px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">{t('invalidLead')}</p>
        </div>
      </div>
    )
  }

  const open = thread.state !== 'lukket'
  return (
    <div className="px-[22px] pb-[28px] pt-[30px]">
      <div className="inline-block rounded-pill bg-sbg px-[11px] py-[4px] text-[11px] font-bold uppercase tracking-[0.05em]">
        {t('about', { factor: tf(`factor.${thread.factor_key}.label`) })}
      </div>
      <h1 className="m-0 mt-[14px] font-display text-[26px] font-medium leading-[1.2]">{t('title')}</h1>
      <p className="mb-0 mt-[8px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">{t('lead')}</p>

      <ol className="m-0 mt-[20px] flex list-none flex-col gap-[10px] p-0">
        <li className="rounded-opt border border-line bg-sf px-[16px] py-[14px]">
          <div className="text-[11.5px] font-bold text-mut">{t('you')}</div>
          <p className="mb-0 mt-[4px] whitespace-pre-wrap text-[14px] leading-[1.55] [text-wrap:pretty]">{thread.opening}</p>
        </li>
        {thread.messages.map((m, i) => (
          <li
            key={i}
            className={`rounded-opt border px-[16px] py-[14px] ${m.author === 'leder' ? 'border-ink bg-sbg' : 'border-line bg-sf'}`}
          >
            <div className="flex justify-between gap-[10px] text-[11.5px] font-bold text-mut">
              <span>{m.author === 'leder' ? t('leader') : t('you')}</span>
              <span className="font-semibold">{when(m.sent_hour)}</span>
            </div>
            <p className="mb-0 mt-[4px] whitespace-pre-wrap text-[14px] leading-[1.55] [text-wrap:pretty]">{m.body}</p>
          </li>
        ))}
      </ol>

      {thread.messages.every((m) => m.author !== 'leder') ? (
        <p className="mb-0 mt-[14px] text-[13px] leading-[1.55] text-mut">{t('waiting')}</p>
      ) : null}

      {open ? (
        <div className="mt-[18px]">
          <label className="block text-[13px] font-semibold" htmlFor="svar">
            {t('replyLabel')}
          </label>
          <textarea
            id="svar"
            value={draft}
            maxLength={4000}
            onChange={(e) => {
              setDraft(e.target.value)
              setNote(null)
            }}
            placeholder={t('replyPlaceholder')}
            className="mt-[8px] min-h-[96px] w-full resize-y rounded-opt border border-line bg-sf px-[15px] py-[13px] text-[14px] leading-[1.55] text-ink outline-none focus-visible:border-ink"
          />
          <div className="mt-[10px] flex items-center justify-between gap-[12px]">
            <span role="status" className={`text-[13px] font-semibold ${note === 'problem' ? 'text-danger' : 'text-link'}`}>
              {note === 'sent' ? t('sent') : note === 'problem' ? t('problem') : ''}
            </span>
            <button
              type="button"
              onClick={send}
              disabled={pending || !draft.trim()}
              className={`h-[46px] cursor-pointer rounded-opt border border-ink bg-ink px-[26px] text-[15px] font-bold text-bg disabled:cursor-default disabled:opacity-50 ${focus}`}
            >
              {t('send')}
            </button>
          </div>
        </div>
      ) : (
        <p className="mb-0 mt-[18px] rounded-opt border border-line bg-sf px-[16px] py-[13px] text-[13px] leading-[1.55] text-mut">
          {t('closed')}
        </p>
      )}
    </div>
  )
}
