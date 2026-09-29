'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { setAccountOwner, type AdminResult } from '@/lib/admin/actions'
import { BTN, FIELD, FIELD_LABEL } from './ui'
import { Modal } from './Modal'

/**
 * «Edit customer» (X-095, D-164): what the admin may change about a customer is who on the team
 * owns it. The company's name, contact and plan are the customer's own, set in the product.
 */
export function EditCustomer({
  org,
  owner,
  candidates,
  labels,
}: {
  org: string
  owner: string | null
  candidates: { id: string; email: string; role: string }[]
  labels: { open: string; title: string; sub: string; owner: string; nobody: string; save: string; cancel: string; close: string; saving: string; failed: string }
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(async (prev, formData) => {
    const r = await setAccountOwner(prev, formData)
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
          <input type="hidden" name="org" value={org} />
          <div className="mt-[22px] flex flex-col gap-[16px]">
            <label className="block">
              <span className={FIELD_LABEL}>{labels.owner}</span>
              <select name="owner" defaultValue={owner ?? ''} className={FIELD}>
                <option value="">{labels.nobody}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.email}
                  </option>
                ))}
              </select>
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
              {pending ? labels.saving : labels.save}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}

/**
 * The list's toolbar (the design's search, segments and Filters): the filter panel opens under it.
 * It starts open when a filter is on, so a linked, filtered list shows why it is short.
 */
export function FilterToolbar({ left, label, count, panel }: { left: ReactNode; label: string; count: number; panel: ReactNode }) {
  const [open, setOpen] = useState(count > 0)
  return (
    <>
      <div className="flex flex-wrap items-center gap-[10px] px-[20px] py-[16px]">
        {left}
        <div className="flex-1" />
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={BTN.secondary}>
          {label}
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-ink px-[5px] text-[10.5px] font-bold text-sf">{count}</span>
        </button>
      </div>
      {open ? <div className="flex animate-ht-in flex-wrap items-end gap-[22px] px-[20px] pb-[16px]">{panel}</div> : null}
    </>
  )
}
