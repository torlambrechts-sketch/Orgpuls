'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { modulePilot, moduleSetValidation, moduleSwitch, moduleSync, type AdminResult } from '@/lib/admin/actions'
import { Outcome, useKeptAction } from './ActionForms'

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const label = 'mb-[5px] block text-[12px] font-semibold'

type Labels = { saving: string; done: string; problems: Record<string, string> }

/**
 * «Make live» (X-096): the module file as deployed becomes what the survey asks. The answer says
 * what happened — the version it became, the planned rounds moved and the translations carried.
 */
export function ModuleSyncButton({
  moduleKey,
  labels,
}: {
  moduleKey: string
  labels: Labels & { submit: string; result: (r: { result: string; version: string; rounds: number; translations: number }) => string }
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(moduleSync, null)
  let said: string | null = null
  if (state?.ok && state.message) {
    try {
      said = labels.result(JSON.parse(state.message))
    } catch {
      said = labels.done
    }
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-[10px]">
      <input type="hidden" name="key" value={moduleKey} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? labels.saving : labels.submit}
      </Button>
      {said ? (
        <span role="status" className="text-[12.5px] font-semibold text-link">
          {said}
        </span>
      ) : (
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      )}
    </form>
  )
}

/** Offer a module to every organisation (publish its draft), or stop offering it (retire the live version) */
export function ModuleSwitchButton({
  moduleKey,
  version,
  on,
  labels,
}: {
  moduleKey: string
  version: string
  on: boolean
  labels: Labels & { submit: string }
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(moduleSwitch, null)
  return (
    <form action={action} className="flex flex-wrap items-center gap-[10px]">
      <input type="hidden" name="key" value={moduleKey} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="on" value={on ? 'on' : 'off'} />
      <Button type="submit" size="sm" tone={on ? undefined : 'secondary'} disabled={pending}>
        {pending ? labels.saving : labels.submit}
      </Button>
      <Outcome state={state} problems={labels.problems} done={labels.done} />
    </form>
  )
}

/**
 * «Validert» with the report's link, or back to «Foreløpig» (0092). Only the status moves; the
 * module's content stays as it is. The audit log keeps who and when.
 */
export function ModuleValidationForm({
  moduleKey,
  version,
  to,
  labels,
}: {
  moduleKey: string
  version: string
  to: 'validated' | 'provisional'
  labels: Labels & { report: string; submit: string }
}) {
  const [report, setReport] = useState('')
  const [state, action, pending] = useKeptAction(moduleSetValidation, () => setReport(''))
  return (
    <form action={action} className="flex flex-wrap items-end gap-[10px]">
      <input type="hidden" name="key" value={moduleKey} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="status" value={to} />
      {to === 'validated' ? (
        <label className="block min-w-[240px] flex-1">
          <span className={label}>{labels.report}</span>
          <input name="report" type="url" required pattern="https://.+" maxLength={500} value={report} onChange={(e) => setReport(e.target.value)} className={`${field} h-[38px]`} />
        </label>
      ) : null}
      <Button type="submit" size="sm" tone={to === 'provisional' ? 'secondary' : undefined} disabled={pending}>
        {pending ? labels.saving : labels.submit}
      </Button>
      <Outcome state={state} problems={labels.problems} done={labels.done} />
    </form>
  )
}

/** Let one organisation try a module before everyone (0068), by the organisation's id */
export function ModulePilotForm({
  moduleKey,
  version,
  labels,
}: {
  moduleKey: string
  version: string
  labels: Labels & { org: string; add: string; remove: string }
}) {
  const [org, setOrg] = useState('')
  const [state, action, pending] = useKeptAction(modulePilot, () => setOrg(''))
  return (
    <form action={action} className="flex flex-wrap items-end gap-[10px]">
      <input type="hidden" name="key" value={moduleKey} />
      <input type="hidden" name="version" value={version} />
      <label className="block min-w-[240px] flex-1">
        <span className={label}>{labels.org}</span>
        <input name="org" required value={org} onChange={(e) => setOrg(e.target.value)} className={`${field} h-[38px] font-mono text-[12.5px]`} />
      </label>
      <Button type="submit" name="on" value="on" size="sm" disabled={pending}>
        {labels.add}
      </Button>
      <Button type="submit" name="on" value="off" size="sm" tone="secondary" disabled={pending}>
        {labels.remove}
      </Button>
      <Outcome state={state} problems={labels.problems} done={labels.done} />
    </form>
  )
}
