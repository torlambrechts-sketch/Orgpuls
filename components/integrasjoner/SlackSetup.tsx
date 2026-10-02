'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { requestSlackSync, saveSlack } from '@/app/(app)/integrasjoner/slack/actions'
import type { SlackWhen } from '@/lib/slack/schema'

/**
 * The Slack screen's two columns (0185, D-205), built as the SMS and Teams screens are (SmsSetup,
 * D-66; TeamsSetup, D-203) and with their control classes: every choice is saved as it is made —
 * the rule when it is picked, on/off from the button, a new match from «Synkroniser nå».
 *
 * The design has no Slack anywhere; nothing here is a new control. The workspace and permission
 * cards and the connect/disconnect forms are the server's (the page passes them in), because they
 * post to Slack and back. Every number arrives from public.slack_status, which counts for the
 * daglig leder only; for anyone else the count lines are left out rather than drawn as zeros.
 */
export interface SlackSetupLabels {
  /** null when not connected, or the counts are not the viewer's to read */
  reach: null | {
    step: string
    matchedLine: string
    matchedNote: string
    membersLine: string | null
    synced: string
    syncError: string | null
    sent: string
    syncNow: string
    syncAsked: string
  }
  step: string
  modes: Record<SlackWhen, { label: string; note: string }>
  preview: string
  previewSender: string
  previewText: string
  previewLink: string
  previewNote: string
  legal: string
  activate: string
  deactivate: string
  toggleNote: string
  readOnly: string
  saving: string
  problemTexts: Record<string, string>
}

export function SlackSetup({
  initial,
  connected,
  canWrite,
  labels,
  cards,
  side,
}: {
  initial: { enabled: boolean; when: SlackWhen }
  /** a working installation: the rule and the switch are shown only then */
  connected: boolean
  canWrite: boolean
  labels: SlackSetupLabels
  /** the server's cards for the left column: the workspace and what the app may do */
  cards: ReactNode
  /** the server's top of the right column: notices and the connect or disconnect form */
  side: ReactNode
}) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [when, setWhen] = useState<SlackWhen>(initial.when)
  const [problem, setProblem] = useState<string | null>(null)
  const [asked, setAsked] = useState(false)
  const [pending, startTransition] = useTransition()

  const save = (next: { enabled: boolean; when: SlackWhen }, undo: () => void) => {
    if (!canWrite) return
    startTransition(async () => {
      const data = new FormData()
      data.set('enabled', String(next.enabled))
      data.set('when', next.when)
      const result = await saveSlack(data)
      setProblem(result.ok ? null : result.problem)
      if (!result.ok) undo()
    })
  }

  const sync = () =>
    startTransition(async () => {
      const result = await requestSlackSync()
      setProblem(result.ok ? null : result.problem)
      setAsked(result.ok)
    })

  return (
    <div className="mt-[24px] grid items-start gap-[20px] md:[grid-template-columns:minmax(0,1.55fr)_minmax(280px,.9fr)]">
      <div className="flex min-w-0 flex-col gap-[14px]">
        {cards}

        {/* 3 · Hvem Slack når */}
        {labels.reach ? (
          <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
            <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.reach.step}</div>
            <div className="mt-[13px] text-[15px] font-bold">{labels.reach.matchedLine}</div>
            <div className="mt-[8px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{labels.reach.matchedNote}</div>
            <ul className="m-0 mt-[14px] flex list-none flex-col gap-[4px] border-t border-line p-0 pt-[12px] text-[13px] leading-[1.55] text-body">
              {labels.reach.membersLine ? <li>{labels.reach.membersLine}</li> : null}
              <li>{asked ? labels.reach.syncAsked : labels.reach.synced}</li>
              {labels.reach.syncError ? <li className="text-danger">{labels.reach.syncError}</li> : null}
            </ul>
            <div className="mt-[8px] text-[12.5px] text-mut">{labels.reach.sent}</div>
            {canWrite ? (
              <button
                type="button"
                disabled={pending}
                onClick={sync}
                className="mt-[16px] inline-flex h-[38px] cursor-pointer items-center justify-center rounded-ctl border border-ink bg-transparent px-[14px] text-[12.5px] font-bold text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default"
              >
                {labels.reach.syncNow}
              </button>
            ) : null}
          </section>
        ) : null}

        {/* 4 · Når skal Slack brukes */}
        {connected ? (
          <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
            <div id="slack-when" className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.step}</div>
            <div role="radiogroup" aria-labelledby="slack-when" className="mt-[13px] flex flex-col gap-[8px]">
              {(['paaminn', 'alle'] as const).map((k) => {
                const on = when === k
                return (
                  <label
                    key={k}
                    className={`relative flex items-start gap-[11px] rounded-cta border px-[15px] py-[13px] text-left text-ink ${
                      canWrite ? 'cursor-pointer' : 'cursor-default'
                    } ${on ? 'border-ink bg-sbg' : 'border-line bg-transparent'}`}
                  >
                    <input
                      type="radio"
                      name="slack-when"
                      value={k}
                      checked={on}
                      disabled={!canWrite}
                      onChange={() => {
                        const before = when
                        setWhen(k)
                        save({ enabled, when: k }, () => setWhen(before))
                      }}
                      className="peer absolute h-px w-px overflow-hidden opacity-0"
                    />
                    <span className="mt-[2px] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-pill border-2 border-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
                      <span className="block h-[8px] w-[8px] rounded-pill" style={{ background: on ? '#191510' : 'transparent' }} />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[13.5px] ${on ? 'font-bold' : 'font-medium'}`}>{labels.modes[k].label}</span>
                      <span className="mt-[2px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{labels.modes[k].note}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </section>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-[14px] md:sticky md:top-[78px]">
        {side}
        <section className="rounded-panel border border-line bg-sf p-[20px]">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.preview}</div>
          <div className="mt-[13px] rounded-tile border border-line bg-bg px-[15px] py-[14px]">
            <div className="text-[11px] font-bold text-mut">{labels.previewSender}</div>
            <div className="mt-[8px] text-[13px] leading-[1.5] text-ink [text-wrap:pretty]">{labels.previewText}</div>
            <div className="mt-[4px] break-all text-[13px] leading-[1.5] text-link underline">{labels.previewLink}</div>
          </div>
          <div className="mt-[10px] text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">{labels.previewNote}</div>
        </section>
        <div className="rounded-note border border-line bg-sbg px-[20px] py-[18px]">
          <div className="text-[12.5px] leading-[1.6] text-body [text-wrap:pretty]">{labels.legal}</div>
        </div>
        {connected ? (
          <>
            <button
              type="button"
              disabled={!canWrite || pending}
              onClick={() => {
                const next = !enabled
                setEnabled(next)
                save({ enabled: next, when }, () => setEnabled(!next))
              }}
              className={`h-[46px] cursor-pointer rounded-cta border border-ink text-[15px] font-bold text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default ${
                enabled ? 'bg-transparent' : 'bg-ac'
              }`}
            >
              {enabled ? labels.deactivate : labels.activate}
            </button>
            <div className="text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{labels.toggleNote}</div>
          </>
        ) : null}
        {!canWrite ? <div className="text-[12.5px] leading-[1.55] text-mut">{labels.readOnly}</div> : null}
        {pending ? <div className="text-[12.5px] text-mut">{labels.saving}</div> : null}
        {problem ? (
          <p role="alert" className="m-0 text-[12.5px] leading-[1.5] text-danger">
            {labels.problemTexts[problem] ?? labels.problemTexts.denied}
          </p>
        ) : null}
      </div>
    </div>
  )
}
