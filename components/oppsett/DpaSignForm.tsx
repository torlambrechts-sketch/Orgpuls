'use client'

import { useActionState, useId } from 'react'
import { signDpa, type DpaResult } from '@/app/(app)/oppsett/dpa-actions'
import { Button } from '@/components/ui/Button'

/**
 * The daglig leder signs the data processing agreement in their own name and title (D-87).
 * The name is filled in from their profile and can be corrected; the title starts as
 * "Daglig leder". Nothing is sent until the box saying they have read it and may sign for
 * the organisation is ticked.
 */
export function DpaSignForm({
  defaultName,
  labels,
}: {
  defaultName: string
  labels: {
    name: string
    title: string
    titleDefault: string
    confirm: string
    submit: string
    signing: string
    problems: Record<string, string>
  }
}) {
  const id = useId()
  const [state, action, pending] = useActionState<DpaResult | null, FormData>(signDpa, null)
  const problem = state && !state.ok ? (labels.problems[state.problem] ?? labels.problems.failed) : null

  return (
    <form action={action} className="mt-[14px] flex flex-col gap-[12px]" aria-describedby={problem ? `${id}-problem` : undefined}>
      <div className="grid gap-[12px] sm:grid-cols-2">
        <label className="block">
          <span className="mb-[6px] block text-[12.5px] font-semibold">{labels.name}</span>
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            defaultValue={defaultName}
            className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-[6px] block text-[12.5px] font-semibold">{labels.title}</span>
          <input
            name="title"
            required
            minLength={2}
            maxLength={120}
            autoComplete="organization-title"
            defaultValue={labels.titleDefault}
            className="box-border h-[40px] w-full rounded-ctl border border-line bg-bg px-[13px] text-[13.5px] text-ink outline-none"
          />
        </label>
      </div>
      <label className="flex items-start gap-[10px] text-[13px] leading-[1.55]">
        <input name="confirm" type="checkbox" required className="mt-[3px] h-[16px] w-[16px] flex-none accent-ink" />
        <span>{labels.confirm}</span>
      </label>
      <div className="flex flex-wrap items-center gap-[12px]">
        <Button type="submit" size="md" disabled={pending}>
          {pending ? labels.signing : labels.submit}
        </Button>
        {problem ? (
          <span id={`${id}-problem`} role="alert" className="text-[12.5px] font-semibold text-danger">
            {problem}
          </span>
        ) : null}
      </div>
    </form>
  )
}
