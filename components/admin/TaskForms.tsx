'use client'

import { useActionState, useState } from 'react'
import type { AdminResult } from '@/lib/admin/actions'
import { logActivity, toggleTask } from '@/lib/admin/crmActions'
import { Modal } from './Modal'
import { BTN, FIELD, FIELD_LABEL } from './ui'

/** «Mark done» on a task row (X-095): the company page's toggle (0056) */
export function TaskDone({ id, company, label }: { id: string; company: string; label: string }) {
  const [, action, pending] = useActionState<AdminResult | null, FormData>(toggleTask, null)
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="company" value={company} />
      <button type="submit" className={BTN.row} disabled={pending}>
        {label}
      </button>
    </form>
  )
}

/** «New task»: a task on a company, with what to do and by when */
export function NewTask({
  companies,
  labels,
}: {
  companies: { id: string; name: string }[]
  labels: { open: string; title: string; sub: string; company: string; body: string; due: string; create: string; cancel: string; close: string; saving: string; failed: string }
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(async (prev, fd) => {
    const r = await logActivity(prev, fd)
    if (r.ok) setOpen(false)
    return r
  }, null)
  return (
    <>
      <button type="button" className={BTN.primary} onClick={() => setOpen(true)}>
        {labels.open}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={labels.title} sub={labels.sub} closeLabel={labels.close}>
        <form action={action}>
          <input type="hidden" name="kind" value="task" />
          <div className="mt-[22px] flex flex-col gap-[16px]">
            <label className="block">
              <span className={FIELD_LABEL}>{labels.company}</span>
              <select name="company" required defaultValue="" className={FIELD}>
                <option value="" disabled>
                  —
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.body}</span>
              <input name="body" required maxLength={4000} className={FIELD} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.due}</span>
              <input name="due" type="date" className={FIELD} />
            </label>
            {state && !state.ok ? (
              <p role="alert" className="m-0 text-[12.5px] font-semibold text-danger">
                {labels.failed}
              </p>
            ) : null}
          </div>
          <div className="mt-[24px] flex justify-end gap-[10px]">
            <button type="button" className={BTN.secondary} onClick={() => setOpen(false)}>
              {labels.cancel}
            </button>
            <button type="submit" className={BTN.dark} disabled={pending}>
              {pending ? labels.saving : labels.create}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
