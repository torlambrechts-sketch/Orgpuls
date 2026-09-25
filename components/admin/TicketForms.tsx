'use client'

import { useActionState, useState } from 'react'
import { linkRound, replyTicket, updateTicket, type AdminResult } from '@/lib/admin/actions'
import { Button } from '@/components/ui/Button'

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const label = 'mb-[5px] block text-[12px] font-semibold'

function Outcome({ state, problems, done }: { state: AdminResult | null; problems: Record<string, string>; done: string }) {
  if (!state) return null
  return state.ok ? (
    <span role="status" className="text-[12.5px] font-semibold text-link">
      {done}
    </span>
  ) : (
    <span role="alert" className="text-[12.5px] font-semibold text-danger">
      {problems[state.problem] ?? problems.failed}
    </span>
  )
}

type Option = { value: string; label: string }

/**
 * A reply to the requester, sent by e-mail, or an internal note, which never leaves the admin
 * (D-92). A canned reply fills the text for editing; it is never sent as it stands.
 */
export function ReplyForm({
  id,
  canned,
  statuses,
  labels,
}: {
  id: string
  canned: { key: string; title: string; body: string }[]
  statuses: Option[]
  labels: {
    reply: string
    canned: string
    cannedNone: string
    internal: string
    internalHint: string
    thenStatus: string
    keepStatus: string
    send: string
    note: string
    saving: string
    done: string
    problems: Record<string, string>
  }
}) {
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [status, setStatus] = useState('')
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(async (prev, fd) => {
    const r = await replyTicket(prev, fd)
    if (r.ok) {
      setBody('')
      setStatus('')
    }
    return r
  }, null)

  return (
    <form action={action} className="flex flex-col gap-[10px]">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className={label}>{labels.canned}</span>
        <select
          value=""
          onChange={(e) => {
            const c = canned.find((x) => x.key === e.target.value)
            if (c) setBody(c.body)
          }}
          className={`${field} h-[36px]`}
        >
          <option value="">{labels.cannedNone}</option>
          {canned.map((c) => (
            <option key={c.key} value={c.key}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={label}>{labels.reply}</span>
        <textarea
          name="body"
          required
          maxLength={10000}
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${field} resize-y py-[9px] leading-[1.5] ${internal ? 'bg-sbg' : ''}`}
        />
      </label>
      <div className="flex flex-wrap items-end gap-[14px]">
        <label className="flex items-center gap-[8px] text-[13px]">
          <input
            name="internal"
            type="checkbox"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            className="h-[16px] w-[16px] accent-ink"
          />
          <span>
            <span className="font-semibold">{labels.internal}</span> <span className="text-mut">{labels.internalHint}</span>
          </span>
        </label>
        <label className="block min-w-[200px]">
          <span className={label}>{labels.thenStatus}</span>
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${field} h-[36px]`}>
            <option value="">{labels.keepStatus}</option>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? labels.saving : internal ? labels.note : labels.send}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}

type FieldSpec = { name: string; label: string; value: string; options: Option[] }

/**
 * The ticket's fields. Priority is not among them: the database derives it from impact and
 * blocking. Only fields changed here are sent, so a reply that moved the status meanwhile is
 * never undone by saving an unrelated field; the page keys this form on the ticket's current
 * values, so it starts again from them after every change.
 */
export function FieldsForm({
  id,
  fields,
  labels,
}: {
  id: string
  fields: FieldSpec[]
  labels: { save: string; saving: string; done: string; problems: Record<string, string> }
}) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.name, f.value])))
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(updateTicket, null)
  return (
    <form action={action} className="flex flex-col gap-[10px]">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className={label}>{f.label}</span>
            <select
              name={values[f.name] !== f.value ? f.name : undefined}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className={`${field} h-[36px]`}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" tone="secondary" disabled={pending}>
          {pending ? labels.saving : labels.save}
        </Button>
        <Outcome state={state} problems={labels.problems} done={labels.done} />
      </span>
    </form>
  )
}

/** Links or unlinks one of the organisation's survey rounds. */
export function RoundLink({ id, round, linked, label: text }: { id: string; round: string; linked: boolean; label: string }) {
  const [, action, pending] = useActionState<AdminResult | null, FormData>(linkRound, null)
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="round" value={round} />
      <input type="hidden" name="linked" value={linked ? 'no' : 'yes'} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={linked}
        className={`rounded-pill border px-[10px] py-[4px] text-[12px] font-semibold ${linked ? 'border-ink bg-ink text-bg' : 'border-line bg-sf text-ink'}`}
      >
        {text}
      </button>
    </form>
  )
}
