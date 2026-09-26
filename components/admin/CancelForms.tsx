'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cancelOrg, deleteOrgNow, withdrawCancellation } from '@/lib/admin/actions'
import { Outcome, useKeptAction } from './ActionForms'

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const label = 'mb-[5px] block text-[12px] font-semibold'

type Common = { reason: string; reasonHint: string; saving: string; done: string; problems: Record<string, string> }

/**
 * Registering a cancellation (0064, D-108): the agreement's last day and why. From the day
 * after it the organisation is read-only; everything is deleted 30 days later.
 */
export function CancelForm({ org, defaultEnds, labels }: { org: string; defaultEnds: string; labels: Common & { lead: string; ends: string; submit: string } }) {
  const [ends, setEnds] = useState(defaultEnds)
  const [reason, setReason] = useState('')
  const [state, action, pending] = useKeptAction(cancelOrg, () => setReason(''))
  return (
    <form action={action} className="flex flex-col gap-[10px]">
      <p className="m-0 text-[12.5px] leading-[1.5] text-mut">{labels.lead}</p>
      <input type="hidden" name="org" value={org} />
      <div className="grid gap-[10px] [grid-template-columns:150px_minmax(0,1fr)]">
        <label className="block">
          <span className={label}>{labels.ends}</span>
          <input name="ends" type="date" required value={ends} onChange={(e) => setEnds(e.target.value)} className={`${field} h-[38px]`} />
        </label>
        <label className="block">
          <span className={label}>{labels.reason}</span>
          <input name="reason" required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} h-[38px]`} />
        </label>
      </div>
      <span className="text-[11.5px] text-mut">{labels.reasonHint}</span>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}

export function WithdrawForm({ org, labels }: { org: string; labels: Common & { submit: string } }) {
  const [reason, setReason] = useState('')
  const [state, action, pending] = useKeptAction(withdrawCancellation, () => setReason(''))
  return (
    <form action={action} className="flex flex-col gap-[8px]">
      <input type="hidden" name="org" value={org} />
      <label className="block">
        <span className={label}>{labels.reason}</span>
        <input name="reason" required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} h-[38px]`} />
      </label>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" tone="secondary" disabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}

/** Deleting now, for an erasure request: the organisation number typed, as a deliberate act. */
export function DeleteNowForm({ org, labels }: { org: string; labels: Common & { lead: string; confirm: string; submit: string } }) {
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')
  const [state, action, pending] = useKeptAction(deleteOrgNow, () => {})
  return (
    <form action={action} className="flex flex-col gap-[10px] rounded-panel border border-danger px-[14px] py-[12px]">
      <p className="m-0 text-[12.5px] leading-[1.5] text-dangerdeep">{labels.lead}</p>
      <input type="hidden" name="org" value={org} />
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <label className="block">
          <span className={label}>{labels.confirm}</span>
          <input name="confirm" required autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${field} h-[38px]`} />
        </label>
        <label className="block">
          <span className={label}>{labels.reason}</span>
          <input name="reason" required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} h-[38px]`} />
        </label>
      </div>
      <span className="flex flex-wrap items-center gap-[10px]">
        <button
          type="submit"
          disabled={pending || confirm.trim().length === 0}
          className="inline-flex h-[34px] cursor-pointer items-center rounded-ctl border border-danger bg-danger px-[14px] text-[12.5px] font-bold text-bg disabled:cursor-default disabled:opacity-50"
        >
          {pending ? labels.saving : labels.submit}
        </button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}
