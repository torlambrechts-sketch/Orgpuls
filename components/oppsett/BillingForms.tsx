'use client'

import { useActionState, useId, useState } from 'react'
import Link from 'next/link'
import {
  cancelSubscription,
  downgradeToFree,
  extendTrial,
  saveBilling,
  withdrawCancellation,
  withdrawDowngrade,
  type BillingResult,
} from '@/app/(app)/oppsett/billing-actions'
import { Button } from '@/components/ui/Button'

/**
 * The two things a daglig leder does on Oppsett › Betaling (D-89): extend the trial, once,
 * and choose a plan with the details to invoice. Both are server actions over the RPCs in
 * 0048, which refuse anything they should; a refusal comes back as a line in words.
 */
export function ExtendTrialButton({
  labels,
}: {
  labels: { submit: string; pending: string; note: string; problems: Record<string, string> }
}) {
  const [state, action, pending] = useActionState<BillingResult | null>(extendTrial, null)
  const problem = state && !state.ok ? (labels.problems[state.problem] ?? labels.problems.failed) : null
  return (
    <form action={action} className="mt-[14px] flex flex-wrap items-center gap-[12px]">
      <Button type="submit" size="md" tone="secondary" disabled={pending}>
        {pending ? labels.pending : labels.submit}
      </Button>
      <span className="text-[12.5px] text-mut">{labels.note}</span>
      {problem ? (
        <span role="alert" className="basis-full text-[12.5px] font-semibold text-danger">
          {problem}
        </span>
      ) : null}
    </form>
  )
}

type Interval = 'month' | 'year'
type PlanOption = {
  key: string
  name: string
  who: string
  price: Record<Interval, string>
  unit: Record<Interval, string>
  /** a yearly price as a month, «tilsvarer 221 kr per måned»; null for the plan by agreement */
  perMonth: string | null
  fits: boolean
  suggested: boolean
}

export function BillingForm({
  plans,
  initial,
  vat,
  orgNumber,
  confirmed,
  labels,
}: {
  plans: PlanOption[]
  initial: { plan: string | null; interval: Interval; invoiceEmail: string; invoiceRef: string; ehf: boolean }
  /** a UK organisation's VAT registration number, drawn where EHF is for Norway (0227, D-274); null elsewhere */
  vat: { initial: string; label: string; hint: string } | null
  orgNumber: string | null
  confirmed: boolean
  labels: {
    planLegend: string
    intervalLegend: string
    intervals: Record<Interval, string>
    suggested: string
    tooMany: string
    invoiceEmail: string
    invoiceEmailHint: string
    invoiceRef: string
    invoiceRefHint: string
    ehf: string
    ehfNoOrgnr: string
    terms: Record<Interval, string>
    save: string
    confirm: string
    confirmGroup: string
    saved: string
    confirmedNow: string
    pending: string
    problems: Record<string, string>
  }
}) {
  const id = useId()
  const [plan, setPlan] = useState(initial.plan ?? plans.find((p) => p.suggested)?.key ?? plans[0]?.key ?? '')
  const [interval, setInterval] = useState<Interval>(initial.interval)
  // controlled, so a refused save keeps what was typed rather than React's reset to the defaults
  const [invoiceEmail, setInvoiceEmail] = useState(initial.invoiceEmail)
  const [invoiceRef, setInvoiceRef] = useState(initial.invoiceRef)
  const [ehf, setEhf] = useState(initial.ehf)
  const [vatNumber, setVatNumber] = useState(vat?.initial ?? '')
  const [state, action, pending] = useActionState<BillingResult | null, FormData>(saveBilling, null)
  const problem = state && !state.ok ? (labels.problems[state.problem] ?? labels.problems.failed) : null
  const done = state?.ok ? (state.confirmed ? labels.confirmedNow : labels.saved) : null

  return (
    <form action={action} className="flex flex-col gap-[16px]" aria-describedby={problem ? `${id}-problem` : undefined}>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-[10px] p-0 text-[12.5px] font-semibold">{labels.intervalLegend}</legend>
        <div className="inline-flex max-w-full flex-wrap rounded-cta border border-line bg-track p-[3px]">
          {(['month', 'year'] as const).map((v) => (
            <label
              key={v}
              className={`cursor-pointer rounded-bar px-[14px] py-[7px] text-[13px] font-bold leading-[normal] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ink ${
                interval === v ? 'bg-ink text-bg' : 'bg-transparent text-ink'
              }`}
            >
              <input
                type="radio"
                name="interval"
                value={v}
                checked={interval === v}
                onChange={() => setInterval(v)}
                className="sr-only"
              />
              {labels.intervals[v]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-[10px] p-0 text-[12.5px] font-semibold">{labels.planLegend}</legend>
        <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
          {plans.map((p) => {
            const on = plan === p.key
            return (
              <label
                key={p.key}
                className={`relative flex cursor-pointer flex-col gap-[4px] rounded-row border px-[16px] py-[14px] ${
                  on ? 'border-ink bg-sbg' : 'border-line bg-sf'
                } ${p.fits ? '' : 'cursor-not-allowed opacity-60'}`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={p.key}
                  checked={on}
                  disabled={!p.fits}
                  onChange={() => setPlan(p.key)}
                  className="absolute right-[14px] top-[16px] h-[16px] w-[16px] accent-ink"
                />
                <span className="flex flex-wrap items-center gap-[8px] pr-[26px]">
                  <span className="text-[14.5px] font-bold">{p.name}</span>
                  {p.suggested ? (
                    <span className="rounded-pill bg-ac px-[8px] py-[2px] text-[10.5px] font-bold">{labels.suggested}</span>
                  ) : null}
                </span>
                <span className="text-[12px] text-mut">{p.who}</span>
                <span className="mt-[4px] flex items-baseline gap-[6px]">
                  <span className="font-display text-[22px] font-semibold leading-none">{p.price[interval]}</span>
                  <span className="text-[12px] text-mut">{p.unit[interval]}</span>
                </span>
                {interval === 'year' && p.perMonth ? <span className="text-[11.5px] text-mut">{p.perMonth}</span> : null}
                {!p.fits ? <span className="mt-[2px] text-[11.5px] text-mut">{labels.tooMany}</span> : null}
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="grid gap-[12px] sm:grid-cols-2">
        <label className="block">
          <span className="mb-[6px] block text-[12.5px] font-semibold">{labels.invoiceEmail}</span>
          <input
            name="invoiceEmail"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={invoiceEmail}
            onChange={(e) => setInvoiceEmail(e.target.value)}
            aria-describedby={`${id}-email`}
            className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
          />
          <span id={`${id}-email`} className="mt-[5px] block text-[11.5px] text-mut">
            {labels.invoiceEmailHint}
          </span>
        </label>
        <label className="block">
          <span className="mb-[6px] block text-[12.5px] font-semibold">{labels.invoiceRef}</span>
          <input
            name="invoiceRef"
            maxLength={60}
            value={invoiceRef}
            onChange={(e) => setInvoiceRef(e.target.value)}
            aria-describedby={`${id}-ref`}
            className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
          />
          <span id={`${id}-ref`} className="mt-[5px] block text-[11.5px] text-mut">
            {labels.invoiceRefHint}
          </span>
        </label>
      </div>

      {vat ? (
        <label className="block sm:max-w-[50%] sm:pr-[6px]">
          <span className="mb-[6px] block text-[12.5px] font-semibold">{vat.label}</span>
          <input
            name="vatNumber"
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            value={vatNumber}
            onChange={(e) => setVatNumber(e.target.value)}
            aria-describedby={`${id}-vat`}
            className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
          />
          <span id={`${id}-vat`} className="mt-[5px] block text-[11.5px] text-mut">
            {vat.hint}
          </span>
        </label>
      ) : (
        <label className={`flex items-start gap-[10px] text-[13px] leading-[1.55] ${orgNumber ? '' : 'opacity-60'}`}>
          <input
            name="ehf"
            type="checkbox"
            checked={ehf}
            onChange={(e) => setEhf(e.target.checked)}
            disabled={!orgNumber}
            className="mt-[3px] h-[16px] w-[16px] flex-none accent-ink"
          />
          <span>{orgNumber ? labels.ehf : labels.ehfNoOrgnr}</span>
        </label>
      )}

      <p className="m-0 text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{labels.terms[interval]}</p>

      <div className="flex flex-wrap items-center gap-[10px]">
        {confirmed ? null : (
          <Button type="submit" name="intent" value="confirm" size="md" disabled={pending}>
            {pending ? labels.pending : plan === 'group' ? labels.confirmGroup : labels.confirm}
          </Button>
        )}
        <Button type="submit" name="intent" value="save" size="md" tone="secondary" disabled={pending}>
          {labels.save}
        </Button>
        {problem ? (
          <span id={`${id}-problem`} role="alert" className="text-[12.5px] font-semibold text-danger">
            {problem}
          </span>
        ) : done ? (
          <span role="status" className="text-[12.5px] font-semibold text-link">
            {done}
          </span>
        ) : null}
      </div>
    </form>
  )
}

type CancelLabels = {
  open: string
  reasonLegend: string
  reasons: Record<string, string>
  confirm: string
  download: string
  submit: string
  pending: string
  back: string
  problems: Record<string, string>
}

/**
 * Cancelling (0066, D-110): a quiet button that opens the step itself — both dates, why (one
 * of five answers, or none), the report to download first, and a box to tick that says what
 * is deleted and when. Nothing is sent until that box is ticked and the red button pressed.
 */
export function CancelSubscription({ reasons, labels }: { reasons: readonly string[]; labels: CancelLabels }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [sure, setSure] = useState(false)
  const [state, action, pending] = useActionState<BillingResult | null, FormData>(cancelSubscription, null)
  const problem = state && !state.ok ? (labels.problems[state.problem] ?? labels.problems.failed) : null

  if (!open) {
    return (
      <div className="mt-[14px]">
        <Button type="button" size="md" tone="secondary" onClick={() => setOpen(true)}>
          {labels.open}
        </Button>
      </div>
    )
  }
  return (
    <form action={action} className="mt-[14px] flex flex-col gap-[14px] rounded-panel border border-line bg-bg px-[18px] py-[16px]">
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-[8px] p-0 text-[13px] font-bold">{labels.reasonLegend}</legend>
        <span className="flex flex-wrap gap-[7px]">
          {reasons.map((r) => (
            <label key={r} className="inline-flex flex-none">
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="peer absolute h-px w-px overflow-hidden opacity-0"
              />
              <span
                className={`inline-flex cursor-pointer items-center rounded-pill border-[1.5px] px-[13px] py-[8px] text-[13px] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                  reason === r ? 'border-ink bg-sbg font-bold' : 'border-line bg-transparent font-medium'
                }`}
              >
                {labels.reasons[r]}
              </span>
            </label>
          ))}
        </span>
      </fieldset>
      <Link href="/rapport" className="self-start text-[13px] font-semibold">
        {labels.download}
      </Link>
      <label htmlFor={`${id}-sure`} className="flex cursor-pointer items-start gap-[10px] text-[13px] leading-[1.55]">
        <input
          id={`${id}-sure`}
          type="checkbox"
          name="confirm"
          checked={sure}
          onChange={(e) => setSure(e.target.checked)}
          className="mt-[3px] h-[16px] w-[16px] flex-none cursor-pointer accent-ink"
        />
        <span>{labels.confirm}</span>
      </label>
      <span className="flex flex-wrap items-center gap-[10px]">
        <button
          type="submit"
          disabled={!sure || pending}
          className="inline-flex h-[44px] cursor-pointer items-center rounded-tile border border-danger bg-danger px-[18px] text-[14px] font-bold text-bg disabled:cursor-default disabled:opacity-50"
        >
          {pending ? labels.pending : labels.submit}
        </button>
        <Button type="button" size="md" tone="ghost" onClick={() => (setOpen(false), setSure(false))}>
          {labels.back}
        </Button>
      </span>
      {problem ? (
        <span role="alert" className="text-[12.5px] font-semibold text-danger">
          {problem}
        </span>
      ) : null}
    </form>
  )
}

export function WithdrawCancellation({ labels }: { labels: { submit: string; pending: string; problems: Record<string, string> } }) {
  const [state, action, pending] = useActionState<BillingResult | null>(withdrawCancellation, null)
  const problem = state && !state.ok ? (labels.problems[state.problem] ?? labels.problems.failed) : null
  return (
    <form action={action} className="mt-[14px] flex flex-wrap items-center gap-[12px]">
      <Button type="submit" size="md" tone="primary" disabled={pending}>
        {pending ? labels.pending : labels.submit}
      </Button>
      {problem ? (
        <span role="alert" className="basis-full text-[12.5px] font-semibold text-danger">
          {problem}
        </span>
      ) : null}
    </form>
  )
}

/**
 * Moving to the free plan (0202, D-226): a quiet button that opens the step — the day the free plan
 * begins and what it holds, said in the lead — and a box to tick before anything is sent. Unlike
 * cancelling, nothing is deleted, so the button is not the danger colour.
 */
export function DowngradeToFree({
  labels,
}: {
  labels: { open: string; confirm: string; submit: string; pending: string; back: string; problems: Record<string, string> }
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [sure, setSure] = useState(false)
  const [state, action, pending] = useActionState<BillingResult | null, FormData>(downgradeToFree, null)
  const problem = state && !state.ok ? (labels.problems[state.problem] ?? labels.problems.failed) : null

  if (!open) {
    return (
      <div className="mt-[14px]">
        <Button type="button" size="md" tone="secondary" onClick={() => setOpen(true)}>
          {labels.open}
        </Button>
      </div>
    )
  }
  return (
    <form action={action} className="mt-[14px] flex flex-col gap-[14px] rounded-panel border border-line bg-bg px-[18px] py-[16px]">
      <label htmlFor={`${id}-sure`} className="flex cursor-pointer items-start gap-[10px] text-[13px] leading-[1.55]">
        <input
          id={`${id}-sure`}
          type="checkbox"
          name="confirm"
          checked={sure}
          onChange={(e) => setSure(e.target.checked)}
          className="mt-[3px] h-[16px] w-[16px] flex-none cursor-pointer accent-ink"
        />
        <span>{labels.confirm}</span>
      </label>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="md" tone="primary" disabled={!sure || pending}>
          {pending ? labels.pending : labels.submit}
        </Button>
        <Button type="button" size="md" tone="ghost" onClick={() => (setOpen(false), setSure(false))}>
          {labels.back}
        </Button>
      </span>
      {problem ? (
        <span role="alert" className="text-[12.5px] font-semibold text-danger">
          {problem}
        </span>
      ) : null}
    </form>
  )
}

export function WithdrawDowngrade({ labels }: { labels: { submit: string; pending: string; problems: Record<string, string> } }) {
  const [state, action, pending] = useActionState<BillingResult | null>(withdrawDowngrade, null)
  const problem = state && !state.ok ? (labels.problems[state.problem] ?? labels.problems.failed) : null
  return (
    <form action={action} className="mt-[14px] flex flex-wrap items-center gap-[12px]">
      <Button type="submit" size="md" tone="primary" disabled={pending}>
        {pending ? labels.pending : labels.submit}
      </Button>
      {problem ? (
        <span role="alert" className="basis-full text-[12.5px] font-semibold text-danger">
          {problem}
        </span>
      ) : null}
    </form>
  )
}
