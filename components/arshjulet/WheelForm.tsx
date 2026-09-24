'use client'

import { useState, useTransition } from 'react'
import { saveWheel, type WheelActionResult } from '@/app/(app)/malinger/arshjul-actions'

/**
 * The three cards of Årshjulet that write: the rhythm, the notification ladder's lead
 * time, and the exceptions.
 *
 * The ladder itself is rendered but not reorderable. Its order is the law's: § 6-2 fjerde
 * ledd requires the verneombud be involved before the kartlegging starts, so a wheel that
 * let you drag them below "alle ansatte" would be a wheel that automated a breach. The
 * per-audience lead times are configurable; who comes first is not.
 */

export interface WheelFormProps {
  canWrite: boolean
  values: {
    cadence: string
    notifyLeadDays: number
    extendIfLow: boolean
    skipFellesferie: boolean
    notifyVoOnOverdue: boolean
  }
  options: {
    cadences: { value: string; label: string; note: string }[]
    leads: { value: string; label: string }[]
  }
  ladder: {
    audience: string
    order: number
    label: string
    note: string
    lead: string
    background: string
  }[]
  /**
   * The design puts "Hva skjer i hver runde" between the ladder and the exceptions. It
   * writes nothing, so it does not belong to this component — but it does belong in that
   * position, and moving it out of the column to keep this file tidy would reorder the
   * screen. It arrives as a slot.
   */
  between?: React.ReactNode
  labels: {
    rhythm: string
    notifyHead: string
    roundHead: string
    exceptionHead: string
    extendIfLow: string
    extendIfLowNote: string
    skipFellesferie: string
    skipFellesferieNote: string
    notifyVo: string
    notifyVoNote: string
    saved: string
    problems: Record<string, string>
  }
}

export function WheelForm({ canWrite, values, options, ladder, labels, between }: WheelFormProps) {
  const [v, setV] = useState(values)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const save = (next: Partial<typeof v>) => {
    const merged = { ...v, ...next }
    setV(merged)
    if (!canWrite) return
    startTransition(async () => {
      const data = new FormData()
      data.set('cadence', merged.cadence)
      data.set('notifyLeadDays', String(merged.notifyLeadDays))
      data.set('extendIfLow', merged.extendIfLow ? 'on' : '')
      data.set('skipFellesferie', merged.skipFellesferie ? 'on' : '')
      data.set('notifyVoOnOverdue', merged.notifyVoOnOverdue ? 'on' : '')
      const result: WheelActionResult = await saveWheel(data)
      setProblem(result.ok ? null : result.problem)
      setSaved(result.ok)
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-[14px]">
      <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
        <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.rhythm}</div>
        <div className="mt-[13px] flex flex-col gap-[9px]">
          {options.cadences.map((c) => (
            <label
              key={c.value}
              className={`flex items-start gap-[11px] rounded-cta border px-[15px] py-[13px] text-left ${
                canWrite ? 'cursor-pointer' : 'cursor-not-allowed'
              } ${v.cadence === c.value ? 'border-ink bg-sbg' : 'border-line bg-transparent'}`}
            >
              <input
                type="radio"
                name="cadence"
                value={c.value}
                checked={v.cadence === c.value}
                disabled={!canWrite}
                onChange={() => save({ cadence: c.value })}
                className="peer absolute h-px w-px overflow-hidden opacity-0"
              />
              <span className="mt-[2px] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-pill border-2 border-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
                <span
                  className="block h-[8px] w-[8px] rounded-pill"
                  style={{ background: v.cadence === c.value ? '#191510' : 'transparent' }}
                />
              </span>
              <span className="min-w-0">
                <span className={`block text-[14px] ${v.cadence === c.value ? 'font-bold' : 'font-medium'}`}>
                  {c.label}
                </span>
                <span className="mt-[3px] block text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                  {c.note}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
        <div className="flex flex-wrap items-baseline justify-between gap-[14px]">
          <span className="text-[11px] uppercase tracking-[0.11em] text-mut">
            {labels.notifyHead}
          </span>
          <span className="flex flex-wrap gap-[6px]">
            {options.leads.map((l) => (
              <label key={l.value} className="inline-flex flex-none">
                <input
                  type="radio"
                  name="notifyLeadDays"
                  value={l.value}
                  checked={String(v.notifyLeadDays) === l.value}
                  disabled={!canWrite}
                  onChange={() => save({ notifyLeadDays: Number(l.value) })}
                  className="peer absolute h-px w-px overflow-hidden opacity-0"
                />
                <span
                  className={`inline-flex cursor-pointer items-center rounded-pill border px-[12px] py-[6px] text-[12px] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                    String(v.notifyLeadDays) === l.value
                      ? 'border-ink bg-sbg font-bold'
                      : 'border-line bg-transparent font-medium'
                  }`}
                >
                  {l.label}
                </span>
              </label>
            ))}
          </span>
        </div>

        <div className="mt-[14px] flex flex-col gap-[8px]">
          {ladder.map((n) => (
            <div
              key={n.audience}
              className="grid items-center gap-[13px] rounded-cta border border-line px-[14px] py-[12px] [grid-template-columns:26px_minmax(0,1fr)_108px]"
              style={{ background: n.background }}
            >
              <span className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-pill bg-ink text-[12px] font-bold text-bg">
                {n.order}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold">{n.label}</span>
                <span className="mt-[2px] block text-[12px] leading-[1.45] text-mut [text-wrap:pretty]">
                  {n.note}
                </span>
              </span>
              <span className="text-right text-[12px] font-semibold">{n.lead}</span>
            </div>
          ))}
        </div>
      </section>

      {between ? (
        <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.roundHead}</div>
          <div className="mt-[14px]">{between}</div>
        </section>
      ) : null}

      <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
        <div className="text-[11px] uppercase tracking-[0.11em] text-mut">
          {labels.exceptionHead}
        </div>
        <div className="mt-[13px] flex flex-col gap-[9px]">
          <Toggle
            name="extendIfLow"
            label={labels.extendIfLow}
            note={labels.extendIfLowNote}
            checked={v.extendIfLow}
            disabled={!canWrite}
            onChange={() => save({ extendIfLow: !v.extendIfLow })}
          />
          <Toggle
            name="skipFellesferie"
            label={labels.skipFellesferie}
            note={labels.skipFellesferieNote}
            checked={v.skipFellesferie}
            disabled={!canWrite}
            onChange={() => save({ skipFellesferie: !v.skipFellesferie })}
          />
          <Toggle
            name="notifyVoOnOverdue"
            label={labels.notifyVo}
            note={labels.notifyVoNote}
            checked={v.notifyVoOnOverdue}
            disabled={!canWrite}
            onChange={() => save({ notifyVoOnOverdue: !v.notifyVoOnOverdue })}
          />
        </div>
      </section>

      {problem ? (
        <p className="text-[12.5px] leading-[1.5] text-danger">
          {labels.problems[problem] ?? labels.problems.denied}
        </p>
      ) : saved && !pending ? (
        <p className="text-[12.5px] leading-[1.5] text-link">{labels.saved}</p>
      ) : null}
    </div>
  )
}

/** The design's exception row: a 19px tick on the accent fill (bundle 1380). */
function Toggle({
  name,
  label,
  note,
  checked,
  disabled,
  onChange,
}: {
  name: string
  label: string
  note: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label
      className={`flex w-full items-start gap-[12px] rounded-cta border border-ink bg-sbg px-[15px] py-[13px] text-left ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer absolute h-px w-px overflow-hidden opacity-0"
      />
      <span
        className="mt-[1px] flex h-[19px] w-[19px] flex-none items-center justify-center rounded-[5px] border-2 border-ink text-[11px] font-bold peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
        style={{
          background: checked ? '#191510' : 'transparent',
          color: checked ? '#FCF6E9' : 'transparent',
        }}
      >
        ✓
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold [text-wrap:pretty]">{label}</span>
        <span className="mt-[2px] block text-[12.5px] leading-[1.45] text-mut [text-wrap:pretty]">
          {note}
        </span>
      </span>
    </label>
  )
}
