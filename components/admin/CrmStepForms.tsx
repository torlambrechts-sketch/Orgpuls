'use client'

import { startTransition, useState } from 'react'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { Button } from '@/components/ui/Button'
import type { AdminResult } from '@/lib/admin/actions'
import { saveStep, stepAction } from '@/lib/admin/crmActions'

/**
 * Call and LinkedIn steps in a sequence (0137): a step that sends nothing and gives the company's
 * owner a task for each contact who comes due; the chain waits on the task. «Add a call or
 * LinkedIn step» makes a draft after the step you are on and opens it; on the step's own page the
 * same form changes the draft, and it is turned on or off there.
 */
type Common = { saving: string; done: string }

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const input = `${field} h-[38px]`
const label = 'mb-[5px] block text-[12px] font-semibold'
/** as lib/admin/crm's TASK_STEP_KINDS, which is server-only */
const KINDS = ['call', 'linkedin'] as const
type Kind = (typeof KINDS)[number]

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

/** A new step after `follows` (its name, for the step's default name), or the draft `step` changed */
export function StepForm({
  follows,
  step,
  m,
  common,
}: {
  follows?: { id: string; name: string }
  step?: { id: string; name: string; subject: string; step_kind: Kind; follow_days: number | null }
  m: CrmMessages
  common: Common
}) {
  const q = m.sequence
  const [kind, setKind] = useState<Kind>(step?.step_kind ?? 'call')
  const [title, setTitle] = useState(step?.subject ?? '')
  const [days, setDays] = useState(String(step?.follow_days ?? 3))
  const [name, setName] = useState(step?.name ?? '')
  const [state, action, pending] = useKeptAction(saveStep, () => undefined)
  const shownName = step || name ? name : fill(q.defaultName, { campaign: follows?.name ?? '', kind: q.kind[kind] }).slice(0, 120)
  return (
    <form action={action} className="flex flex-col gap-[10px]">
      <input type="hidden" name="id" value={step?.id ?? ''} />
      <input type="hidden" name="follows_id" value={follows?.id ?? ''} />
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
        <label className="block">
          <span className={label}>{q.stepKind}</span>
          <select name="step_kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={input}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {q.kind[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>{q.stepAfter}</span>
          <input name="follow_days" type="number" min={1} max={60} required value={days} onChange={(e) => setDays(e.target.value)} className={input} />
        </label>
      </div>
      <label className="block">
        <span className={label}>{q.stepTitle}</span>
        <input name="title" required maxLength={150} placeholder={q.titleHint} value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
      </label>
      <label className="block">
        <span className={label}>{m.step.name}</span>
        <input name="name" required maxLength={120} value={shownName} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <span className="flex flex-wrap items-center gap-[8px]">
        <Button type="submit" size="sm" tone={step ? 'solid' : 'secondary'} disabled={pending}>
          {pending ? common.saving : step ? m.step.save : q.add}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
      {step ? null : <span className="text-[12px] leading-[1.5] text-mut">{q.addStepHint}</span>}
    </form>
  )
}

/** Turn a call or LinkedIn step on (it arms now), or off while it waits, or stop it once it runs */
export function StepActions({ id, status, m, common }: { id: string; status: string; m: CrmMessages; common: Common }) {
  const [state, action, pending] = useKeptAction(stepAction, () => undefined)
  const submit = (kind: 'arm' | 'cancel') => () => {
    const fd = new FormData()
    fd.set('id', id)
    fd.set('action', kind)
    startTransition(() => action(fd))
  }
  return (
    <div className="flex flex-col gap-[8px]">
      <span className="flex flex-wrap items-center gap-[8px]">
        {status === 'draft' ? (
          <Button size="sm" tone="solid" disabled={pending} onClick={submit('arm')}>
            {m.step.turnOn}
          </Button>
        ) : null}
        {status === 'scheduled' || status === 'sending' ? (
          <Button size="sm" tone="solid" disabled={pending} onClick={submit('cancel')}>
            {status === 'scheduled' ? m.step.turnOff : m.step.stop}
          </Button>
        ) : null}
        <Outcome state={state as AdminResult | null} problems={m.problem} done={common.done} />
      </span>
      {status === 'draft' ? <span className="text-[12px] leading-[1.5] text-mut">{m.step.turnOnHint}</span> : null}
    </div>
  )
}
