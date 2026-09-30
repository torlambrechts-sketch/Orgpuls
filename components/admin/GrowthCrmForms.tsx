'use client'

import { useActionState, useState } from 'react'
import type { AdminResult } from '@/lib/admin/actions'
import { addSuppression, recordPhoneNotice, runPollNow, savePartner, setDryRun } from '@/lib/admin/growthCrmActions'
import { Modal } from './Modal'
import { BTN, FIELD, FIELD_LABEL } from './ui'

/**
 * The dialogs of the CRM's revision-3 pages (phase G3, D-184): Add suppression and Record phone
 * notice on Consent, Edit triggers and Run poll now on Brønnøysund triggers, Add partner and a
 * partner's Open on Partners. Each is the design's modal (components/admin/Modal) around a form
 * whose server action the database checks and logs; the labels come from next-intl.
 */
type Common = { cancel: string; close: string; saving: string; problems: Record<string, string> }

function useDialog(action: (prev: AdminResult | null, fd: FormData) => Promise<AdminResult>) {
  const [open, setOpen] = useState(false)
  const [state, run, pending] = useActionState<AdminResult | null, FormData>(async (prev, fd) => {
    const r = await action(prev, fd)
    if (r.ok) setOpen(false)
    return r
  }, null)
  return { open, setOpen, state, run, pending }
}

function Problem({ state, problems }: { state: AdminResult | null; problems: Record<string, string> }) {
  if (!state || state.ok) return null
  return (
    <p role="alert" className="m-0 text-[12.5px] font-semibold text-danger">
      {problems[state.problem] ?? problems.failed}
    </p>
  )
}

function Footer({ common, submit, pending, onCancel }: { common: Common; submit: string; pending: boolean; onCancel: () => void }) {
  return (
    <div className="mt-[24px] flex justify-end gap-[10px]">
      <button type="button" className={BTN.secondary} onClick={onCancel}>
        {common.cancel}
      </button>
      <button type="submit" className={BTN.dark} disabled={pending}>
        {pending ? common.saving : submit}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- Consent
export function AddSuppressionDialog({
  labels,
  reasons,
  common,
}: {
  labels: { open: string; title: string; sub: string; email: string; reason: string; submit: string }
  reasons: { key: string; label: string }[]
  common: Common
}) {
  const d = useDialog(addSuppression)
  return (
    <>
      <button type="button" className={BTN.primary} onClick={() => d.setOpen(true)}>
        {labels.open}
      </button>
      <Modal open={d.open} onClose={() => d.setOpen(false)} title={labels.title} sub={labels.sub} closeLabel={common.close}>
        <form action={d.run}>
          <div className="mt-[22px] flex flex-col gap-[16px]">
            <label className="block">
              <span className={FIELD_LABEL}>{labels.email}</span>
              <input name="email" type="email" required maxLength={254} autoComplete="off" className={FIELD} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.reason}</span>
              <select name="reason" required defaultValue="manual" className={FIELD}>
                {reasons.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <Problem state={d.state} problems={common.problems} />
          </div>
          <Footer common={common} submit={labels.submit} pending={d.pending} onCancel={() => d.setOpen(false)} />
        </form>
      </Modal>
    </>
  )
}

export function PhoneNoticeDialog({
  labels,
  common,
}: {
  labels: { open: string; title: string; sub: string; org: string; outcome: string; notice: string; objected: string; submit: string }
  common: Common
}) {
  const d = useDialog(recordPhoneNotice)
  return (
    <>
      <button type="button" className={BTN.secondary} onClick={() => d.setOpen(true)}>
        {labels.open}
      </button>
      <Modal open={d.open} onClose={() => d.setOpen(false)} title={labels.title} sub={labels.sub} closeLabel={common.close}>
        <form action={d.run}>
          <div className="mt-[22px] flex flex-col gap-[16px]">
            <label className="block">
              <span className={FIELD_LABEL}>{labels.org}</span>
              <input name="org" required inputMode="numeric" pattern="[0-9 ]{9,11}" maxLength={11} autoComplete="off" className={FIELD} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.outcome}</span>
              <select name="outcome" required defaultValue="notice" className={FIELD}>
                <option value="notice">{labels.notice}</option>
                <option value="objected">{labels.objected}</option>
              </select>
            </label>
            <Problem state={d.state} problems={common.problems} />
          </div>
          <Footer common={common} submit={labels.submit} pending={d.pending} onCancel={() => d.setOpen(false)} />
        </form>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------- Brønnøysund triggers
/** «Edit triggers»: the thresholds as the law draws them (read-only) and the one switch, dry run */
export function EditTriggersDialog({
  dryRun,
  labels,
  common,
}: {
  dryRun: boolean
  labels: {
    open: string
    title: string
    sub: string
    rows: { label: string; value: string }[]
    mode: string
    dry: string
    live: string
    reason: string
    save: string
  }
  common: Common
}) {
  const d = useDialog(setDryRun)
  return (
    <>
      <button type="button" className={BTN.secondary} onClick={() => d.setOpen(true)}>
        {labels.open}
      </button>
      <Modal open={d.open} onClose={() => d.setOpen(false)} title={labels.title} sub={labels.sub} closeLabel={common.close}>
        <form action={d.run}>
          <dl className="m-0 mt-[18px] flex flex-col">
            {labels.rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-[12px] border-b border-line py-[10px] text-[13.5px]">
                <dt className="text-mut">{r.label}</dt>
                <dd className="m-0 text-right font-semibold">{r.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-[18px] flex flex-col gap-[16px]">
            <label className="block">
              <span className={FIELD_LABEL}>{labels.mode}</span>
              <select name="on" defaultValue={dryRun ? 'true' : 'false'} className={FIELD}>
                <option value="true">{labels.dry}</option>
                <option value="false">{labels.live}</option>
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.reason}</span>
              <input name="reason" maxLength={300} className={FIELD} />
            </label>
            <Problem state={d.state} problems={common.problems} />
          </div>
          <Footer common={common} submit={labels.save} pending={d.pending} onCancel={() => d.setOpen(false)} />
        </form>
      </Modal>
    </>
  )
}

/** «Run poll now»: asks for a poll (once in 15 minutes); what it finds arrives when it has run */
export function RunPollButton({ labels, problems }: { labels: { run: string; asking: string; asked: string }; problems: Record<string, string> }) {
  const [state, run, pending] = useActionState<AdminResult | null, FormData>(async (prev) => runPollNow(prev), null)
  // The answer is placed under the button pair (the nearest positioned ancestor, which the page marks
  // relative), out of the flow: in the flow it widened the form and grew the head, moving «Edit
  // triggers» away and the title down. One line, inside the head's 22 px margin; right-aligned from md,
  // left-aligned on a phone, where the pair wraps under the title.
  return (
    <form action={run}>
      <button type="submit" className={BTN.primary} disabled={pending}>
        {pending ? labels.asking : labels.run}
      </button>
      {state ? (
        <span
          role="status"
          className={`absolute left-0 top-full mt-[3px] w-max max-w-[min(420px,calc(100vw-32px))] text-[12px] leading-[1.5] md:left-auto md:right-0 md:text-right ${state.ok ? 'text-mut' : 'font-semibold text-danger'}`}
        >
          {state.ok ? labels.asked : (problems[state.problem] ?? problems.failed)}
        </span>
      ) : null}
    </form>
  )
}

// ---------------------------------------------------------------- Partners
type PartnerValues = {
  id: string
  name: string
  org_number: string | null
  kind: string
  contact: string | null
  code: string | null
  share_kind: string | null
  share_pct: number | null
  status: string
}

/** Add partner (no `partner`) or a partner's Open (its values, saved in place) */
export function PartnerDialog({
  partner,
  trigger,
  labels,
  options,
  common,
}: {
  partner?: PartnerValues
  trigger: { label: string; className: string; ariaLabel?: string }
  labels: {
    title: string
    sub: string
    name: string
    org: string
    kind: string
    contact: string
    code: string
    shareKind: string
    sharePct: string
    status: string
    none: string
    submit: string
  }
  options: { kinds: { key: string; label: string }[]; shares: { key: string; label: string }[]; statuses: { key: string; label: string }[] }
  common: Common
}) {
  const d = useDialog(savePartner)
  return (
    <>
      <button type="button" className={trigger.className} aria-label={trigger.ariaLabel} onClick={() => d.setOpen(true)}>
        {trigger.label}
      </button>
      <Modal open={d.open} onClose={() => d.setOpen(false)} title={labels.title} sub={labels.sub} closeLabel={common.close}>
        <form action={d.run}>
          {partner ? <input type="hidden" name="id" value={partner.id} /> : null}
          <div className="mt-[22px] grid gap-[16px] sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={FIELD_LABEL}>{labels.name}</span>
              <input name="name" required minLength={2} maxLength={200} defaultValue={partner?.name ?? ''} className={FIELD} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.org}</span>
              <input name="org" inputMode="numeric" pattern="[0-9 ]{9,11}" maxLength={11} defaultValue={partner?.org_number ?? ''} className={FIELD} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.kind}</span>
              <select name="kind" required defaultValue={partner?.kind ?? 'accounting'} className={FIELD}>
                {options.kinds.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.contact}</span>
              <input name="contact" maxLength={120} defaultValue={partner?.contact ?? ''} className={FIELD} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.code}</span>
              <input name="code" pattern="[A-Za-z0-9]{2,20}" maxLength={20} defaultValue={partner?.code ?? ''} className={`${FIELD} uppercase`} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.shareKind}</span>
              <select name="share_kind" defaultValue={partner?.share_kind ?? ''} className={FIELD}>
                <option value="">{labels.none}</option>
                {options.shares.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>{labels.sharePct}</span>
              <input name="share_pct" type="number" min={1} max={50} defaultValue={partner?.share_pct ?? ''} className={FIELD} />
            </label>
            <label className="block sm:col-span-2">
              <span className={FIELD_LABEL}>{labels.status}</span>
              <select name="status" required defaultValue={partner?.status ?? 'in_talks'} className={FIELD}>
                {options.statuses.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <Problem state={d.state} problems={common.problems} />
            </div>
          </div>
          <Footer common={common} submit={labels.submit} pending={d.pending} onCancel={() => d.setOpen(false)} />
        </form>
      </Modal>
    </>
  )
}
