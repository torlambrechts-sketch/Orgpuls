'use client'

import { useActionState, useId, useState } from 'react'
import { extendTrial, saveBilling, type BillingResult } from '@/app/(app)/oppsett/billing-actions'
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

type PlanOption = { key: string; name: string; who: string; price: string; unit: string; fits: boolean; suggested: boolean }

export function BillingForm({
  plans,
  initial,
  orgNumber,
  confirmed,
  labels,
}: {
  plans: PlanOption[]
  initial: { plan: string | null; invoiceEmail: string; invoiceRef: string; ehf: boolean }
  orgNumber: string | null
  confirmed: boolean
  labels: {
    planLegend: string
    suggested: string
    tooMany: string
    invoiceEmail: string
    invoiceEmailHint: string
    invoiceRef: string
    invoiceRefHint: string
    ehf: string
    ehfNoOrgnr: string
    terms: string
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
  const [state, action, pending] = useActionState<BillingResult | null, FormData>(saveBilling, null)
  const problem = state && !state.ok ? (labels.problems[state.problem] ?? labels.problems.failed) : null
  const done = state?.ok ? (state.confirmed ? labels.confirmedNow : labels.saved) : null

  return (
    <form action={action} className="flex flex-col gap-[16px]" aria-describedby={problem ? `${id}-problem` : undefined}>
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
                  <span className="font-display text-[22px] font-semibold leading-none">{p.price}</span>
                  <span className="text-[12px] text-mut">{p.unit}</span>
                </span>
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
            defaultValue={initial.invoiceEmail}
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
            defaultValue={initial.invoiceRef}
            aria-describedby={`${id}-ref`}
            className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
          />
          <span id={`${id}-ref`} className="mt-[5px] block text-[11.5px] text-mut">
            {labels.invoiceRefHint}
          </span>
        </label>
      </div>

      <label className={`flex items-start gap-[10px] text-[13px] leading-[1.55] ${orgNumber ? '' : 'opacity-60'}`}>
        <input
          name="ehf"
          type="checkbox"
          defaultChecked={initial.ehf}
          disabled={!orgNumber}
          className="mt-[3px] h-[16px] w-[16px] flex-none accent-ink"
        />
        <span>{orgNumber ? labels.ehf : labels.ehfNoOrgnr}</span>
      </label>

      <p className="m-0 text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{labels.terms}</p>

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
