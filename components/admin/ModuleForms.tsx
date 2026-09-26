'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { modulePilot, moduleSetStatus } from '@/lib/admin/actions'
import { Outcome, useKeptAction } from './ActionForms'

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const label = 'mb-[5px] block text-[12px] font-semibold'

type Labels = { reason: string; saving: string; done: string; problems: Record<string, string> }

/** Publish a draft, or retire a published version (0067): a reason, audited. It cannot be undone. */
export function ModuleStatusForm({
  moduleKey,
  version,
  status,
  labels,
}: {
  moduleKey: string
  version: string
  status: 'published' | 'retired'
  labels: Labels & { submit: string; warning: string }
}) {
  const [reason, setReason] = useState('')
  const [state, action, pending] = useKeptAction(moduleSetStatus, () => setReason(''))
  return (
    <form action={action} className="flex flex-col gap-[8px]">
      <input type="hidden" name="key" value={moduleKey} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="status" value={status} />
      <p className="m-0 text-[12px] leading-[1.5] text-mut">{labels.warning}</p>
      <label className="block">
        <span className={label}>{labels.reason}</span>
        <input name="reason" required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} h-[38px]`} />
      </label>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" tone={status === 'retired' ? 'secondary' : undefined} disabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}

/** Add or remove a pilot organisation for a draft (0068), by its id. */
export function ModulePilotForm({
  moduleKey,
  version,
  labels,
}: {
  moduleKey: string
  version: string
  labels: Labels & { org: string; add: string; remove: string }
}) {
  const [reason, setReason] = useState('')
  const [org, setOrg] = useState('')
  const [state, action, pending] = useKeptAction(modulePilot, () => setReason(''))
  return (
    <form action={action} className="flex flex-col gap-[8px]">
      <input type="hidden" name="key" value={moduleKey} />
      <input type="hidden" name="version" value={version} />
      <div className="grid gap-[10px] [grid-template-columns:minmax(0,1fr)] sm:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block">
          <span className={label}>{labels.org}</span>
          <input name="org" required value={org} onChange={(e) => setOrg(e.target.value)} className={`${field} h-[38px] font-mono text-[12.5px]`} />
        </label>
        <label className="block">
          <span className={label}>{labels.reason}</span>
          <input name="reason" required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} h-[38px]`} />
        </label>
      </div>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" name="on" value="on" size="sm" disabled={pending}>
          {labels.add}
        </Button>
        <Button type="submit" name="on" value="off" size="sm" tone="secondary" disabled={pending}>
          {labels.remove}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}
