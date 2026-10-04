'use client'

import { useActionState } from 'react'
import { retryDeliveries } from '@/lib/admin/crmJobActions'
import type { AdminResult } from '@/lib/admin/actions'
import { Outcome } from './ActionForms'
import { BTN } from './ui'

/**
 * A subscriber's deliveries given up on or set aside, tried again from now (0199). It stays in the row when nothing
 * waits, so the outcome is still shown after the page has refreshed and the deliveries have moved to «Retrying».
 */
export function CrmJobRetry({
  subscriber,
  waiting,
  labels,
}: {
  subscriber: string
  waiting: number
  labels: { retry: string; retrying: string; done: string; problems: Record<string, string> }
}) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(retryDeliveries, null)
  if (!waiting && !state && !pending) return <>—</>
  return (
    <form action={action} className="flex flex-wrap items-center gap-[10px]">
      <input type="hidden" name="subscriber" value={subscriber} />
      {waiting || pending ? (
        <button type="submit" className={BTN.row} disabled={pending}>
          {pending ? labels.retrying : labels.retry}
        </button>
      ) : null}
      <Outcome state={state} problems={labels.problems} done={labels.done} />
    </form>
  )
}
