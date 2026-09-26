'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { addSpend, deleteSpend } from '@/lib/admin/actions'
import { Outcome, useKeptAction } from './ActionForms'

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const label = 'mb-[5px] block text-[12px] font-semibold'

type Labels = {
  month: string
  channel: string
  campaign: string
  amount: string
  note: string
  submit: string
  saving: string
  done: string
  channels: Record<string, string>
  problems: Record<string, string>
}

/** One month's spend on one channel (0062, D-107). The month is kept as its first day. */
export function SpendForm({ labels, channels, thisMonth }: { labels: Labels; channels: readonly string[]; thisMonth: string }) {
  const [month, setMonth] = useState(thisMonth)
  const [channel, setChannel] = useState(channels[0] ?? 'paid')
  const [campaign, setCampaign] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [state, action, pending] = useKeptAction(addSpend, () => (setCampaign(''), setAmount(''), setNote('')))
  return (
    <form action={action} className="flex flex-col gap-[10px]">
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <label className="block">
          <span className={label}>{labels.month}</span>
          <input name="month" type="month" required value={month} onChange={(e) => setMonth(e.target.value)} className={`${field} h-[38px]`} />
        </label>
        <label className="block">
          <span className={label}>{labels.channel}</span>
          <select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={`${field} h-[38px]`}>
            {channels.map((c) => (
              <option key={c} value={c}>
                {labels.channels[c] ?? c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>{labels.amount}</span>
          <input
            name="amount"
            type="number"
            inputMode="numeric"
            min={0}
            max={100000000}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${field} h-[38px]`}
          />
        </label>
        <label className="block">
          <span className={label}>{labels.campaign}</span>
          <input name="campaign" maxLength={80} value={campaign} onChange={(e) => setCampaign(e.target.value)} className={`${field} h-[38px]`} />
        </label>
      </div>
      <label className="block">
        <span className={label}>{labels.note}</span>
        <input name="note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className={`${field} h-[38px]`} />
      </label>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}

export function DeleteSpend({ id, label: text, problems }: { id: string; label: string; problems: Record<string, string> }) {
  const [state, action, pending] = useKeptAction(deleteSpend, () => {})
  return (
    <form action={action} className="inline-flex items-center gap-[8px]">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-semibold text-danger underline">
        {text}
      </button>
      {state && !state.ok ? <Outcome state={state} problems={problems} done="" /> : null}
    </form>
  )
}
