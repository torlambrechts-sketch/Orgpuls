'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useActionState, useState, type ReactNode } from 'react'
import type { AdminResult } from '@/lib/admin/actions'
import type { DotTone } from '@/lib/admin/dots'
import { decideGrowth, setGrowthExperiment, setGrowthItem } from '@/lib/admin/growthActions'
import { BoardCard, StatusChip } from './growth'
import { Modal } from './Modal'
import { BTN, FIELD, FIELD_LABEL } from './ui'

/**
 * Sentral › Growth G2's dialogs (D-183): what the design opens with `openModal` from a board card, a
 * rule, an experiment and «Decide». The modal is the admin's (components/admin/Modal.tsx, the design's
 * `modal`); its body keeps the design's order — fields, then the sections as tinted boxes — and its
 * footer the design's Cancel and dark primary. Every text arrives from the page, worded by next-intl.
 */

export type Section = { h: string; t: string }
export type Option = { value: string; label: string }

/** The design's `modal.sections`: tinted boxes with a small-caps heading */
function Sections({ items }: { items: Section[] }) {
  return (
    <div className="flex flex-col gap-[10px]">
      {items.map((s) => (
        <div key={s.h} className="rounded-cta border border-line bg-bg px-[14px] py-[12px]">
          <div className="mb-[4px] text-[11px] uppercase tracking-[0.09em] text-mut">{s.h}</div>
          <div className="text-[13px] leading-[1.55] [text-wrap:pretty]">{s.t}</div>
        </div>
      ))}
    </div>
  )
}

/** The design's `modal.note`: a dashed box of muted text */
function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-cta border border-dashed border-line bg-bg px-[14px] py-[12px] text-[12.5px] leading-[1.5] text-mut [overflow-wrap:anywhere]">{children}</div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={FIELD_LABEL}>{label}</span>
      {children}
    </label>
  )
}

function Failed({ state, text }: { state: AdminResult | null; text: string }) {
  return state && !state.ok ? (
    <p role="alert" className="m-0 text-[12.5px] font-semibold text-danger">
      {text}
    </p>
  ) : null
}

const FOOT = 'mt-[24px] flex flex-wrap justify-end gap-[10px]'

type Common = { cancel: string; close: string; save: string; saving: string; failed: string }

// ---------------------------------------------------------------- the board
export function BoardItem({
  card,
  dialog,
  form,
  labels,
}: {
  card: { rank: string; name: string; why: string; status: { tone: DotTone; label: string }; meta: string; owner: string | null }
  dialog: { title: string; sub: string; sections: Section[]; note: string | null; openHref: string | null }
  /** the item's key and what an admin may set; null for a role that may not write */
  form: { key: string; status: string; owner: string; statuses: Option[]; owners: Option[] } | null
  labels: Common & { status: string; owner: string; nobody: string; open: string }
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(async (prev, fd) => {
    const r = await setGrowthItem(prev, fd)
    if (r.ok) setOpen(false)
    return r
  }, null)
  return (
    <>
      <BoardCard {...card} onOpen={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title={dialog.title} sub={dialog.sub} closeLabel={labels.close}>
        <form action={action}>
          <div className="mt-[22px] flex flex-col gap-[16px]">
            {form ? (
              <>
                <input type="hidden" name="key" value={form.key} />
                <Field label={labels.status}>
                  <select name="status" defaultValue={form.status} className={FIELD}>
                    {form.statuses.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={labels.owner}>
                  <select name="owner" defaultValue={form.owner} className={FIELD}>
                    <option value="">{labels.nobody}</option>
                    {form.owners.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : null}
            <Sections items={dialog.sections} />
            {dialog.note ? <Note>{dialog.note}</Note> : null}
            <Failed state={state} text={labels.failed} />
          </div>
          <div className={FOOT}>
            <button type="button" className={`${BTN.secondary} leading-[normal]`} onClick={() => setOpen(false)}>
              {labels.cancel}
            </button>
            {dialog.openHref ? (
              <Link href={dialog.openHref as Route} className={`${BTN.secondary} leading-[normal]`}>
                {labels.open}
              </Link>
            ) : null}
            {form ? (
              <button type="submit" className={`${BTN.dark} leading-[normal]`} disabled={pending}>
                {pending ? labels.saving : labels.save}
              </button>
            ) : (
              <button type="button" className={`${BTN.dark} leading-[normal]`} onClick={() => setOpen(false)}>
                {labels.close}
              </button>
            )}
          </div>
        </form>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------- a rule
/** The rule's id and name, the design's button in the first column, and the card it opens (read only) */
export function RuleName({
  id,
  name,
  dialog,
  labels,
}: {
  id: string
  name: string
  dialog: { title: string; sub: string; sections: Section[] }
  labels: { cancel: string; close: string }
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="w-[150px] flex-none cursor-pointer border-0 bg-transparent p-0 text-left leading-[normal] text-ink"
      >
        <span className="text-[11px] font-bold text-mut">{id}</span>
        <span className="block text-[13.5px] font-semibold">{name}</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={dialog.title} sub={dialog.sub} closeLabel={labels.close}>
        <div className="mt-[22px] flex flex-col gap-[16px]">
          <Sections items={dialog.sections} />
        </div>
        <div className={FOOT}>
          <button type="button" className={`${BTN.secondary} leading-[normal]`} onClick={() => setOpen(false)}>
            {labels.cancel}
          </button>
          <button type="button" className={`${BTN.dark} leading-[normal]`} onClick={() => setOpen(false)}>
            {labels.close}
          </button>
        </div>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------- an experiment
/** An experiment's row, which opens its card: the design's clickable row, as a button */
export function ExperimentRow({
  row,
  dialog,
  form,
  labels,
}: {
  row: { id: string; hypothesis: string; metric: string; pct: number; ice: number; iceText: string; status: { tone: DotTone; label: string } }
  dialog: { title: string; sub: string }
  form: { key: string; status: string; statuses: Option[] } | null
  labels: Common & { status: string }
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(async (prev, fd) => {
    const r = await setGrowthExperiment(prev, fd)
    if (r.ok) setOpen(false)
    return r
  }, null)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full cursor-pointer items-center gap-[14px] border-0 border-b border-solid border-line bg-transparent px-[20px] py-[12px] text-left text-[13px] leading-[1.5] text-ink hover:bg-bg"
      >
        <span className="block min-w-0 flex-[2.4]">
          <span className="text-[11px] font-bold text-mut">{row.id}</span>
          <span className="block text-[13.5px] font-semibold [text-wrap:pretty]">{row.hypothesis}</span>
        </span>
        <span className="flex-1 text-[12.5px] text-mut">{row.metric}</span>
        <span className="flex flex-[1.2] items-center gap-[8px]">
          <span className="block h-[7px] flex-1 overflow-hidden rounded-pill bg-ink/[.08]">
            <span className="block h-full rounded-pill bg-ac" style={{ width: `${row.pct}%` }} />
          </span>
          <b className="min-w-[28px] text-right text-[12.5px]">{row.ice}</b>
          <span className="whitespace-nowrap text-[11px] text-mut">{row.iceText}</span>
        </span>
        <span className="w-[96px] flex-none">
          <StatusChip tone={row.status.tone}>{row.status.label}</StatusChip>
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={dialog.title} sub={dialog.sub} closeLabel={labels.close}>
        <form action={action}>
          <div className="mt-[22px] flex flex-col gap-[16px]">
            {form ? (
              <>
                <input type="hidden" name="key" value={form.key} />
                <Field label={labels.status}>
                  <select name="status" defaultValue={form.status} className={FIELD}>
                    {form.statuses.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : null}
            <Failed state={state} text={labels.failed} />
          </div>
          <div className={FOOT}>
            <button type="button" className={`${BTN.secondary} leading-[normal]`} onClick={() => setOpen(false)}>
              {labels.cancel}
            </button>
            {form ? (
              <button type="submit" className={`${BTN.dark} leading-[normal]`} disabled={pending}>
                {pending ? labels.saving : labels.save}
              </button>
            ) : (
              <button type="button" className={`${BTN.dark} leading-[normal]`} onClick={() => setOpen(false)}>
                {labels.close}
              </button>
            )}
          </div>
        </form>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------- «Decide»
export function DecideButton({
  n,
  dialog,
  placeholders,
  labels,
}: {
  n: number
  dialog: { title: string; sub: string }
  placeholders: { value: string; by: string }
  labels: Common & { open: string; value: string; by: string; record: string }
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(async (prev, fd) => {
    const r = await decideGrowth(prev, fd)
    if (r.ok) setOpen(false)
    return r
  }, null)
  return (
    <>
      <button type="button" className={`${BTN.row} flex-none leading-[normal]`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {labels.open}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={dialog.title} sub={dialog.sub} closeLabel={labels.close}>
        <form action={action}>
          <input type="hidden" name="n" value={n} />
          <div className="mt-[22px] flex flex-col gap-[16px]">
            <Field label={labels.value}>
              <input name="value" required maxLength={300} placeholder={placeholders.value} className={FIELD} />
            </Field>
            <Field label={labels.by}>
              <input name="by" required maxLength={120} placeholder={placeholders.by} className={FIELD} />
            </Field>
            <Failed state={state} text={labels.failed} />
          </div>
          <div className={FOOT}>
            <button type="button" className={`${BTN.secondary} leading-[normal]`} onClick={() => setOpen(false)}>
              {labels.cancel}
            </button>
            <button type="submit" className={`${BTN.dark} leading-[normal]`} disabled={pending}>
              {pending ? labels.saving : labels.record}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
