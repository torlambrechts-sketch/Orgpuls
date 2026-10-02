'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { makeEntryCode, saveSurveyDefaults, type DefaultsValues } from '@/app/(app)/malinger/innstillinger-actions'
import { CheckRow, Chip, RadioCard, Section } from '@/components/maleoppsett/controls'
import { Button } from '@/components/ui/Button'

/**
 * Målinger › Innstillinger (0076, D-126): the organisation's standard for a survey, in the
 * order the work goes — who gets it and how, what it asks, when it closes and reminds, and
 * what happens after. A new round takes the standard; Måleoppsett can change it for one.
 *
 * The design has no such screen. It is built from Måleoppsett's own sections and controls
 * (components/maleoppsett/controls.tsx), so a setting looks the same where the standard is
 * set and where a round is. Everything it prints arrives as props, translated by the server.
 */
export type InnstillingerCopy = {
  intro: string
  status: string
  readOnly: string
  s1: string
  reachHead: string
  reachLine: string
  reachParts: string[]
  reachLink: string
  channelsHead: string
  email: { label: string; note: string }
  /** Slack (0185, D-205) */
  slack: { label: string; note: string; link: string }
  sms: { label: string; note: string; link: string }
  /** Microsoft Teams (0176, D-203) */
  teams: { label: string; note: string; link: string }
  qr: {
    label: string
    note: string
    make: string
    open: string
    renew: string
    renewNote: string
    none: string
    failed: string
  }
  quiet: { label: string; sub: string }
  s2: string
  core: { label: string; note: string; link: string }
  extrasHead: string
  extrasLead: string
  extras: { key: string; label: string; sub: string; screening: boolean }[]
  reasonLabel: string
  reasonNote: string
  commentHead: string
  commentLead: string
  comments: { value: DefaultsValues['commentPolicy']; label: string; note: string }[]
  dialogue: string
  modules: { label: string; note: string; link: string }
  s3: string
  closeHeadGrunnlinje: string
  closeHeadPuls: string
  closeNote: string
  closes: { value: number; label: string }[]
  reminderHead: string
  reminders: { value: number | null; label: string }[]
  final: { label: string; sub: string }
  s4: string
  threshold: string
  thresholdLink: string
  logHead: string
  log: string[]
  logNone: string
  save: string
  saving: string
  saved: string
  savedRounds: string
  problems: { reason_required: string; invalid: string; not_allowed: string; failed: string }
}

export function Innstillinger({
  initial,
  canEdit,
  entryCode,
  copy,
}: {
  initial: DefaultsValues
  canEdit: boolean
  entryCode: string | null
  copy: InnstillingerCopy
}) {
  const [v, setV] = useState<DefaultsValues>(initial)
  const [reason, setReason] = useState(initial.extrasOffReason ?? '')
  const [result, setResult] = useState<null | { ok: true; rounds: number } | { ok: false; text: string }>(null)
  const [codeProblem, setCodeProblem] = useState(false)
  const [pending, start] = useTransition()
  const [codePending, startCode] = useTransition()

  const set = (next: Partial<DefaultsValues>) => {
    setResult(null)
    setV({ ...v, ...next })
  }
  const screeningOff = !(v.extras.includes('krenkende') && v.extras.includes('vold'))
  const off = !canEdit

  const save = () =>
    start(async () => {
      const r = await saveSurveyDefaults({ ...v, extrasOffReason: screeningOff ? reason.trim() || null : null })
      setResult(r.ok ? { ok: true, rounds: r.plannedRounds } : { ok: false, text: copy.problems[r.problem] })
    })

  const code = (renew: boolean) =>
    startCode(async () => {
      const r = await makeEntryCode(renew)
      setCodeProblem(!r.ok)
    })

  return (
    <div className="mt-[20px] flex min-w-0 flex-col gap-[14px]">
      <div className="max-w-[680px]">
        <p className="m-0 text-[14px] leading-[1.6] text-body [text-wrap:pretty]">{copy.intro}</p>
        <p className="mt-[6px] text-[12.5px] text-mut">{copy.status}</p>
        {!canEdit ? <p className="mt-[6px] text-[12.5px] text-mut">{copy.readOnly}</p> : null}
      </div>

      {/* ------------------------------------------------ 1 · Hvem og hvordan */}
      <Section head={copy.s1}>
        <div className="mt-[14px] rounded-tile bg-sbg px-[16px] py-[14px]">
          <span className="block text-[11px] uppercase tracking-[0.11em] text-mut">{copy.reachHead}</span>
          <span className="mt-[5px] block text-[17px] font-bold">{copy.reachLine}</span>
          <ul className="m-0 mt-[6px] flex list-none flex-wrap gap-x-[16px] gap-y-[4px] p-0 text-[12.5px] text-mut">
            {copy.reachParts.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Link href={'/oppsett?fane=ansatte' as Route} className="mt-[8px] inline-block text-[12.5px] font-semibold text-link">
            {copy.reachLink}
          </Link>
        </div>

        <div className="mt-[18px] text-[13.5px] font-semibold">{copy.channelsHead}</div>
        <div className="mt-[10px] flex flex-col gap-[8px]">
          <ChannelRow label={copy.email.label} note={copy.email.note} />
          <ChannelRow
            label={copy.slack.label}
            note={copy.slack.note}
            action={
              <Link href={'/integrasjoner/slack' as Route} className="text-[12.5px] font-semibold text-link">
                {copy.slack.link}
              </Link>
            }
          />
          <ChannelRow
            label={copy.sms.label}
            note={copy.sms.note}
            action={
              <Link href={'/integrasjoner/sms' as Route} className="text-[12.5px] font-semibold text-link">
                {copy.sms.link}
              </Link>
            }
          />
          <ChannelRow
            label={copy.teams.label}
            note={copy.teams.note}
            action={
              <Link href={'/integrasjoner/teams' as Route} className="text-[12.5px] font-semibold text-link">
                {copy.teams.link}
              </Link>
            }
          />
          <ChannelRow
            label={copy.qr.label}
            note={entryCode ? copy.qr.note : copy.qr.none}
            action={
              entryCode ? (
                <span className="flex flex-wrap items-center gap-[12px]">
                  <Link href={'/malinger/plakat' as Route} className="text-[12.5px] font-semibold text-link">
                    {copy.qr.open}
                  </Link>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={codePending}
                      onClick={() => code(true)}
                      aria-describedby="qr-renew-note"
                      className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-[12.5px] font-semibold text-mut underline disabled:cursor-default"
                    >
                      {copy.qr.renew}
                    </button>
                  ) : null}
                </span>
              ) : canEdit ? (
                <Button size="sm" tone="secondary" pad={15} className="bg-bg" disabled={codePending} onClick={() => code(false)}>
                  {copy.qr.make}
                </Button>
              ) : null
            }
          />
          {entryCode && canEdit ? (
            <p id="qr-renew-note" className="m-0 text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">
              {copy.qr.renewNote}
            </p>
          ) : null}
          {codeProblem ? (
            <p role="alert" className="m-0 text-[12.5px] text-danger">
              {copy.qr.failed}
            </p>
          ) : null}
        </div>

        <CheckRow
          name="quietHours"
          label={copy.quiet.label}
          sub={copy.quiet.sub}
          checked={v.quietHours}
          disabled={off}
          onChange={() => set({ quietHours: !v.quietHours })}
          className="mt-[16px] bg-bg"
        />
      </Section>

      {/* ------------------------------------------------ 2 · Hva som spørres */}
      <Section head={copy.s2}>
        <div className="mt-[14px] flex flex-wrap items-baseline justify-between gap-[10px] rounded-tile border border-line px-[15px] py-[12px]">
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">{copy.core.label}</span>
            <span className="mt-[2px] block text-[12.5px] text-mut">{copy.core.note}</span>
          </span>
          <Link href={'/malinger?fane=sporsmal' as Route} className="text-[12.5px] font-semibold text-link">
            {copy.core.link}
          </Link>
        </div>

        <fieldset className="m-0 mt-[18px] border-0 border-t border-line p-0 pt-[16px]">
          <legend className="float-left p-0 text-[13.5px] font-semibold">{copy.extrasHead}</legend>
          <div className="clear-both mt-[3px] max-w-[560px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
            {copy.extrasLead}
          </div>
          <div className="mt-[12px] flex flex-col gap-[8px]">
            {copy.extras.map((x) => (
              <CheckRow
                key={x.key}
                name={`extra-${x.key}`}
                label={x.label}
                sub={x.sub}
                checked={v.extras.includes(x.key as DefaultsValues['extras'][number])}
                disabled={off}
                className="bg-bg"
                onChange={() => {
                  const k = x.key as DefaultsValues['extras'][number]
                  set({ extras: v.extras.includes(k) ? v.extras.filter((e) => e !== k) : [...v.extras, k] })
                }}
              />
            ))}
          </div>
          {screeningOff ? (
            <label className="mt-[12px] block max-w-[560px]">
              <span className="block text-[13px] font-bold">{copy.reasonLabel}</span>
              <span className="mt-[2px] block text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">{copy.reasonNote}</span>
              <textarea
                value={reason}
                disabled={off}
                required
                minLength={10}
                maxLength={500}
                rows={3}
                onChange={(e) => {
                  setResult(null)
                  setReason(e.target.value)
                }}
                className="mt-[8px] w-full rounded-cta border-[1.5px] border-line bg-bg px-[13px] py-[10px] text-[14px] leading-[1.5] text-ink outline-none focus-visible:border-ink"
              />
            </label>
          ) : null}
        </fieldset>

        <div className="mt-[18px] border-t border-line pt-[16px]">
          <div className="text-[13.5px] font-semibold">{copy.commentHead}</div>
          <div className="mt-[3px] max-w-[560px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{copy.commentLead}</div>
          <div className="mt-[12px] flex flex-col gap-[8px]">
            {copy.comments.map((c) => (
              <RadioCard
                key={c.value}
                name="commentPolicy"
                value={c.value}
                label={c.label}
                note={c.note}
                checked={v.commentPolicy === c.value}
                disabled={off}
                labelSize="13.5px"
                noteSize="12.5px"
                padX={14}
                padY={12}
                radius={12}
                onChange={() => set({ commentPolicy: c.value })}
              />
            ))}
          </div>
          <CheckRow
            name="allowDialogue"
            label={copy.dialogue}
            checked={v.allowDialogue}
            disabled={off}
            onChange={() => set({ allowDialogue: !v.allowDialogue })}
            className="mt-[11px] bg-bg"
          />
        </div>

        <div className="mt-[18px] flex flex-wrap items-baseline justify-between gap-[10px] border-t border-line pt-[16px]">
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold">{copy.modules.label}</span>
            <span className="mt-[3px] block text-[12.5px] text-mut">{copy.modules.note}</span>
          </span>
          <Link href={'/malinger?fane=sporsmal' as Route} className="text-[12.5px] font-semibold text-link">
            {copy.modules.link}
          </Link>
        </div>
      </Section>

      {/* ------------------------------------------------ 3 · Svarfrist og påminnelser */}
      <Section head={copy.s3}>
        <div className="mt-[14px] grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          <ChipGroup
            head={copy.closeHeadGrunnlinje}
            name="closeDaysGrunnlinje"
            options={withValue(copy.closes, v.closeDaysGrunnlinje, copy.closes[0]?.label ?? '')}
            value={v.closeDaysGrunnlinje}
            disabled={off}
            onChange={(n) => set({ closeDaysGrunnlinje: n as number })}
          />
          <ChipGroup
            head={copy.closeHeadPuls}
            name="closeDaysPuls"
            options={withValue(copy.closes, v.closeDaysPuls, copy.closes[0]?.label ?? '')}
            value={v.closeDaysPuls}
            disabled={off}
            onChange={(n) => set({ closeDaysPuls: n as number })}
          />
        </div>
        <div className="mt-[10px] max-w-[560px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{copy.closeNote}</div>

        <div className="mt-[18px] border-t border-line pt-[16px]">
          <ChipGroup
            head={copy.reminderHead}
            name="reminderDay"
            options={withValue(copy.reminders, v.reminderDay, copy.reminders[1]?.label ?? '')}
            value={v.reminderDay}
            disabled={off}
            onChange={(n) => set({ reminderDay: n })}
          />
          <CheckRow
            name="finalReminder"
            label={copy.final.label}
            sub={copy.final.sub}
            checked={v.finalReminder}
            disabled={off}
            onChange={() => set({ finalReminder: !v.finalReminder })}
            className="mt-[12px] bg-bg"
          />
        </div>
      </Section>

      {/* ------------------------------------------------ 4 · Etterpå */}
      <Section head={copy.s4}>
        <div className="mt-[14px] flex flex-wrap items-baseline justify-between gap-[10px]">
          <span className="text-[13.5px]">{copy.threshold}</span>
          <Link href={'/oppsett?fane=grupper' as Route} className="text-[12.5px] font-semibold text-link">
            {copy.thresholdLink}
          </Link>
        </div>
        <div className="mt-[16px] border-t border-line pt-[14px]">
          <div className="text-[13.5px] font-semibold">{copy.logHead}</div>
          {copy.log.length ? (
            <ul className="m-0 mt-[8px] flex list-none flex-col gap-[5px] p-0 text-[12.5px] text-mut">
              {copy.log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-[6px] text-[12.5px] text-mut">{copy.logNone}</p>
          )}
        </div>
      </Section>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-[14px]">
          <Button tone="primary" disabled={pending || (screeningOff && reason.trim().length < 10)} onClick={save}>
            {pending ? copy.saving : copy.save}
          </Button>
          <span role="status" className="text-[13px]">
            {result?.ok ? (
              <span className="font-semibold text-greendeep">
                {copy.saved}
                {result.rounds > 0 ? ` ${copy.savedRounds.replace('#', String(result.rounds))}` : ''}
              </span>
            ) : result ? (
              <span className="text-danger">{result.text}</span>
            ) : screeningOff && reason.trim().length < 10 ? (
              <span className="text-mut">{copy.problems.reason_required}</span>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function ChannelRow({ label, note, action }: { label: string; note: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-[10px] rounded-tile border border-line bg-bg px-[15px] py-[12px]">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{label}</span>
        <span className="mt-[2px] block max-w-[520px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">{note}</span>
      </span>
      {action}
    </div>
  )
}

function ChipGroup({
  head,
  name,
  options,
  value,
  disabled,
  onChange,
}: {
  head: string
  name: string
  options: { value: number | null; label: string }[]
  value: number | null
  disabled: boolean
  onChange: (v: number | null) => void
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="p-0 text-[13.5px] font-semibold">{head}</legend>
      <div className="mt-[9px] flex flex-wrap gap-[7px]">
        {options.map((o) => (
          <Chip
            key={String(o.value)}
            type="radio"
            name={name}
            value={String(o.value)}
            label={o.label}
            checked={o.value === value}
            disabled={disabled}
            paddingY={7}
            paddingX={13}
            text="12.5px"
            onChange={() => onChange(o.value)}
          />
        ))}
      </div>
    </fieldset>
  )
}

/**
 * The option set, with the saved value added when it is not one of them — a standard saved
 * with another value is shown as it is, not snapped to the nearest chip.
 */
function withValue(options: { value: number | null; label: string }[], value: number | null, sample: string) {
  if (options.some((o) => o.value === value) || value === null) return options
  const label = sample.replace(/\d+/, String(value))
  return [...options, { value, label }].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
}
