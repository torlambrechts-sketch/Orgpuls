'use client'

import { useState, useTransition } from 'react'
import { saveSms } from '@/app/(app)/integrasjoner/sms/actions'
import { SMS_TEXT_MAX, smsContent, smsLength } from '@/supabase/functions/_shared/sms'

/**
 * The SMS screen's two columns (bundle: the connection screen's `isSms` branch). D-66.
 *
 * One client component because the preview, the counter and the cost line all follow the
 * text as it is typed. Every choice is saved as it is made — a mode when it is picked, the
 * text when the field is left, on/off from the button — the way the design's own screen
 * behaves, with no separate "Lagre".
 *
 * Three honest variations on the design, logged in D-66:
 *  - the sender field shows "Orgpuls" and cannot be edited: every sender name has to be
 *    registered with the operators, so one registered name serves every organisation;
 *  - the counter counts the real link (90 characters), not the design's 17-character short
 *    link, and counts GSM-7 segments the way operators bill them;
 *  - the cost line counts messages and billed SMS; the design's "0,49 kr per melding" is a
 *    price nobody here knows.
 */
export type SmsWhen = 'mangler' | 'paaminn' | 'alle'

export interface SmsSetupLabels {
  step1: string
  mobileLine: string
  mobileNote: string
  step2: string
  sender: string
  senderFixed: string
  senderNote: string
  text: string
  /** "{chars} tegn · {parts}" resolved on the client from `counterParts` */
  counterOne: string
  counterMany: string
  linkNote: string
  step3: string
  modes: Record<SmsWhen, { label: string; note: string }>
  cost: Record<SmsWhen, string>
  costUnits: string
  preview: string
  now: string
  legal: string
  activate: string
  deactivate: string
  toggleNote: string
  creditsNote: string
  readOnly: string
  saving: string
  problems: Record<string, string>
}

export function SmsSetup({
  initial,
  defaultText,
  sender,
  sampleLink,
  reach,
  canWrite,
  labels,
}: {
  initial: { enabled: boolean; when: SmsWhen; text: string | null }
  defaultText: string
  sender: string
  sampleLink: string
  reach: { total: number; withPhone: number; phoneNoEmail: number }
  canWrite: boolean
  labels: SmsSetupLabels
}) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [when, setWhen] = useState<SmsWhen>(initial.when)
  const [text, setText] = useState(initial.text ?? defaultText)
  const [savedText, setSavedText] = useState(initial.text ?? defaultText)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const save = (next: { enabled: boolean; when: SmsWhen; text: string }) => {
    if (!canWrite) return
    startTransition(async () => {
      const data = new FormData()
      data.set('enabled', String(next.enabled))
      data.set('when', next.when)
      // the default is stored as null, so a later change to it reaches this organisation
      data.set('text', next.text.trim() === defaultText.trim() ? '' : next.text)
      const result = await saveSms(data)
      setProblem(result.ok ? null : result.problem)
      if (result.ok) setSavedText(next.text)
    })
  }

  const full = smsContent(text, sampleLink)
  const length = smsLength(full)
  const pct = reach.total === 0 ? 0 : Math.round((reach.withPhone / reach.total) * 100)
  const perRound = when === 'alle' ? reach.withPhone : when === 'paaminn' ? reach.withPhone : reach.phoneNoEmail
  const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (a, k: string) => (k in v ? String(v[k]) : a))

  return (
    <div className="mt-[24px] grid items-start gap-[20px] md:[grid-template-columns:minmax(0,1.55fr)_minmax(280px,.9fr)]">
      <div className="flex min-w-0 flex-col gap-[14px]">
        {/* 1 · Mobilnumre */}
        <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.step1}</div>
          <div className="mt-[13px] flex flex-wrap items-baseline justify-between gap-[12px]">
            <span className="text-[15px] font-bold">{labels.mobileLine}</span>
            <span className="text-[12.5px] text-mut">{pct} %</span>
          </div>
          <span className="mt-[9px] block h-[8px] overflow-hidden rounded-pill bg-ink/[0.08]">
            <span className="block h-full rounded-pill bg-amberbar" style={{ width: `${pct}%` }} />
          </span>
          <div className="mt-[11px] max-w-[580px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
            {labels.mobileNote}
          </div>
        </section>

        {/* 2 · Avsender og melding */}
        <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.step2}</div>
          <label className="mt-[13px] block max-w-[280px]">
            <span className="mb-[6px] flex items-baseline justify-between gap-[10px] text-[12.5px] text-mut">
              <span>{labels.sender}</span>
              <span>{labels.senderFixed}</span>
            </span>
            <input
              value={sender}
              readOnly
              aria-describedby="sms-sender-note"
              className="box-border h-[42px] w-full rounded-btn border border-line bg-bg px-[14px] text-[14px] text-ink outline-none"
            />
          </label>
          <div id="sms-sender-note" className="mt-[7px] max-w-[580px] text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">
            {labels.senderNote}
          </div>
          <label className="mt-[14px] block">
            <span className="mb-[6px] flex items-baseline justify-between gap-[10px] text-[12.5px] text-mut">
              <span>{labels.text}</span>
              <span style={{ color: length.parts > 1 ? '#A33A16' : '#5F5849' }}>
                {fill(length.parts === 1 ? labels.counterOne : labels.counterMany, { chars: length.chars, parts: length.parts })}
              </span>
            </span>
            <textarea
              value={text}
              maxLength={SMS_TEXT_MAX}
              readOnly={!canWrite}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                if (text !== savedText) save({ enabled, when, text })
              }}
              className="box-border min-h-[86px] w-full resize-y rounded-cta border border-line bg-bg px-[14px] py-[12px] text-[13.5px] leading-[1.55] text-ink outline-none"
            />
          </label>
          <div className="mt-[8px] max-w-[580px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
            {labels.linkNote}
          </div>
        </section>

        {/* 3 · Når skal SMS brukes */}
        <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
          <div id="sms-when" className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.step3}</div>
          <div role="radiogroup" aria-labelledby="sms-when" className="mt-[13px] flex flex-col gap-[8px]">
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
                    name="sms-when"
                    value={k}
                    checked={on}
                    disabled={!canWrite}
                    onChange={() => {
                      setWhen(k)
                      save({ enabled, when: k, text })
                    }}
                    className="peer absolute h-px w-px overflow-hidden opacity-0"
                  />
                  <span className="mt-[2px] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-pill border-2 border-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
                    <span className="block h-[8px] w-[8px] rounded-pill" style={{ background: on ? '#191510' : 'transparent' }} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[13.5px] ${on ? 'font-bold' : 'font-medium'}`}>{labels.modes[k].label}</span>
                    <span className="mt-[2px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                      {labels.modes[k].note}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
          <div className="mt-[16px] flex flex-wrap items-baseline justify-between gap-[12px] border-t border-line pt-[14px]">
            <span className="text-[12.5px] text-mut">{fill(labels.cost[when], { count: perRound, parts: length.parts })}</span>
            <span className="text-[14px] font-bold">{fill(labels.costUnits, { units: perRound * length.parts })}</span>
          </div>
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-[14px] md:sticky md:top-[78px]">
        <section className="rounded-panel border border-line bg-sf p-[20px]">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.preview}</div>
          <div className="mt-[13px] rounded-[22px] bg-ink p-[8px]">
            <div className="rounded-note bg-bg px-[15px] py-[14px]">
              <div className="text-[11px] font-bold text-mut">{sender}</div>
              <div
                className="mt-[8px] break-words rounded-tile px-[13px] py-[11px] text-[13px] leading-[1.5] text-ink [text-wrap:pretty]"
                style={{ background: '#E8E8EC' }}
              >
                {full}
              </div>
              <div className="mt-[6px] text-[10.5px] text-faint">{labels.now}</div>
            </div>
          </div>
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
            save({ enabled: next, when, text })
          }}
          className={`h-[46px] cursor-pointer rounded-cta border border-ink text-[15px] font-bold text-ink disabled:cursor-default ${
            enabled ? 'bg-transparent' : 'bg-ac'
          }`}
        >
          {enabled ? labels.deactivate : labels.activate}
        </button>
        <div className="text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
          {labels.toggleNote} {labels.creditsNote}
        </div>
        {!canWrite ? <div className="text-[12.5px] leading-[1.55] text-mut">{labels.readOnly}</div> : null}
        {pending ? <div className="text-[12.5px] text-mut">{labels.saving}</div> : null}
        {problem ? (
          <p role="alert" className="text-[12.5px] leading-[1.5] text-danger">
            {labels.problems[problem] ?? labels.problems.denied}
          </p>
        ) : null}
      </div>
    </div>
  )
}
