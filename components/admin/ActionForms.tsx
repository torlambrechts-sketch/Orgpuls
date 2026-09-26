'use client'

import { useActionState, useState } from 'react'
import { addNote, extendTrialAsAdmin, setAdmin, type AdminResult } from '@/lib/admin/actions'
import { Button } from '@/components/ui/Button'

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const label = 'mb-[5px] block text-[12px] font-semibold'

type Action = (prev: AdminResult | null, formData: FormData) => Promise<AdminResult>

/**
 * React resets a form after its action runs, which would put a refused submission's values
 * back to their defaults — a days field back to 15 — so the next press sends something the
 * admin did not type. The fields are controlled instead, and cleared only on success.
 */
export function useKeptAction(action: Action, clear: () => void) {
  return useActionState<AdminResult | null, FormData>(async (prev, formData) => {
    const result = await action(prev, formData)
    if (result.ok) clear()
    return result
  }, null)
}

export function Outcome({ state, problems, done }: { state: AdminResult | null; problems: Record<string, string>; done: string }) {
  if (!state) return null
  return state.ok ? (
    <span role="status" className="text-[12.5px] font-semibold text-link">
      {done}
    </span>
  ) : (
    <span role="alert" className="text-[12.5px] font-semibold text-danger">
      {problems[state.problem] ?? problems.failed}
    </span>
  )
}

type Common = { reason: string; reasonHint: string; saving: string; done: string; problems: Record<string, string> }

/** Every admin action carries a reason, which the audit log keeps with the admin's name. */
export function ExtendTrialForm({
  org,
  labels,
}: {
  org: string
  labels: Common & { lead: string; days: string; submit: string }
}) {
  const [days, setDays] = useState('15')
  const [reason, setReason] = useState('')
  const [state, action, pending] = useKeptAction(extendTrialAsAdmin, () => setReason(''))
  return (
    <form action={action} className="flex flex-col gap-[10px]">
      <p className="m-0 text-[12.5px] leading-[1.5] text-mut">{labels.lead}</p>
      <input type="hidden" name="org" value={org} />
      <div className="grid gap-[10px] [grid-template-columns:90px_minmax(0,1fr)]">
        <label className="block">
          <span className={label}>{labels.days}</span>
          <input
            name="days"
            type="number"
            min={1}
            max={60}
            required
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className={`${field} h-[38px]`}
          />
        </label>
        <label className="block">
          <span className={label}>{labels.reason}</span>
          <input
            name="reason"
            required
            minLength={5}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={`${field} h-[38px]`}
          />
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

export function NoteForm({
  org,
  labels,
}: {
  org: string
  labels: { placeholder: string; submit: string; saving: string; done: string; problems: Record<string, string> }
}) {
  const [body, setBody] = useState('')
  const [state, action, pending] = useKeptAction(addNote, () => setBody(''))
  return (
    <form action={action} className="flex flex-col gap-[8px]">
      <input type="hidden" name="org" value={org} />
      <textarea
        name="body"
        required
        maxLength={4000}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={labels.placeholder}
        aria-label={labels.placeholder}
        className={`${field} py-[9px] leading-[1.5]`}
      />
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" tone="secondary" disabled={pending}>
          {pending ? labels.saving : labels.submit}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}

export function SetAdminForm({
  roles,
  labels,
}: {
  roles: { value: string; label: string }[]
  labels: Common & { email: string; role: string; active: string; deactivate: string; submit: string }
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(roles[0]?.value ?? '')
  const [active, setActive] = useState('on')
  const [reason, setReason] = useState('')
  const [state, action, pending] = useKeptAction(setAdmin, () => {
    setEmail('')
    setReason('')
  })
  return (
    <form action={action} className="flex flex-col gap-[10px]">
      <div className="grid gap-[10px] sm:[grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block">
          <span className={label}>{labels.email}</span>
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${field} h-[38px]`}
          />
        </label>
        <label className="block">
          <span className={label}>{labels.role}</span>
          <select name="role" required value={role} onChange={(e) => setRole(e.target.value)} className={`${field} h-[38px]`}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>{labels.active}</span>
          <select name="active" value={active} onChange={(e) => setActive(e.target.value)} className={`${field} h-[38px]`}>
            <option value="on">{labels.active}</option>
            <option value="off">{labels.deactivate}</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className={label}>{labels.reason}</span>
        <input
          name="reason"
          required
          minLength={5}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={`${field} h-[38px]`}
        />
      </label>
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
