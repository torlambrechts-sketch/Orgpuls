'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { startNextPulse, type StartResult } from '@/app/(app)/malinger/actions'

/**
 * "Start neste puls nå" (v3 1210). It sends to every employee today, so it asks once
 * before it does: the first press says what will happen, the second sends. The answer is
 * the database's (0038), and a refusal says why in the words of its guard.
 */
export function StartPulse({ roundOpen }: { roundOpen: boolean }) {
  const t = useTranslations('malinger.start')
  const locale = useLocale()
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<StartResult | null>(null)
  const [pending, start] = useTransition()
  const button =
    'h-[40px] flex-none cursor-pointer rounded-btn border px-[17px] text-[13px] font-bold disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

  if (roundOpen) return <span className="max-w-[300px] text-[12.5px] leading-[1.5] text-mut">{t('open')}</span>
  if (result?.ok)
    return (
      <span role="status" className="max-w-[300px] text-[12.5px] font-semibold leading-[1.5] text-link">
        {t('started')}
      </span>
    )

  const from =
    result && !result.ok && result.from
      ? new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Oslo', day: 'numeric', month: 'long' }).format(new Date(result.from))
      : ''

  return (
    <span className="flex max-w-[420px] flex-col items-end gap-[8px]">
      {confirming ? (
        <>
          <span className="text-right text-[12.5px] leading-[1.5] text-body [text-wrap:pretty]">{t('confirm')}</span>
          <span className="flex gap-[9px]">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`${button} border-line bg-transparent font-semibold text-ink`}
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await startNextPulse()
                  setResult(r)
                  setConfirming(false)
                })
              }
              className={`${button} border-ink bg-ac text-ink`}
            >
              {t('send')}
            </button>
          </span>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setResult(null)
            setConfirming(true)
          }}
          className={`${button} border-ink bg-ac text-ink`}
        >
          {t('label')}
        </button>
      )}
      {result && !result.ok ? (
        <span role="alert" className="text-right text-[12px] leading-[1.45] text-danger">
          {t(`problem.${result.problem}`, { date: from })}
        </span>
      ) : null}
    </span>
  )
}
