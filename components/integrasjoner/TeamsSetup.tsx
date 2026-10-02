'use client'

import { useState, useTransition } from 'react'
import { saveTeams } from '@/app/(app)/integrasjoner/teams/actions'

/**
 * The Teams screen's two columns (0176, D-203), built as the SMS screen is (SmsSetup, D-66): every
 * choice is saved as it is made — the rule when it is picked, on/off from the button.
 *
 * Every number arrives from public.teams_status, which answers the daglig leder only; for anyone
 * else the count lines are left out rather than drawn as zeros. The preview is the real card:
 * the organisation's invitation lead as the SMS carries it and the button's own label.
 */
export type TeamsWhen = 'mangler' | 'paaminn' | 'alle'

export interface TeamsSetupLabels {
  step1: string
  /** null when the counts are not the viewer's to read */
  reachLine: string | null
  reachNote: string
  appLine: string | null
  appNote: string
  problems: string[] | null
  sent: string | null
  step2: string
  modes: Record<TeamsWhen, { label: string; note: string }>
  step3: string
  installLead: string
  install: string[]
  download: string
  preview: string
  previewSender: string
  previewText: string
  previewButton: string
  previewNote: string
  legal: string
  activate: string
  deactivate: string
  toggleNote: string
  readOnly: string
  saving: string
  problemTexts: Record<string, string>
}

export function TeamsSetup({
  initial,
  canWrite,
  labels,
}: {
  initial: { enabled: boolean; when: TeamsWhen }
  canWrite: boolean
  labels: TeamsSetupLabels
}) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [when, setWhen] = useState<TeamsWhen>(initial.when)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const save = (next: { enabled: boolean; when: TeamsWhen }, undo: () => void) => {
    if (!canWrite) return
    startTransition(async () => {
      const data = new FormData()
      data.set('enabled', String(next.enabled))
      data.set('when', next.when)
      const result = await saveTeams(data)
      setProblem(result.ok ? null : result.problem)
      if (!result.ok) undo()
    })
  }

  return (
    <div className="mt-[24px] grid items-start gap-[20px] md:[grid-template-columns:minmax(0,1.55fr)_minmax(280px,.9fr)]">
      <div className="flex min-w-0 flex-col gap-[14px]">
        {/* 1 · Hvem Teams når */}
        <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.step1}</div>
          {labels.reachLine ? <div className="mt-[13px] text-[15px] font-bold">{labels.reachLine}</div> : null}
          <div className="mt-[8px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{labels.reachNote}</div>
          {labels.appLine ? <div className="mt-[14px] text-[15px] font-bold">{labels.appLine}</div> : null}
          <div className="mt-[8px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{labels.appNote}</div>
          {labels.problems ? (
            <ul className="m-0 mt-[14px] flex list-none flex-col gap-[4px] border-t border-line p-0 pt-[12px] text-[13px] leading-[1.55] text-body">
              {labels.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {labels.sent ? <div className="mt-[8px] text-[12.5px] text-mut">{labels.sent}</div> : null}
        </section>

        {/* 2 · Når skal Teams brukes */}
        <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
          <div id="teams-when" className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.step2}</div>
          <div role="radiogroup" aria-labelledby="teams-when" className="mt-[13px] flex flex-col gap-[8px]">
            {(['mangler', 'paaminn', 'alle'] as const).map((k) => {
              const on = when === k
              return (
                <label
                  key={k}
                  className={`flex items-start gap-[11px] rounded-cta border px-[15px] py-[13px] text-left text-ink ${
                    canWrite ? 'cursor-pointer' : 'cursor-default'
                  } ${on ? 'border-ink bg-sbg' : 'border-line bg-transparent'}`}
                >
                  <input
                    type="radio"
                    name="teams-when"
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

        {/* 3 · Appen i Teams */}
        <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.step3}</div>
          <p className="mb-0 mt-[13px] max-w-[580px] text-[13.5px] leading-[1.6] text-body [text-wrap:pretty]">{labels.installLead}</p>
          <ol className="m-0 mt-[12px] flex list-none flex-col gap-[8px] p-0">
            {labels.install.map((s, i) => (
              <li
                key={s}
                className="grid items-start gap-[13px] rounded-cta border border-line bg-bg px-[14px] py-[12px] [grid-template-columns:24px_minmax(0,1fr)]"
              >
                <span className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-pill bg-ink text-[12px] font-bold text-bg">
                  {i + 1}
                </span>
                <span className="min-w-0 text-[13px] leading-[1.55] [text-wrap:pretty]">{s}</span>
              </li>
            ))}
          </ol>
          {/* a file, not a page: a plain anchor, so the browser downloads it */}
          <a
            href="/integrasjoner/teams/pakke"
            download
            className="mt-[16px] inline-flex h-[38px] items-center justify-center rounded-ctl border border-ink bg-transparent px-[14px] text-[12.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {labels.download}
          </a>
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-[14px] md:sticky md:top-[78px]">
        <section className="rounded-panel border border-line bg-sf p-[20px]">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.preview}</div>
          <div className="mt-[13px] rounded-tile border border-line bg-bg px-[15px] py-[14px]">
            <div className="text-[11px] font-bold text-mut">{labels.previewSender}</div>
            <div className="mt-[8px] rounded-tile border border-line bg-sf px-[14px] py-[13px]">
              <div className="text-[13px] leading-[1.5] text-ink [text-wrap:pretty]">{labels.previewText}</div>
              <div className="mt-[12px] flex h-[34px] items-center justify-center rounded-ctl border border-ink text-[12.5px] font-bold text-ink">
                {labels.previewButton}
              </div>
            </div>
          </div>
          <div className="mt-[10px] text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">{labels.previewNote}</div>
        </section>
        <div className="rounded-note border border-line bg-sbg px-[20px] py-[18px]">
          <div className="text-[12.5px] leading-[1.6] text-body [text-wrap:pretty]">{labels.legal}</div>
        </div>
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
