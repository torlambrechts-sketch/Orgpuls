'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { closeRoundNow, sendRoundReminder, type CloseProblem, type RemindProblem } from '@/app/(app)/malinger/actions'

/**
 * The Deltakelse card's two buttons while a round is open (v3 1203-1208, 4480-4493; 0133).
 *
 * «Lukk runden» closes the round now, through the wheel's own close, so it asks once first: the
 * first press says what happens, the second closes. «Send påminnelse til de N» queues the
 * ladder's reminder to those who have not answered; like the design's, it sends on the press,
 * and turns into «Maks to påminnelser per runde» after the round's second reminder (counted
 * with the wheel's own) and «Alle har svart» when nobody is outstanding. N is the server's
 * count for the whole round; where it is withheld (fewer than k asked, D-123) the label has no
 * number. Every answer is the database's, and a refusal is said in the words of its guard.
 */
export function RoundControls({
  roundId,
  reminders,
}: {
  roundId: string
  reminders: { sent: number; max: number; outstanding: number | null } | null
}) {
  const t = useTranslations('malinger')
  const [confirming, setConfirming] = useState(false)
  const [problem, setProblem] = useState<{ close: CloseProblem } | { remind: RemindProblem } | null>(null)
  const [pending, start] = useTransition()
  const button =
    'h-[40px] flex-none rounded-btn border text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

  const allAnswered = reminders?.outstanding === 0
  const spent = reminders ? reminders.sent >= reminders.max : false
  const canNudge = reminders !== null && !allAnswered && !spent
  const nudgeLabel = allAnswered
    ? t('nudge.all')
    : spent
      ? t('nudge.max')
      : reminders?.outstanding != null
        ? t('nudge.label', { count: reminders.outstanding })
        : t('nudge.labelNoCount')

  return (
    <span className="flex min-w-0 max-w-[min(460px,100%)] flex-col items-end gap-[8px]">
      {confirming ? (
        <>
          <span className="text-right text-[12.5px] leading-[1.5] text-body [text-wrap:pretty]">{t('close.confirm')}</span>
          <span className="flex flex-wrap justify-end gap-[9px]">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`${button} cursor-pointer border-line bg-transparent px-[15px] font-semibold text-ink`}
            >
              {t('close.cancel')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setProblem(null)
                  const r = await closeRoundNow(roundId)
                  if (!r.ok) setProblem({ close: r.problem })
                  setConfirming(false)
                })
              }
              className={`${button} cursor-pointer border-ink bg-ac px-[17px] font-bold text-ink disabled:cursor-default`}
            >
              {t('close.send')}
            </button>
          </span>
        </>
      ) : (
        <span className="flex flex-wrap justify-end gap-[9px]">
          <button
            type="button"
            onClick={() => {
              setProblem(null)
              setConfirming(true)
            }}
            className={`${button} cursor-pointer border-line bg-transparent px-[15px] font-semibold text-ink`}
          >
            {t('close.label')}
          </button>
          {reminders ? (
            <button
              type="button"
              disabled={!canNudge || pending}
              aria-disabled={!canNudge}
              onClick={() =>
                start(async () => {
                  setProblem(null)
                  const r = await sendRoundReminder(roundId)
                  if (!r.ok) setProblem({ remind: r.problem })
                })
              }
              className={`${button} border-ink px-[17px] font-bold ${
                canNudge ? 'cursor-pointer bg-ac text-ink disabled:cursor-default' : 'cursor-not-allowed bg-transparent text-faint'
              }`}
            >
              {nudgeLabel}
            </button>
          ) : null}
        </span>
      )}
      {problem ? (
        <span role="alert" className="text-right text-[12px] leading-[1.45] text-danger">
          {'close' in problem ? t(`close.problem.${problem.close}`) : t(`nudge.problem.${problem.remind}`)}
        </span>
      ) : null}
    </span>
  )
}
