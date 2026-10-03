'use client'

import { useState, useTransition } from 'react'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { Button } from '@/components/ui/Button'
import type { DeletePreview, TrashEntity } from '@/lib/admin/crm'
import { labelText } from '@/lib/admin/crmLabel'
import { decideDelete, deleteRecords, previewDelete, purgeRecords, restoreRecords } from '@/lib/admin/crmTrashActions'

/**
 * Delete, restore and delete permanently (0195, D-210; CRM-12). A delete is shown before it is done: the
 * records, their names, and what goes with them now and at the purge. The database decides the rest.
 */
type Common = { reason: string; reasonHint: string; saving: string; done: string }

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none h-[38px]'
const label = 'mb-[5px] block text-[12px] font-semibold'
const fill = (s: string, v: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))
const kindOf = (m: CrmMessages, entity: TrashEntity, count: number) => (count === 1 ? m.trash.one[entity] : m.trash.many[entity])

function Reason({ value, set, required, common }: { value: string; set: (v: string) => void; required: boolean; common: Common }) {
  return (
    <label className="block">
      <span className={label}>{common.reason}</span>
      <input name="reason" value={value} onChange={(e) => set(e.target.value)} required={required} minLength={required ? 5 : undefined} maxLength={500} className={field} />
      {required ? <span className="mt-[4px] block text-[12px] text-mut">{common.reasonHint}</span> : null}
    </label>
  )
}

/**
 * Delete one record (ids) or the companies ticked in a table (boxes with form={bulkForm}): first the
 * preview, then the delete — into the restore list, or as a request while second-admin approval is on.
 */
export function DeleteRecords({
  entity,
  ids,
  bulkForm,
  m,
  common,
  reasonRequired = false,
  compact = false,
}: {
  entity: TrashEntity
  ids?: string[]
  bulkForm?: string
  m: CrmMessages
  common: Common
  reasonRequired?: boolean
  compact?: boolean
}) {
  const d = m.delete
  const [preview, setPreview] = useState<DeletePreview | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [checking, start] = useTransition()
  const [state, action, pending] = useKeptAction(deleteRecords, () => {
    setPreview(null)
    setReason('')
  })

  const open = () => {
    const picked = ids ?? Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${bulkForm}"]:checked`)).map((x) => x.value)
    setProblem(null)
    if (!picked.length) return setProblem('none_ticked')
    start(async () => {
      const r = await previewDelete(entity, picked)
      if (!r.ok) return setProblem(r.problem)
      setChosen(picked)
      setPreview(r.preview)
    })
  }

  if (!preview) {
    return (
      <span className="inline-flex flex-wrap items-center gap-[8px]">
        <Button type="button" size={compact ? 'tiny' : 'sm'} tone="secondary" onClick={open} disabled={checking}>
          {checking ? d.checking : bulkForm ? d.bulk : d[entity]}
        </Button>
        {problem ? (
          <span role="alert" className="text-[12.5px] font-semibold text-danger">
            {problem === 'none_ticked' ? d.noneTicked : (m.problem[problem as keyof typeof m.problem] ?? m.problem.failed)}
          </span>
        ) : state?.ok ? (
          <span role="status" className="text-[12.5px] font-semibold text-link">
            {state.message === 'pending' ? d.pending : d.done}
          </span>
        ) : null}
      </span>
    )
  }

  const p = preview
  const shown = p.names.slice(0, 10)
  return (
    <form action={action} className="flex w-full flex-col gap-[8px] rounded-ctl border border-line bg-bg px-[12px] py-[10px] text-[13px]">
      <input type="hidden" name="entity" value={entity} />
      {chosen.map((x) => (
        <input key={x} type="hidden" name="ids" value={x} />
      ))}
      <p className="m-0 font-semibold">{fill(d.count, { count: p.count, kind: kindOf(m, entity, p.count) })}</p>
      <ul className="m-0 pl-[18px] text-[12.5px]">
        {shown.map((n, i) => (
          <li key={i}>{labelText(n)}</li>
        ))}
        {p.count > shown.length ? <li>{fill(d.more, { n: p.count - shown.length })}</li> : null}
      </ul>
      {entity !== 'activity' ? <p className="m-0 text-[12.5px] leading-[1.5] text-mut">{fill(d.effects[entity], p.effects)}</p> : null}
      {p.missing > 0 ? <p className="m-0 text-[12.5px] text-mut">{fill(d.missing, { n: p.missing })}</p> : null}
      <p className="m-0 text-[12.5px] text-mut">{p.window === null ? d.windowUnlimited : fill(d.window, { days: p.window })}</p>
      {p.approval ? <p className="m-0 text-[12.5px] font-semibold">{d.approval}</p> : null}
      <Reason value={reason} set={setReason} required={reasonRequired} common={common} />
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" tone="solid" disabled={pending || p.count === 0}>
          {pending ? common.saving : p.approval ? d.ask : d.confirm}
        </Button>
        <Button type="button" size="sm" tone="ghost" onClick={() => setPreview(null)} disabled={pending}>
          {d.cancel}
        </Button>
        {state && !state.ok ? <Outcome state={state} problems={m.problem} done={common.done} /> : null}
      </span>
    </form>
  )
}

/** Restore a record; a super-admin may also delete it permanently, which asks once more */
export function RestoreActions({
  entity,
  id,
  restorable,
  mayWrite,
  mayPurge,
  m,
  common,
  reasonRequired = false,
}: {
  entity: TrashEntity
  id: string
  restorable: boolean
  mayWrite: boolean
  mayPurge: boolean
  m: CrmMessages
  common: Common
  reasonRequired?: boolean
}) {
  const x = m.trash
  const [reason, setReason] = useState('')
  const [sure, setSure] = useState(false)
  const [restored, restore, restoring] = useKeptAction(restoreRecords, () => setReason(''))
  const [purged, purge, purging] = useKeptAction(purgeRecords, () => setReason(''))
  return (
    <div className="flex flex-col gap-[6px]">
      {reasonRequired && (mayWrite || mayPurge) ? <Reason value={reason} set={setReason} required common={common} /> : null}
      <span className="flex flex-wrap items-center gap-[8px]">
        {mayWrite ? (
          restorable ? (
            <form action={restore}>
              <input type="hidden" name="entity" value={entity} />
              <input type="hidden" name="ids" value={id} />
              <input type="hidden" name="reason" value={reason} />
              <Button type="submit" size="tiny" tone="quiet" disabled={restoring}>
                {restoring ? x.restoring : x.restore}
              </Button>
            </form>
          ) : (
            <span className="text-[12px] text-mut">{x.waits}</span>
          )
        ) : null}
        {mayPurge ? (
          sure ? (
            <form action={purge}>
              <input type="hidden" name="entity" value={entity} />
              <input type="hidden" name="ids" value={id} />
              <input type="hidden" name="reason" value={reason} />
              <Button type="submit" size="tiny" tone="solid" disabled={purging}>
                {purging ? common.saving : x.purgeSure}
              </Button>
            </form>
          ) : (
            <Button type="button" size="tiny" tone="ghost" onClick={() => setSure(true)}>
              {x.purge}
            </Button>
          )
        ) : null}
      </span>
      <Outcome state={restored} problems={m.problem} done={x.restored} />
      <Outcome state={purged} problems={m.problem} done={x.purged} />
    </div>
  )
}

/** A second admin decides a bulk delete; its requester only sees that it waits */
export function DecideRequest({
  id,
  mine,
  m,
  common,
  reasonRequired = false,
}: {
  id: string
  mine: boolean
  m: CrmMessages
  common: Common
  reasonRequired?: boolean
}) {
  const r = m.trash.requests
  const [reason, setReason] = useState('')
  const [state, action, pending] = useKeptAction(decideDelete, () => setReason(''))
  if (mine) return <p className="m-0 text-[12.5px] text-mut">{r.mine}</p>
  return (
    <form action={action} className="flex flex-col gap-[6px]">
      <input type="hidden" name="id" value={id} />
      {reasonRequired ? <Reason value={reason} set={setReason} required common={common} /> : null}
      <span className="flex flex-wrap items-center gap-[8px]">
        <Button type="submit" name="approve" value="yes" size="tiny" tone="solid" disabled={pending}>
          {r.approve}
        </Button>
        <Button type="submit" name="approve" value="no" size="tiny" tone="ghost" disabled={pending}>
          {r.reject}
        </Button>
        <Outcome state={state} problems={m.problem} done={r.done} />
      </span>
    </form>
  )
}
