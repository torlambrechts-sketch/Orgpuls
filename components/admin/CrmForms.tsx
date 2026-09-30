'use client'

import { startTransition, useState, useTransition } from 'react'
import type en from '@/messages/en.json'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import { Button } from '@/components/ui/Button'
import type { AdminResult } from '@/lib/admin/actions'
import { parseCsv as parseSheet } from '@/lib/csv/parse'
import type { Block, Campaign, Filter } from '@/lib/admin/crm'
import {
  campaignAction,
  contactAction,
  createCampaign,
  deleteSegment,
  importContacts,
  previewSegment,
  saveContact,
  saveCrmSettings,
  saveSegment,
  type ImportResult,
  type Preview,
} from '@/lib/admin/crmActions'

/**
 * The CRM's forms (D-101). Each takes the admin's `crm` messages whole; the admin is in
 * English only. Fields are controlled, as in ActionForms, so a refused submission keeps
 * what was typed.
 */
export type CrmMessages = (typeof en)['admin']['crm']
type Common = { reason: string; reasonHint: string; saving: string; done: string }

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const input = `${field} h-[38px]`
const label = 'mb-[5px] block text-[12px] font-semibold'
const fill = (s: string, v: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

function Text({
  name,
  labelText,
  value,
  set,
  type = 'text',
  required = false,
  max,
}: {
  name: string
  labelText: string
  value: string
  set: (v: string) => void
  type?: string
  required?: boolean
  max?: number
}) {
  return (
    <label className="block">
      <span className={label}>{labelText}</span>
      <input name={name} type={type} required={required} maxLength={max} value={value} onChange={(e) => set(e.target.value)} className={input} />
    </label>
  )
}

// ---------------------------------------------------------------- contacts
export function ContactForm({
  m,
  common,
  contact,
  companyId,
}: {
  m: CrmMessages
  common: Common
  contact?: { id: string; name: string | null; company: string | null; org_number: string | null; role: string | null; tags: string[]; lang: string }
  /** a person added on a company's page belongs to it, and the page stays */
  companyId?: string
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState(contact?.name ?? '')
  const [company, setCompany] = useState(contact?.company ?? '')
  const [orgNumber, setOrgNumber] = useState(contact?.org_number ?? '')
  const [role, setRole] = useState(contact?.role ?? '')
  const [tags, setTags] = useState(contact?.tags.join(', ') ?? '')
  const [lang, setLang] = useState(contact?.lang ?? 'no')
  const [consentSource, setConsentSource] = useState('')
  const [consentAt, setConsentAt] = useState('')
  const [event, setEvent] = useState(false)
  const [state, action, pending] = useKeptAction(saveContact, () => undefined)
  return (
    <form action={action} className="flex flex-col gap-[10px]">
      {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
      {companyId ? (
        <>
          <input type="hidden" name="company_id" value={companyId} />
          <input type="hidden" name="stay" value="1" />
        </>
      ) : null}
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {contact ? null : <Text name="email" labelText={m.add.email} value={email} set={setEmail} type="email" required max={254} />}
        <Text name="name" labelText={m.add.name} value={name} set={setName} max={120} />
        <Text name="company" labelText={m.add.company} value={company} set={setCompany} max={200} />
        <Text name="org_number" labelText={m.add.orgNumber} value={orgNumber} set={setOrgNumber} max={20} />
        <label className="block">
          <span className={label}>{m.add.role}</span>
          <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className={input}>
            <option value="">{m.add.none}</option>
            {Object.entries(m.roleName).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Text name="tags" labelText={m.add.tags} value={tags} set={setTags} max={400} />
        <label className="block">
          <span className={label}>{m.add.lang}</span>
          <select name="lang" value={lang} onChange={(e) => setLang(e.target.value)} className={input}>
            <option value="no">Norsk</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
      {contact ? null : (
        <div className="grid gap-[10px] [grid-template-columns:minmax(0,2fr)_minmax(0,1fr)]">
          <Text name="consent_source" labelText={m.add.consentSource} value={consentSource} set={setConsentSource} required max={200} />
          <Text name="consent_at" labelText={m.add.consentAt} value={consentAt} set={setConsentAt} type="date" />
          <label className="flex items-center gap-[8px] text-[13px]">
            <input type="checkbox" name="source" value="event" checked={event} onChange={(e) => setEvent(e.target.checked)} />
            {m.add.event}
          </label>
        </div>
      )}
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? common.saving : contact ? m.contact.save : m.add.submit}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
    </form>
  )
}

export function ContactActionForm({ m, common, id, kind }: { m: CrmMessages; common: Common; id: string; kind: 'unsubscribe' | 'erase' }) {
  const [reason, setReason] = useState('')
  const [state, action, pending] = useKeptAction(contactAction, () => setReason(''))
  return (
    <form action={action} className="flex flex-col gap-[8px]">
      <p className="m-0 text-[12.5px] leading-[1.5] text-mut">{kind === 'erase' ? m.contact.eraseLead : m.contact.unsubscribeLead}</p>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={kind} />
      <Text name="reason" labelText={common.reason} value={reason} set={setReason} required max={500} />
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" tone={kind === 'erase' ? 'solid' : 'quiet'} disabled={pending}>
          {pending ? common.saving : kind === 'erase' ? m.contact.erase : m.contact.unsubscribe}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
    </form>
  )
}

/** The shared CSV reader (lib/csv/parse.ts), with the first row as the header. */
function parseCsv(text: string): Record<string, string>[] {
  const [first, ...rest] = parseSheet(text)
  if (first === undefined) return []
  const head = first.map((h) => h.toLowerCase())
  return rest.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ''])) as Record<string, string>)
}

const IMPORT_COLUMNS = ['email', 'name', 'company', 'org_number', 'role', 'tags', 'consent_source', 'consent_at', 'lang']

export function ImportForm({ m }: { m: CrmMessages }) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col gap-[10px]">
      <p className="m-0 text-[12.5px] leading-[1.5] text-mut">{m.import.lead}</p>
      <label className="block">
        <span className={label}>{m.import.file}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="text-[13px]"
          onChange={async (e) => {
            setResult(null)
            const file = e.target.files?.[0]
            if (!file) return
            const parsed = parseCsv(await file.text())
            if (!parsed.length) return setRows(null), setNote(m.import.empty)
            if (!parsed[0] || !('email' in parsed[0])) return setRows(null), setNote(m.import.noHeader)
            setRows(parsed.map((r) => Object.fromEntries(IMPORT_COLUMNS.filter((c) => r[c]).map((c) => [c, r[c] ?? ''])) as Record<string, string>))
            setNote(fill(m.import.rows, { count: parsed.length }))
          }}
        />
      </label>
      {note ? <span className="text-[12.5px] text-mut">{note}</span> : null}
      <span>
        <Button
          size="sm"
          disabled={!rows || pending}
          onClick={() => start(async () => setResult(await importContacts(rows).catch(() => ({ ok: false as const, problem: 'failed' }))))}
        >
          {m.import.submit}
        </Button>
      </span>
      {result ? (
        result.ok ? (
          <div role="status" className="text-[13px]">
            <p className="m-0 font-semibold text-link">{fill(m.import.result, result)}</p>
            {result.rejected.length ? (
              <details className="mt-[8px]">
                <summary className="cursor-pointer font-semibold">
                  {m.import.rejected} ({result.rejected.length})
                </summary>
                <ul className="m-0 mt-[6px] pl-[18px] text-[12.5px]">
                  {result.rejected.slice(0, 200).map((r) => (
                    <li key={r.row}>
                      {m.import.row} {r.row + 1}: {m.problem[r.reason as keyof typeof m.problem] ?? r.reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : (
          <p role="alert" className="m-0 text-[12.5px] font-semibold text-danger">
            {m.problem[result.problem as keyof typeof m.problem] ?? m.problem.failed}
          </p>
        )
      ) : null}
    </div>
  )
}

export function SettingsForm({ m, common, on }: { m: CrmMessages; common: Common; on: boolean }) {
  const [checked, setChecked] = useState(on)
  const [reason, setReason] = useState('')
  const [state, action, pending] = useKeptAction(saveCrmSettings, () => setReason(''))
  return (
    <form action={action} className="flex flex-col gap-[8px]">
      <label className="flex items-center gap-[8px] text-[13px] font-semibold">
        <input type="checkbox" name="customer_exception" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        {m.settings.toggle}
      </label>
      <Text name="reason" labelText={common.reason} value={reason} set={setReason} required max={500} />
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" tone="quiet" disabled={pending}>
          {pending ? common.saving : m.settings.submit}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
    </form>
  )
}

// ---------------------------------------------------------------- segments
export function SegmentForm({
  m,
  common,
  segment,
  lists = [],
  stages = [],
}: {
  m: CrmMessages
  common: Common
  segment?: { id: string; name: string; filter: Filter }
  lists?: { key: string; name: string }[]
  /** the pipeline's stages, as data (0093) */
  stages?: { key: string; name: string }[]
}) {
  const f = segment?.filter ?? {}
  const [name, setName] = useState(segment?.name ?? '')
  const [tags, setTags] = useState((f.tags ?? []).join(', '))
  const [lang, setLang] = useState<string>(f.lang ?? '')
  const [min, setMin] = useState(f.min_employees?.toString() ?? '')
  const [max, setMax] = useState(f.max_employees?.toString() ?? '')
  const [nace, setNace] = useState(f.nace ?? '')
  const [days, setDays] = useState(f.no_survey_days?.toString() ?? '')
  const [picked, setPicked] = useState<Record<'types' | 'roles' | 'sources' | 'stages' | 'bases' | 'lists', string[]>>({
    types: f.types ?? [],
    roles: f.roles ?? [],
    sources: f.sources ?? [],
    stages: f.stages ?? [],
    bases: f.bases ?? [],
    lists: f.lists ?? [],
  })
  const [mailable, setMailable] = useState(f.mailable_only ?? false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, start] = useTransition()
  const [state, action, pending] = useKeptAction(saveSegment, () => undefined)
  const [delState, del, deleting] = useKeptAction(deleteSegment, () => undefined)

  const group = (key: keyof typeof picked, title: string, options: Record<string, string>) => (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={label}>{title}</legend>
      <div className="flex flex-wrap gap-x-[14px] gap-y-[6px]">
        {Object.entries(options)
          .filter(([k]) => k !== 'all')
          .map(([k, v]) => (
            <label key={k} className="flex items-center gap-[6px] text-[13px]">
              <input
                type="checkbox"
                name={key}
                value={k}
                checked={picked[key].includes(k)}
                onChange={(e) =>
                  setPicked({ ...picked, [key]: e.target.checked ? [...picked[key], k] : picked[key].filter((x) => x !== k) })
                }
              />
              {v}
            </label>
          ))}
      </div>
    </fieldset>
  )

  return (
    <form action={action} className="flex flex-col gap-[14px]">
      {segment ? <input type="hidden" name="id" value={segment.id} /> : null}
      <Text name="name" labelText={m.segments.name} value={name} set={setName} required max={120} />
      {group('types', m.segments.types, m.type)}
      {group('roles', m.segments.roles, m.roleName)}
      {group('sources', m.segments.sources, m.source)}
      {stages.length ? group('stages', m.segmentsX.stages, Object.fromEntries(stages.map((s) => [s.key, s.name]))) : null}
      {group('bases', m.segmentsX.bases, m.basis)}
      {lists.length ? group('lists', m.segmentsX.lists, Object.fromEntries(lists.map((l) => [l.key, l.name]))) : null}
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <Text name="tags" labelText={m.segments.tags} value={tags} set={setTags} max={400} />
        <label className="block">
          <span className={label}>{m.segments.lang}</span>
          <select name="lang" value={lang} onChange={(e) => setLang(e.target.value)} className={input}>
            <option value="">{m.segments.anyLang}</option>
            <option value="no">Norsk</option>
            <option value="en">English</option>
          </select>
        </label>
        <Text name="min_employees" labelText={`${m.segments.employees}: ${m.segments.min}`} value={min} set={setMin} type="number" />
        <Text name="max_employees" labelText={`${m.segments.employees}: ${m.segments.max}`} value={max} set={setMax} type="number" />
        <Text name="nace" labelText={m.segments.nace} value={nace} set={setNace} max={6} />
        <Text name="no_survey_days" labelText={m.segments.noSurvey} value={days} set={setDays} type="number" />
      </div>
      <label className="flex items-center gap-[8px] text-[13px] font-semibold">
        <input type="checkbox" name="mailable_only" checked={mailable} onChange={(e) => setMailable(e.target.checked)} />
        {m.segments.mailableOnly}
      </label>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? common.saving : m.segments.save}
        </Button>
        <Button
          size="sm"
          tone="secondary"
          disabled={previewing}
          onClick={(e) => {
            const form = (e.currentTarget as HTMLButtonElement).form
            if (form) start(async () => setPreview(await previewSegment(new FormData(form)).catch(() => ({ ok: false as const, problem: 'failed' }))))
          }}
        >
          {m.segments.preview}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
      {preview ? (
        preview.ok ? (
          <div role="status" className="rounded-panel border border-line bg-bg px-[14px] py-[10px] text-[13px]">
            <p className="m-0 font-semibold">{fill(m.segments.previewResult, preview)}</p>
            {preview.sample.length ? (
              <ul className="m-0 mt-[6px] pl-[18px] text-[12.5px] text-mut">
                {preview.sample.map((s) => (
                  <li key={s.email}>
                    {s.name ? `${s.name} · ` : ''}
                    {s.email} · {m.type[s.type as keyof typeof m.type] ?? s.type}
                    {s.mailable ? '' : ` · ${m.notMailable}`}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p role="alert" className="m-0 text-[12.5px] font-semibold text-danger">
            {m.problem[preview.problem as keyof typeof m.problem] ?? m.problem.failed}
          </p>
        )
      ) : null}
      {segment ? (
        <span className="flex flex-wrap items-center gap-[10px] border-t border-line pt-[12px]">
          <Button
            size="sm"
            tone="ghost"
            disabled={deleting}
            onClick={() => {
              const fd = new FormData()
              fd.set('id', segment.id)
              startTransition(() => del(fd))
            }}
          >
            {m.segments.delete}
          </Button>
          <Outcome state={delState} problems={m.problem} done={common.done} />
        </span>
      ) : null}
    </form>
  )
}

// ---------------------------------------------------------------- campaigns
export function NewCampaignForm({ m, common }: { m: CrmMessages; common: Common }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState('newsletter')
  const [lang, setLang] = useState('no')
  const [state, action, pending] = useKeptAction(createCampaign, () => undefined)
  return (
    <form action={action} className="flex flex-wrap items-end gap-[10px]">
      <div className="min-w-[220px] flex-1">
        <Text name="name" labelText={m.campaigns.name} value={name} set={setName} required max={120} />
      </div>
      <label className="block">
        <span className={label}>{m.campaigns.kind_}</span>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
          {Object.entries(m.campaigns.kind).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={label}>{m.campaigns.lang}</span>
        <select name="lang" value={lang} onChange={(e) => setLang(e.target.value)} className={input}>
          <option value="no">Norsk</option>
          <option value="en">English</option>
        </select>
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? common.saving : m.campaigns.create}
      </Button>
      <Outcome state={state} problems={m.problem} done={common.done} />
    </form>
  )
}

export function CampaignActions({ m, common, campaign }: { m: CrmMessages; common: Common; campaign: Campaign }) {
  const [at, setAt] = useState('')
  const [state, action, pending] = useKeptAction(campaignAction, () => undefined)
  const [last, setLast] = useState<string>('')
  const done = state?.ok && last === 'test' && state.message ? fill(m.campaign.testSent, { to: state.message }) : common.done
  const submit = (kind: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    setLast(kind)
    const form = e.currentTarget.form
    if (!form) return
    const fd = new FormData(form)
    fd.set('action', kind)
    startTransition(() => action(fd))
  }
  return (
    <form className="flex flex-col gap-[10px]" onSubmit={(e) => e.preventDefault()}>
      <input type="hidden" name="id" value={campaign.id} />
      <span className="flex flex-wrap items-center gap-[8px]">
        <Button size="sm" tone="quiet" disabled={pending} onClick={submit('test')}>
          {m.campaign.test}
        </Button>
      </span>
      {campaign.status === 'draft' ? (
        <div className="flex flex-wrap items-end gap-[8px]">
          <label className="block">
            <span className={label}>{m.campaign.at}</span>
            <input name="at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={input} />
          </label>
          <Button size="sm" disabled={pending || !at} onClick={submit('schedule')}>
            {m.campaign.schedule}
          </Button>
          <Button size="sm" tone="solid" disabled={pending} onClick={submit('now')}>
            {m.campaign.now}
          </Button>
        </div>
      ) : null}
      {campaign.status === 'scheduled' || campaign.status === 'sending' ? (
        <span>
          <Button size="sm" tone="solid" disabled={pending} onClick={submit('cancel')}>
            {campaign.status === 'scheduled' ? m.campaign.unschedule : m.campaign.cancel}
          </Button>
        </span>
      ) : null}
      <span className="text-[11.5px] text-mut">{m.campaign.language}</span>
      <Outcome state={state as AdminResult | null} problems={m.problem} done={done} />
    </form>
  )
}
