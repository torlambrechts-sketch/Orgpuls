'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import { setCrmRule } from '@/lib/admin/crmRulesActions'

/**
 * One CRM rule on Admin › Settings › CRM rules (0192, D-208): a choice from the rule's options, or a limit
 * that is a whole number or unlimited. The database checks the value, asks for a reason while typed
 * reasons are on, and logs the change.
 */
const field = 'box-border h-[36px] rounded-ctl border border-line bg-bg px-[10px] text-[13px] text-ink outline-none focus-visible:border-ink'

export type RuleFormLabels = {
  unlimited: string
  limitLabel: string
  reason: string
  reasonHint: string
  save: string
  saving: string
  done: string
  problem: Record<string, string>
  option: Record<string, string>
}

export function CrmRuleForm({
  ruleKey,
  name,
  kind,
  options,
  value,
  reasonRequired,
  labels,
}: {
  ruleKey: string
  name: string
  kind: 'choice' | 'limit'
  options: string[] | null
  value: string | number | null
  reasonRequired: boolean
  labels: RuleFormLabels
}) {
  const [choice, setChoice] = useState(typeof value === 'string' ? value : (options?.[0] ?? ''))
  const [unlimited, setUnlimited] = useState(value === null)
  const [limit, setLimit] = useState(typeof value === 'number' ? String(value) : '')
  const [reason, setReason] = useState('')
  const [state, action, pending] = useKeptAction(setCrmRule, () => setReason(''))
  return (
    <form action={action} className="flex flex-col items-start gap-[8px] md:items-end">
      <input type="hidden" name="key" value={ruleKey} />
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap items-center gap-[8px] md:justify-end">
        {kind === 'choice' ? (
          <select name="choice" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label={name} className={field}>
            {(options ?? []).map((o) => (
              <option key={o} value={o}>
                {labels.option[o] ?? o}
              </option>
            ))}
          </select>
        ) : (
          <>
            <label className="flex items-center gap-[6px] text-[13px] font-semibold">
              <input type="checkbox" name="unlimited" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
              {labels.unlimited}
            </label>
            <input
              name="limit"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required={!unlimited}
              disabled={unlimited}
              value={unlimited ? '' : limit}
              onChange={(e) => setLimit(e.target.value)}
              aria-label={`${labels.limitLabel}: ${name}`}
              className={`${field} w-[110px] disabled:opacity-50`}
            />
          </>
        )}
        {reasonRequired ? (
          <input
            name="reason"
            required
            minLength={5}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={labels.reason}
            aria-label={`${labels.reason}: ${name}`}
            title={labels.reasonHint}
            className={`${field} w-[200px]`}
          />
        ) : null}
        <Button type="submit" size="sm" tone="quiet" disabled={pending}>
          {pending ? labels.saving : labels.save}
        </Button>
      </div>
      <Outcome state={state} problems={labels.problem} done={labels.done} />
    </form>
  )
}
