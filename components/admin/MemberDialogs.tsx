'use client'

import { useState, type ComponentProps } from 'react'
import { SetAdminForm } from './ActionForms'
import { Modal } from './Modal'
import { BTN } from './ui'

/**
 * Admin › Users & roles (X-095): the design's «Invite» and a member's «Edit», both the grant of a
 * role (admin_set_admin, D-90) in the design's dialog. The person's account must exist; the role
 * works only after their second factor.
 */
type FormProps = ComponentProps<typeof SetAdminForm>

export function MemberDialog({
  label,
  primary = false,
  title,
  sub,
  close,
  roles,
  labels,
  initial,
}: {
  label: string
  primary?: boolean
  title: string
  sub: string
  close: string
  roles: FormProps['roles']
  labels: FormProps['labels']
  initial?: FormProps['initial']
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={primary ? BTN.primary : BTN.row} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} sub={sub} closeLabel={close}>
        <div className="mt-[22px]">
          <SetAdminForm roles={roles} labels={labels} initial={initial} />
        </div>
      </Modal>
    </>
  )
}
