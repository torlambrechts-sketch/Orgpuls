'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import {
  addOrgQuestion,
  removeOrgQuestion,
  saveConsultation,
  saveSetup,
  type SetupActionResult,
} from '@/app/(app)/maleoppsett/actions'

/**
 * The six sections of Måleoppsett that write.
 *
 * A client component because every control changes what the others say — choosing a
 * comment regime rewrites the note under it, unchecking a department changes the warning,
 * and the design shows all of that immediately. Nothing is decided here: the five-question
 * cap, who may write and what a valid reminder day is all live in the database, and a
 * refusal comes back as a key this component translates from labels the server resolved.
 *
 * **Every control is the real one.** The bundle draws radio groups, checkboxes and chips
 * as `<button onClick>`, because a prototype has no form. A choice of one from three is a
 * radio group, a tick is a checkbox, and a set of departments is a group of checkboxes —
 * styled exactly as the bundle styles those buttons, with the input visually hidden so it
 * keeps its place in the tab order and its focus ring. D-06.
 *
 * Saving is per section rather than one form at the bottom, because the design has no
 * submit button for sections 1-4: the prototype writes on click. A section that has
 * changed shows its own save action, so nothing is written that the person did not ask
 * to write.
 */

export interface Option {
  value: string
  label: string
  note?: string
}

export interface SetupFormProps {
  roundId: string
  canWrite: boolean
  values: {
    kind: string
    factorKeys: string[]
    commentPolicy: string
    allowDialogue: boolean
    reminderDay: number | null
    closeAfterDays: number
    evaluationCadence: string
    invitedGroupIds: string[]
    consultations: {
      kind: 'verneombud_raad' | 'droftet_tillitsvalgte'
      confirmed: boolean
      heldOn: string | null
      counterpart: string | null
    }[]
  }
  options: {
    kinds: Option[]
    factors: Option[]
    commentPolicies: Option[]
    reminders: Option[]
    closes: Option[]
    evaluations: Option[]
    groups: Option[]
  }
  labels: {
    section1: string
    section2: string
    section3: string
    section4: string
    section5: string
    section6: string
    factorNote: string
    seeAll: string
    commentHead: string
    commentLead: string
    dialogue: string
    dialogueNote: string
    groupWarn: string
    groupWarnAlert: boolean
    cadence: string
    reminderHead: string
    closeHead: string
    ownCount: string
    ownNote: string
    ownFull: string
    ownAdd: string
    ownSave: string
    ownOr: string
    ownRemove: string
    ownPlaceholder: string
    suggestions: string[]
    consentLead: string
    vo: string
    voLaw: string
    voNote: string
    tv: string
    tvLaw: string
    tvNote: string
    infoHead: string
    infoLaw: string
    info: { k: string; v: string }[]
    evalHead: string
    evalLaw: string
    saved: string
    problems: Record<string, string>
  }
  orgQuestions: { id: string; body: string }[]
}

export function SetupForm(props: SetupFormProps) {
  const { roundId, canWrite, options, labels } = props
  const [v, setV] = useState(props.values)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<SetupActionResult>) =>
    startTransition(async () => {
      const result = await fn()
      setProblem(result.ok ? null : result.problem)
      setSaved(result.ok)
    })

  /** Every section writes the whole setup, because the server parses the whole shape. */
  const save = (next: Partial<typeof v>) => {
    const merged = { ...v, ...next }
    setV(merged)
    if (!canWrite) return
    run(() => saveSetup(formOf(roundId, merged)))
  }

  const consultationOf = (kind: 'verneombud_raad' | 'droftet_tillitsvalgte') =>
    v.consultations.find((c) => c.kind === kind) ?? {
      kind,
      confirmed: false,
      heldOn: null,
      counterpart: null,
    }

  const toggleConsultation = (kind: 'verneombud_raad' | 'droftet_tillitsvalgte') => {
    const current = consultationOf(kind)
    const next = { ...current, confirmed: !current.confirmed }
    setV({
      ...v,
      consultations: [...v.consultations.filter((c) => c.kind !== kind), next],
    })
    if (!canWrite) return
    const data = new FormData()
    data.set('roundId', roundId)
    data.set('kind', kind)
    data.set('confirmed', next.confirmed ? 'on' : '')
    if (next.heldOn) data.set('heldOn', next.heldOn)
    if (next.counterpart) data.set('counterpart', next.counterpart)
    run(() => saveConsultation(data))
  }

  const vo = consultationOf('verneombud_raad')
  const tv = consultationOf('droftet_tillitsvalgte')

  return (
    <div className="flex min-w-0 flex-col gap-[14px]">
      {/* ------------------------------------------------ 1 · Hva slags måling */}
      <Section head={labels.section1}>
        <div className="mt-[13px] grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          {options.kinds.map((k) => (
            <RadioCard
              key={k.value}
              name="kind"
              value={k.value}
              label={k.label}
              note={k.note}
              checked={v.kind === k.value}
              disabled={!canWrite}
              onChange={() => save({ kind: k.value })}
            />
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------ 2 · Hvilke spørsmål */}
      <Section head={labels.section2}>
        <div className="mt-[14px] flex flex-wrap gap-[7px]">
          {options.factors.map((f) => (
            <Chip
              key={f.value}
              type="checkbox"
              name="factorKeys"
              value={f.value}
              label={f.label}
              checked={v.factorKeys.includes(f.value)}
              disabled={!canWrite}
              paddingY={8}
              paddingX={14}
              text="12.5px"
              onChange={() =>
                save({
                  factorKeys: v.factorKeys.includes(f.value)
                    ? v.factorKeys.filter((k) => k !== f.value)
                    : [...v.factorKeys, f.value],
                })
              }
            />
          ))}
        </div>
        <div className="mt-[11px] max-w-[560px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
          {labels.factorNote}
        </div>

        <Button
          size="sm"
          tone="secondary"
          pad={15}
          className="mt-[14px] bg-bg"
          aria-expanded={questionsOpen}
          onClick={() => setQuestionsOpen(!questionsOpen)}
        >
          {labels.seeAll}
        </Button>

        <div className="mt-[18px] border-t border-line pt-[16px]">
          <div className="text-[13.5px] font-semibold">{labels.commentHead}</div>
          <div className="mt-[3px] max-w-[560px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
            {labels.commentLead}
          </div>
          <div className="mt-[12px] flex flex-col gap-[8px]">
            {options.commentPolicies.map((c) => (
              <RadioCard
                key={c.value}
                name="commentPolicy"
                value={c.value}
                label={c.label}
                note={c.note}
                checked={v.commentPolicy === c.value}
                disabled={!canWrite}
                // the bundle gives these a different box from the kind cards above:
                // 12px 14px at radius 12, note 12.5px (line 1524 against line 1443)
                labelSize="13.5px"
                noteSize="12.5px"
                padX={14}
                padY={12}
                radius={12}
                onChange={() => save({ commentPolicy: c.value })}
              />
            ))}
          </div>

          <CheckRow
            name="allowDialogue"
            label={labels.dialogue}
            checked={v.allowDialogue}
            disabled={!canWrite}
            onChange={() => save({ allowDialogue: !v.allowDialogue })}
            className="mt-[11px] bg-bg"
          />
          <div className="mt-[9px] max-w-[560px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
            {labels.dialogueNote}
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ 3 · Hvem skal svare */}
      <Section head={labels.section3}>
        <div className="mt-[13px] flex flex-wrap gap-[9px]">
          {options.groups.map((g) => {
            // no rows means everyone, so every box is ticked until somebody narrows it
            const on = v.invitedGroupIds.length === 0 || v.invitedGroupIds.includes(g.value)
            return (
              <CheckCard
                key={g.value}
                name="invitedGroupIds"
                value={g.value}
                label={g.label}
                note={g.note ?? ''}
                checked={on}
                disabled={!canWrite}
                onChange={() => {
                  const all = options.groups.map((x) => x.value)
                  const current = v.invitedGroupIds.length === 0 ? all : v.invitedGroupIds
                  const next = current.includes(g.value)
                    ? current.filter((x) => x !== g.value)
                    : [...current, g.value]
                  // back to everyone is the absence of rows, not a list of all of them
                  save({ invitedGroupIds: next.length === all.length ? [] : next })
                }}
              />
            )
          })}
        </div>
        <div
          className={`mt-[12px] max-w-[560px] text-[12.5px] leading-[1.55] [text-wrap:pretty] ${
            labels.groupWarnAlert ? 'text-danger' : 'text-mut'
          }`}
        >
          {labels.groupWarn}
        </div>
      </Section>

      {/* ------------------------------------------------ 4 · Rytme og oppfølging */}
      <Section head={labels.section4}>
        <div className="mt-[13px] flex flex-wrap gap-[7px]">
          {/*
            One chip, not a set. A grunnlinje is one per year by construction —
            app.measurements is keyed (org, kind, year) — so the cadence is a fact about
            the schema rather than a choice. The other cadences the design offers belong
            to the pulse schedule, which is Årshjulet's table. D-27.
          */}
          <span className="inline-flex flex-none items-center rounded-pill border border-ink bg-sbg px-[15px] py-[8px] text-[12.5px] font-bold">
            {labels.cadence}
          </span>
        </div>

        <div className="mt-[18px] grid gap-[18px] border-t border-line pt-[16px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <div>
            <div className="text-[13.5px] font-semibold">{labels.reminderHead}</div>
            <div className="mt-[9px] flex flex-wrap gap-[7px]">
              {options.reminders.map((r) => (
                <Chip
                  key={r.value || 'none'}
                  type="radio"
                  name="reminderDay"
                  value={r.value}
                  label={r.label}
                  checked={(v.reminderDay === null ? '' : String(v.reminderDay)) === r.value}
                  disabled={!canWrite}
                  paddingY={7}
                  paddingX={13}
                  text="12.5px"
                  onChange={() => save({ reminderDay: r.value === '' ? null : Number(r.value) })}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="text-[13.5px] font-semibold">{labels.closeHead}</div>
            <div className="mt-[9px] flex flex-wrap gap-[7px]">
              {options.closes.map((c) => (
                <Chip
                  key={c.value}
                  type="radio"
                  name="closeAfterDays"
                  value={c.value}
                  label={c.label}
                  checked={String(v.closeAfterDays) === c.value}
                  disabled={!canWrite}
                  paddingY={7}
                  paddingX={13}
                  text="12.5px"
                  onChange={() => save({ closeAfterDays: Number(c.value) })}
                />
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ 5 · Egne spørsmål */}
      <Section
        head={labels.section5}
        aside={<span className="text-[11.5px] text-mut">{labels.ownCount}</span>}
      >
        <p className="mt-[7px] max-w-[600px] text-[13px] leading-[1.6] text-mut [text-wrap:pretty]">
          {labels.ownNote}
        </p>

        <div className="mt-[14px] flex flex-col gap-[9px]">
          {props.orgQuestions.map((q, i) => (
            <div
              key={q.id}
              className="flex items-center gap-[10px] rounded-cta border border-line bg-bg px-[13px] py-[11px]"
            >
              <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-pill border border-line bg-sf text-[11px] font-bold">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-[13.5px]">{q.body}</span>
              <Button
                size="tiny"
                tone="secondary"
                pad={0}
                className="w-[32px] bg-transparent text-mut2"
                aria-label={labels.ownRemove}
                disabled={!canWrite || pending}
                onClick={() => {
                  const data = new FormData()
                  data.set('id', q.id)
                  run(() => removeOrgQuestion(data))
                }}
              >
                ×
              </Button>
            </div>
          ))}
        </div>

        {props.orgQuestions.length >= 5 ? (
          <div className="mt-[12px] text-[12.5px] leading-[1.5] text-danger [text-wrap:pretty]">
            {labels.ownFull}
          </div>
        ) : (
          <>
            {/*
              The draft row appears only once there is a draft, which is how the design
              works: "＋ Legg til spørsmål" opens a row to type in, and a suggestion chip
              opens the same row already filled. Before that the section shows the button
              and the suggestions, and nothing else — so its empty state is the design's.
            */}
            {drafting ? (
              <div className="mt-[14px] flex items-center gap-[10px] rounded-cta border border-line bg-bg px-[13px] py-[11px]">
                <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-pill border border-line bg-sf text-[11px] font-bold">
                  {props.orgQuestions.length + 1}
                </span>
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={300}
                  placeholder={labels.ownPlaceholder}
                  className="h-[38px] min-w-0 flex-1 rounded-ctl border border-line bg-sf px-[12px] text-[13.5px] text-ink outline-none"
                />
                <Button
                  size="tiny"
                  tone="primary"
                  pad={12}
                  disabled={pending || draft.trim() === ''}
                  onClick={() => {
                    const data = new FormData()
                    data.set('body', draft)
                    setDraft('')
                    setDrafting(false)
                    run(() => addOrgQuestion(data))
                  }}
                >
                  {labels.ownSave}
                </Button>
                <Button
                  size="tiny"
                  tone="secondary"
                  pad={0}
                  className="w-[32px] bg-transparent text-mut2"
                  aria-label={labels.ownRemove}
                  onClick={() => {
                    setDraft('')
                    setDrafting(false)
                  }}
                >
                  ×
                </Button>
              </div>
            ) : null}

            <div className="mt-[14px] flex flex-wrap items-center gap-[9px]">
              {/*
                Not a Button: h38 / pad 16 / radius 11 at 13px is not a size in the scale,
                and forcing `md` through it left the type at 14px — a wider button and
                every suggestion chip below it displaced. Transcribed from bundle 1626.
              */}
              <button
                type="button"
                disabled={!canWrite || drafting}
                onClick={() => setDrafting(true)}
                className="inline-flex h-[38px] flex-none cursor-pointer items-center justify-center whitespace-nowrap rounded-btn border border-ink bg-ac px-[16px] text-[13px] font-bold text-ink"
              >
                {labels.ownAdd}
              </button>
              <span className="text-[12px] text-mut">{labels.ownOr}</span>
            </div>
            <div className="mt-[10px] flex flex-wrap gap-[7px]">
              {labels.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!canWrite}
                  onClick={() => {
                    setDraft(s)
                    setDrafting(true)
                  }}
                  className="cursor-pointer rounded-pill border border-dashed border-rule bg-transparent px-[13px] py-[8px] text-left text-[12px] font-medium text-body"
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* ------------------------------------------------ 6 · Forankring og drøfting */}
      <section className="rounded-panel border border-line bg-sbg px-[24px] py-[22px]">
        <div className="text-[11px] uppercase tracking-[0.11em] text-mut">{labels.section6}</div>
        <p className="mt-[7px] max-w-[600px] text-[13px] leading-[1.6] text-body [text-wrap:pretty]">
          {labels.consentLead}
        </p>

        <CheckRow
          name="vo"
          label={labels.vo}
          sub={labels.voLaw}
          checked={vo.confirmed}
          disabled={!canWrite}
          onChange={() => toggleConsultation('verneombud_raad')}
          className="mt-[14px] bg-sf"
        />
        <div className="mt-[9px] max-w-[600px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
          {labels.voNote}
        </div>

        <CheckRow
          name="tv"
          label={labels.tv}
          sub={labels.tvLaw}
          checked={tv.confirmed}
          disabled={!canWrite}
          onChange={() => toggleConsultation('droftet_tillitsvalgte')}
          className="mt-[14px] bg-sf"
        />
        <div className="mt-[9px] max-w-[600px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
          {tv.heldOn && tv.counterpart
            ? `${labels.tvNote} ${tv.counterpart}.`
            : labels.tvNote}
        </div>

        <div className="mt-[18px] border-t border-ink/15 pt-[16px]">
          <div className="text-[13.5px] font-semibold">{labels.infoHead}</div>
          <div className="mt-[2px] text-[11.5px] text-mut">{labels.infoLaw}</div>
          <div className="mt-[11px] flex flex-col gap-[8px]">
            {labels.info.map((i) => (
              <div key={i.k} className="flex items-baseline gap-[12px] rounded-btn bg-sf px-[13px] py-[11px]">
                <span className="w-[130px] flex-none text-[12px] font-bold">{i.k}</span>
                <span className="text-[12.5px] leading-[1.5] [text-wrap:pretty]">{i.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-[18px] border-t border-ink/15 pt-[16px]">
          <div className="text-[13.5px] font-semibold">{labels.evalHead}</div>
          <div className="mt-[2px] text-[11.5px] text-mut">{labels.evalLaw}</div>
          <div className="mt-[11px] flex flex-wrap gap-[7px]">
            {options.evaluations.map((e) => (
              <Chip
                key={e.value}
                type="radio"
                name="evaluationCadence"
                value={e.value}
                label={e.label}
                checked={v.evaluationCadence === e.value}
                disabled={!canWrite}
                paddingY={8}
                paddingX={15}
                text="12.5px"
                onChange={() => save({ evaluationCadence: e.value })}
              />
            ))}
          </div>
        </div>
      </section>

      {problem ? (
        <p className="text-[12.5px] leading-[1.5] text-danger [text-wrap:pretty]">
          {labels.problems[problem] ?? labels.problems.denied}
        </p>
      ) : saved ? (
        <p className="text-[12.5px] leading-[1.5] text-link">{labels.saved}</p>
      ) : null}
    </div>
  )
}

/** One numbered card of the setup (bundle 1439: 22px 24px, radius 18, hairline). */
function Section({
  head,
  aside,
  children,
}: {
  head: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
        <span className="text-[11px] uppercase tracking-[0.11em] text-mut">{head}</span>
        {aside}
      </div>
      {children}
    </section>
  )
}

/**
 * The design's radio card: a ring with a filled dot, a bold label and a note.
 *
 * The input is visually hidden rather than removed, so the control keeps its place in the
 * tab order, answers the arrow keys as a radio group should, and takes the focus ring
 * globals.css gives every :focus-visible. The ring and dot are drawn from the bundle's
 * own values (17px, 2px ink, 8px dot).
 */
function RadioCard({
  name,
  value,
  label,
  note,
  checked,
  disabled,
  labelSize = '14px',
  noteSize = '12px',
  padX = 15,
  padY = 14,
  radius = 13,
  onChange,
}: {
  name: string
  value: string
  label: string
  note?: string
  checked: boolean
  disabled?: boolean
  labelSize?: string
  noteSize?: string
  padX?: number
  padY?: number
  radius?: number
  onChange: () => void
}) {
  return (
    <label
      className={`flex items-start gap-[11px] border text-left ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'border-ink bg-sbg' : 'border-line bg-transparent'}`}
      style={{ padding: `${padY}px ${padX}px`, borderRadius: `${radius}px` }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer absolute h-px w-px overflow-hidden opacity-0"
      />
      <span className="mt-[2px] flex h-[17px] w-[17px] flex-none items-center justify-center rounded-pill border-2 border-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
        <span
          className="block h-[8px] w-[8px] rounded-pill"
          style={{ background: checked ? '#191510' : 'transparent' }}
        />
      </span>
      <span className="min-w-0">
        <span
          className={`block ${checked ? 'font-bold' : 'font-medium'}`}
          style={{ fontSize: labelSize }}
        >
          {label}
        </span>
        {note ? (
          <span
            className="mt-[3px] block leading-[1.45] text-mut [text-wrap:pretty]"
            style={{ fontSize: noteSize }}
          >
            {note}
          </span>
        ) : null}
      </span>
    </label>
  )
}

/** The design's full-width checkbox row (bundle 1533): 19px square, radius 5. */
function CheckRow({
  name,
  label,
  sub,
  checked,
  disabled,
  onChange,
  className = '',
}: {
  name: string
  label: string
  sub?: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
  className?: string
}) {
  return (
    <label
      className={`flex w-full items-center gap-[12px] rounded-cta border border-ink px-[15px] py-[13px] text-left ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer absolute h-px w-px overflow-hidden opacity-0"
      />
      <Mark checked={checked} size={19} />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{label}</span>
        {sub ? <span className="mt-[2px] block text-[11.5px] text-mut">{sub}</span> : null}
      </span>
    </label>
  )
}

/** The design's department card (bundle 1549): 18px square, name over headcount. */
function CheckCard({
  name,
  value,
  label,
  note,
  checked,
  disabled,
  onChange,
}: {
  name: string
  value: string
  label: string
  note: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label
      className={`flex items-center gap-[10px] rounded-cta border px-[15px] py-[10px] ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'border-ink bg-sbg' : 'border-line bg-transparent'}`}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer absolute h-px w-px overflow-hidden opacity-0"
      />
      <Mark checked={checked} size={18} />
      <span className="text-left">
        <span className={`block text-[13.5px] ${checked ? 'font-bold' : 'font-medium'}`}>
          {label}
        </span>
        <span className="block text-[11.5px] text-mut">{note}</span>
      </span>
    </label>
  )
}

function Mark({ checked, size }: { checked: boolean; size: number }) {
  return (
    <span
      className="flex flex-none items-center justify-center rounded-[5px] border-2 border-ink text-[11px] font-bold peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: checked ? '#191510' : 'transparent',
        color: checked ? '#FCF6E9' : 'transparent',
      }}
    >
      ✓
    </span>
  )
}

/** A chip that is really a radio or a checkbox — the same substitution MeasureCard makes. */
function Chip({
  type,
  name,
  value,
  label,
  checked,
  disabled,
  paddingY,
  paddingX,
  text,
  onChange,
}: {
  type: 'radio' | 'checkbox'
  name: string
  value: string
  label: string
  checked: boolean
  disabled?: boolean
  paddingY: number
  paddingX: number
  text: string
  onChange: () => void
}) {
  return (
    <label className="inline-flex flex-none">
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer absolute h-px w-px overflow-hidden opacity-0"
      />
      <span
        className={`inline-flex items-center rounded-pill border text-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        } ${checked ? 'border-ink bg-sbg font-bold' : 'border-line bg-transparent font-medium'}`}
        style={{ padding: `${paddingY}px ${paddingX}px`, fontSize: text }}
      >
        {label}
      </span>
    </label>
  )
}

/** The whole setup, as the server's schema expects it. */
function formOf(roundId: string, v: SetupFormProps['values']): FormData {
  const data = new FormData()
  data.set('roundId', roundId)
  data.set('kind', v.kind)
  data.set('commentPolicy', v.commentPolicy)
  data.set('allowDialogue', v.allowDialogue ? 'on' : '')
  data.set('reminderDay', v.reminderDay === null ? '' : String(v.reminderDay))
  data.set('closeAfterDays', String(v.closeAfterDays))
  data.set('evaluationCadence', v.evaluationCadence)
  for (const k of v.factorKeys) data.append('factorKeys', k)
  for (const g of v.invitedGroupIds) data.append('invitedGroupIds', g)
  return data
}
