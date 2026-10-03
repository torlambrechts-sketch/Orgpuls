'use client'

import { useState } from 'react'
import type { FieldDef } from '@/lib/admin/crmFieldTypes'
import { ImportForm, NewCampaignForm, type CrmMessages } from './CrmForms'
import { Modal } from './Modal'
import { BTN } from './ui'

/** «Import contacts» (X-095): the CRM's import (D-101) in the design's dialog; fields name the custom fields its remarks cite (0197) */
export function ImportDialog({
  m,
  fields = [],
  label,
  title,
  sub,
  close,
}: {
  m: CrmMessages
  fields?: FieldDef[]
  label: string
  title: string
  sub: string
  close: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={BTN.primary} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} sub={sub} closeLabel={close}>
        <div className="mt-[22px]">
          <ImportForm m={m} fields={fields} />
        </div>
      </Modal>
    </>
  )
}

/** «New campaign» (X-095): the campaign form (D-101) in the design's dialog; it opens the studio when made */
export function NewCampaignDialog({
  m,
  common,
  label,
  sub,
  close,
}: {
  m: CrmMessages
  common: { reason: string; reasonHint: string; saving: string; done: string }
  label: string
  sub: string
  close: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={BTN.primary} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={label} sub={sub} closeLabel={close}>
        <div className="mt-[22px]">
          <NewCampaignForm m={m} common={common} />
        </div>
      </Modal>
    </>
  )
}
