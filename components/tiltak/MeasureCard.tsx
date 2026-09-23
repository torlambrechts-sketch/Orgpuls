'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import {
  advanceMeasure,
  deleteMeasure,
  updateMeasure,
  type MeasureActionResult,
} from '@/app/(app)/tiltak/actions'

/**
 * One measure: the card from the baseline, and the handlingsplan behind "Rediger".
 * Bundle lines 1765-1862.
 *
 * A client component because the panel opens and closes and the type note changes with
 * the choice — the card itself is otherwise static, and every string it shows was
 * resolved by the server. Nothing about a measure is decided here: the step order, who
 * may write, and the rule that a measure cannot be closed before its effect is measured
 * all live in the database.
 *
 * **The controls are the real ones.** The bundle draws the type and audience choices as
 * `<button onClick>`, because a prototype has no form to submit. A choice between two
 * options is a radio group and a set of affected departments is a group of checkboxes,
 * so that is what these are — styled exactly as the bundle styles those buttons, and
 * keyboard-operable as their real selves. This is the control substitution CLAUDE.md
 * permits and D-06 records.
 */

export interface Option {
  value: string
  label: string
}

export interface MeasureCardProps {
  id: string
  /** everything the card prints, resolved by the server */
  view: {
    factor: string
    lawRef: string
    fromRound: string | null
    title: string
    ownerAndDate: string
    statusLabel: string
    statusStyle: { background: string; color: string }
    steps: { label: string; barColour: string; current: boolean }[]
    goal: string | null
    actionLabel: string
    actionStyle?: { background: string }
    canAdvance: boolean
  }
  /** the form's own values */
  values: {
    title: string
    goal: string
    factorKey: string
    ownerEmployeeId: string
    dueDate: string
    step: string
    kind: 'kollektivt' | 'individuelt'
    groupIds: string[]
    effectRoundId: string
    effectNote: string
  }
  options: {
    owners: Option[]
    factors: Option[]
    steps: Option[]
    groups: Option[]
    effectRounds: Option[]
  }
  labels: {
    edit: string
    close: string
    planHead: string
    title: string
    goal: string
    owner: string
    ownerUnset: string
    due: string
    factor: string
    status: string
    kindHead: string
    kindCollective: string
    kindIndividual: string
    noteCollective: string
    noteIndividual: string
    affectedHead: string
    effectHead: string
    effectRound: string
    effectRoundUnset: string
    effectNote: string
    effectHint: string
    delete: string
    done: string
    problems: Record<string, string>
  }
}

export function MeasureCard({ id, view, values, options, labels }: MeasureCardProps) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState(values.kind)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (action: (data: FormData) => Promise<MeasureActionResult>, data: FormData) =>
    startTransition(async () => {
      const result = await action(data)
      setProblem(result.ok ? null : result.problem)
      if (result.ok) setOpen(false)
    })

  return (
    <div className="rounded-note border border-line bg-sf px-[22px] py-[20px]">
      <div className="flex flex-wrap items-start justify-between gap-[16px]">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-[9px]">
            <span className="rounded-pill bg-sbg px-[10px] py-[3px] text-[11px] font-bold uppercase tracking-[0.04em]">
              {view.factor}
            </span>
            <span className="text-[11.5px] text-mut">{view.lawRef}</span>
            {view.fromRound ? (
              <span className="text-[11.5px] text-mut">{view.fromRound}</span>
            ) : null}
          </span>
          <span className="mt-[9px] block text-[16px] font-semibold [text-wrap:pretty]">
            {view.title}
          </span>
          <span className="mt-[3px] block text-[12.5px] text-mut">{view.ownerAndDate}</span>
        </span>
        <span className="flex-none text-right">
          <span
            className="inline-block rounded-pill px-[12px] py-[5px] text-[11.5px] font-bold"
            style={view.statusStyle}
          >
            {view.statusLabel}
          </span>
        </span>
      </div>

      <div className="mt-[18px] flex items-center overflow-x-auto">
        {view.steps.map((s, i) => (
          <span key={i} className="min-w-[76px] flex-1 text-center">
            <span className="block h-[6px] rounded-pill" style={{ background: s.barColour }} />
            <span
              className={`mt-[6px] block text-[10.5px] ${
                s.current ? 'font-bold text-ink' : 'font-medium text-mut'
              }`}
            >
              {s.label}
            </span>
          </span>
        ))}
      </div>

      <div className="mt-[16px] flex flex-wrap items-center justify-between gap-[12px] border-t border-line pt-[14px]">
        <span className="max-w-[520px] text-[12.5px] text-mut [text-wrap:pretty]">{view.goal}</span>
        <span className="flex flex-wrap gap-[8px]">
          <Button
            size="sm"
            tone="secondary"
            pad={15}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? labels.close : labels.edit}
          </Button>
          <Button
            size="sm"
            tone="primary"
            pad={16}
            disabled={!view.canAdvance || pending}
            style={view.actionStyle}
            onClick={() => {
              const data = new FormData()
              data.set('id', id)
              run(advanceMeasure, data)
            }}
          >
            {view.actionLabel}
          </Button>
        </span>
      </div>

      {problem ? (
        <p className="mt-[12px] text-[12.5px] leading-[1.5] text-danger [text-wrap:pretty]">
          {labels.problems[problem] ?? labels.problems.denied}
        </p>
      ) : null}

      {open ? (
        <form
          action={(data) => {
            data.set('id', id)
            run(updateMeasure, data)
          }}
          className="mt-[16px] rounded-opt border border-line bg-bg p-[20px]"
        >
          <div className="text-[11px] uppercase tracking-[0.1em] text-mut">{labels.planHead}</div>

          <label className="mt-[13px] block">
            <span className="mb-[5px] block text-[12px] text-mut">{labels.title}</span>
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={values.title}
              className="box-border h-[42px] w-full rounded-btn border border-line bg-sf px-[14px] text-[14px] font-semibold text-ink outline-none"
            />
          </label>

          <label className="mt-[12px] block">
            <span className="mb-[5px] block text-[12px] text-mut">{labels.goal}</span>
            <textarea
              name="goal"
              maxLength={2000}
              defaultValue={values.goal}
              className="box-border min-h-[74px] w-full resize-y rounded-btn border border-line bg-sf px-[14px] py-[11px] text-[13.5px] leading-[1.55] text-ink outline-none"
            />
          </label>

          <div className="mt-[12px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
            <Field label={labels.owner}>
              <select name="ownerEmployeeId" defaultValue={values.ownerEmployeeId} className={CONTROL}>
                <option value="">{labels.ownerUnset}</option>
                {options.owners.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={labels.due}>
              <input type="date" name="dueDate" defaultValue={values.dueDate} className={CONTROL} />
            </Field>

            <Field label={labels.factor}>
              <select name="factorKey" defaultValue={values.factorKey} className={CONTROL}>
                {options.factors.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={labels.status}>
              <select name="step" defaultValue={values.step} className={CONTROL}>
                {options.steps.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <fieldset className="mt-[14px] min-w-0 border-0 p-0">
            <legend className="mb-[7px] block p-0 text-[12px] text-mut">{labels.kindHead}</legend>
            <span className="flex flex-wrap gap-[7px]">
              {(['kollektivt', 'individuelt'] as const).map((k) => (
                <Choice
                  key={k}
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  label={k === 'kollektivt' ? labels.kindCollective : labels.kindIndividual}
                  height={34}
                  padding={15}
                  text="12.5px"
                />
              ))}
            </span>
            <span
              // the design tints the note when the choice is the one it argues against
              className={`mt-[8px] block max-w-[540px] text-[12px] leading-[1.5] [text-wrap:pretty] ${
                kind === 'individuelt' ? 'text-caution' : 'text-mut'
              }`}
            >
              {kind === 'individuelt' ? labels.noteIndividual : labels.noteCollective}
            </span>
          </fieldset>

          <fieldset className="mt-[14px] min-w-0 border-0 p-0">
            <legend className="mb-[7px] block p-0 text-[12px] text-mut">
              {labels.affectedHead}
            </legend>
            <span className="flex flex-wrap gap-[7px]">
              {options.groups.map((g) => (
                <Choice
                  key={g.value}
                  type="checkbox"
                  name="groupIds"
                  value={g.value}
                  defaultChecked={values.groupIds.includes(g.value)}
                  label={g.label}
                  height={32}
                  padding={13}
                  text="12px"
                />
              ))}
            </span>
          </fieldset>

          {/*
            Not in the design (D-52): section 6 of the report needs the round that showed
            whether this worked and a person's judgement on it, and the bundle's panel has
            no field for either. The same controls as the panel's own fields.
          */}
          <fieldset className="mt-[14px] min-w-0 border-0 p-0">
            <legend className="mb-[7px] block p-0 text-[12px] text-mut">{labels.effectHead}</legend>
            {/* auto-fill, not the panel's auto-fit: one field keeps one column's width */}
            <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
              <Field label={labels.effectRound}>
                <select name="effectRoundId" defaultValue={values.effectRoundId} className={CONTROL}>
                  <option value="">{labels.effectRoundUnset}</option>
                  {options.effectRounds.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="mt-[12px] block">
              <span className="mb-[5px] block text-[12px] text-mut">{labels.effectNote}</span>
              <textarea
                name="effectNote"
                maxLength={2000}
                defaultValue={values.effectNote}
                className="box-border min-h-[64px] w-full resize-y rounded-btn border border-line bg-sf px-[14px] py-[11px] text-[13.5px] leading-[1.55] text-ink outline-none"
              />
            </label>
            <span className="mt-[6px] block max-w-[540px] text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">
              {labels.effectHint}
            </span>
          </fieldset>

          <div className="mt-[18px] flex flex-wrap justify-between gap-[10px] border-t border-line pt-[14px]">
            <Button
              size="sm"
              tone="secondary"
              pad={15}
              disabled={pending}
              className="border-orange"
              // the one hex in the bundle that is not in the palette: #8A3A16 appears
              // exactly once, here, where every other danger text is #A33A16. The bundle
              // wins on visuals, and a value used once is an instance, not a token.
              style={{ color: '#8A3A16' }}
              onClick={(event) => {
                event.preventDefault()
                const data = new FormData()
                data.set('id', id)
                run(deleteMeasure, data)
              }}
            >
              {labels.delete}
            </Button>
            <Button size="sm" tone="primary" pad={18} type="submit" disabled={pending}>
              {labels.done}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

/** The panel's select and date field: 40px, radius 10, on the card surface (bundle 1810). */
const CONTROL =
  'box-border h-[40px] w-full rounded-ctl border border-line bg-sf px-[11px] text-[13.5px] text-ink outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-[5px] block text-[12px] text-mut">{label}</span>
      {children}
    </label>
  )
}

/**
 * A chip that is really a radio or a checkbox.
 *
 * The input is visually hidden rather than `display:none`, so it keeps its place in the
 * tab order and its focus ring; the label is what carries the bundle's chip styling, and
 * `peer-checked` colours it. This is the whole substitution: a prototype's button
 * becomes the control it was drawing.
 */
function Choice({
  type,
  name,
  value,
  label,
  height,
  padding,
  text,
  checked,
  defaultChecked,
  onChange,
}: {
  type: 'radio' | 'checkbox'
  name: string
  value: string
  label: string
  height: number
  padding: number
  text: string
  checked?: boolean
  defaultChecked?: boolean
  onChange?: () => void
}) {
  return (
    <label className="inline-flex flex-none">
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        className="peer absolute h-px w-px overflow-hidden opacity-0"
      />
      <span
        className="inline-flex cursor-pointer items-center rounded-pill border border-line bg-transparent font-medium text-ink peer-checked:border-ink peer-checked:bg-sbg peer-checked:font-bold peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
        style={{ height: `${height}px`, paddingInline: `${padding}px`, fontSize: text }}
      >
        {label}
      </span>
    </label>
  )
}
