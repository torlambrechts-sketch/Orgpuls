'use client'

import { startTransition, useState, useTransition } from 'react'
import type en from '@/messages/en.json'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import { Button } from '@/components/ui/Button'
import type { AdminResult } from '@/lib/admin/actions'
import type { Block, Campaign, Filter } from '@/lib/admin/crm'
import {
  campaignAction,
  contactAction,
  createCampaign,
  deleteSegment,
  importContacts,
  previewSegment,
  saveCampaign,
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

/** A small CSV reader: quoted fields, commas or semicolons, a header row. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim())
  const first = lines[0]
  if (first === undefined) return []
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const split = (line: string) => {
    const out: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') (cur += '"'), i++
        else if (c === '"') quoted = false
        else cur += c
      } else if (c === '"') quoted = true
      else if (c === sep) out.push(cur), (cur = '')
      else cur += c
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }
  const head = split(first).map((h) => h.toLowerCase())
  return lines.slice(1).map((l) => {
    const cells = split(l)
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ''])) as Record<string, string>
  })
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
}: {
  m: CrmMessages
  common: Common
  segment?: { id: string; name: string; filter: Filter }
  lists?: { key: string; name: string }[]
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
      {group('stages', m.segmentsX.stages, m.stage)}
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

const EMPTY: Record<Block['type'], Block> = {
  heading: { type: 'heading', text: '' },
  text: { type: 'text', text: '' },
  button: { type: 'button', text: '', url: 'https://www.orgpuls.com/' },
  article: { type: 'article', title: '', text: '', url: 'https://www.orgpuls.com/', label: '' },
  bullets: { type: 'bullets', text: '' },
  image: { type: 'image', url: 'https://', alt: '', href: '' },
  divider: { type: 'divider' },
  quote: { type: 'quote', text: '', title: '' },
  event: { type: 'event', title: '', text: '', url: 'https://www.orgpuls.com/', label: '' },
  ps: { type: 'ps', text: '' },
}

/** Only the keys a block kind uses are sent, and empty optional ones are dropped. */
function clean(b: Block): Block {
  const keep: Record<Block['type'], (keyof Block)[]> = {
    heading: ['text'],
    text: ['text'],
    button: ['text', 'url'],
    article: ['title', 'text', 'url', 'label'],
    bullets: ['text'],
    image: ['url', 'alt', 'href'],
    divider: [],
    quote: ['text', 'title'],
    event: ['title', 'text', 'url', 'label'],
    ps: ['text'],
  }
  const out: Block = { type: b.type }
  for (const k of keep[b.type]) {
    const v = b[k]
    if (typeof v === 'string' && v.trim() !== '' && !(k === 'url' && b.type === 'event' && v === 'https://www.orgpuls.com/' && !b.label))
      (out as Record<string, string>)[k] = v
  }
  return out
}

export function CampaignEditor({
  m,
  common,
  campaign,
  segments,
  lists,
}: {
  m: CrmMessages
  common: Common
  campaign: Campaign
  segments: { id: string; name: string; mailable: number }[]
  lists: { id: string; name: string; subscribed: number }[]
}) {
  const x = m.campaignX
  const [name, setName] = useState(campaign.name)
  const [kind, setKind] = useState<string>(campaign.kind)
  const [lang, setLang] = useState<string>(campaign.lang)
  const [subject, setSubject] = useState(campaign.subject)
  const [subjectB, setSubjectB] = useState(campaign.subject_b)
  const [preheader, setPreheader] = useState(campaign.preheader)
  const [segment, setSegment] = useState(campaign.segment_id ?? '')
  const [list, setList] = useState(campaign.list_id ?? '')
  const [utm, setUtm] = useState(campaign.utm_campaign)
  const [style, setStyle] = useState<string>(campaign.style)
  const [signature, setSignature] = useState(campaign.signature)
  const [abPercent, setAbPercent] = useState(String(campaign.ab_percent))
  const [abMetric, setAbMetric] = useState<string>(campaign.ab_metric)
  const [abWait, setAbWait] = useState(String(campaign.ab_wait_hours))
  const [publish, setPublish] = useState(campaign.publish_web)
  const [slug, setSlug] = useState(campaign.slug ?? '')
  const [webDescription, setWebDescription] = useState(campaign.web_description)
  const [blocks, setBlocks] = useState<Block[]>(campaign.blocks.length ? campaign.blocks : [EMPTY.text])
  const [adding, setAdding] = useState<Block['type']>('text')
  const [state, action, pending] = useKeptAction(saveCampaign, () => undefined)

  const setBlock = (i: number, b: Partial<Block>) => setBlocks(blocks.map((v, j) => (j === i ? { ...v, ...b } : v)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    const a = blocks[i]
    const b = blocks[j]
    if (!a || !b) return
    const next = [...blocks]
    next[i] = b
    next[j] = a
    setBlocks(next)
  }
  const blockName = (t: Block['type']) => (t === 'heading' || t === 'text' || t === 'button' ? m.campaign[t] : x.block[t])
  const meter = (n: number, ok: boolean) => `mt-[4px] block text-[11.5px] ${ok ? 'text-mut' : 'text-cautiondeep'}`
  const small = (i: number, key: keyof Block, text: string, max: number, type = 'text') => (
    <input
      type={type}
      value={(blocks[i]?.[key] as string | undefined) ?? ''}
      maxLength={max}
      placeholder={text}
      aria-label={text}
      onChange={(e) => setBlock(i, { [key]: e.target.value })}
      className={`${input} mt-[6px]`}
    />
  )
  const area = (i: number, text: string, rows: number, max: number) => (
    <textarea
      rows={rows}
      value={blocks[i]?.text ?? ''}
      maxLength={max}
      placeholder={text}
      aria-label={text}
      onChange={(e) => setBlock(i, { text: e.target.value })}
      className={`${field} mt-[6px] py-[9px] leading-[1.5]`}
    />
  )

  return (
    <form action={action} className="flex flex-col gap-[12px]">
      <input type="hidden" name="id" value={campaign.id} />
      <input type="hidden" name="blocks" value={JSON.stringify(blocks.map(clean))} />
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <Text name="name" labelText={m.campaigns.name} value={name} set={setName} required max={120} />
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
        <label className="block">
          <span className={label}>{x.style}</span>
          <select name="style" value={style} onChange={(e) => setStyle(e.target.value)} className={input}>
            <option value="branded">{x.styleName.branded}</option>
            <option value="letter">{x.styleName.letter}</option>
          </select>
        </label>
      </div>

      <fieldset className="m-0 grid min-w-0 gap-[10px] border-0 p-0 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <label className="block">
          <span className={label}>{x.list}</span>
          <select name="list_id" value={list} onChange={(e) => setList(e.target.value)} className={input}>
            <option value="">{x.noList}</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.subscribed})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>{m.campaign.segment}</span>
          <select name="segment_id" value={segment} onChange={(e) => setSegment(e.target.value)} className={input}>
            <option value="">{m.campaign.noSegment}</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.mailable})
              </option>
            ))}
          </select>
        </label>
        <span className="text-[11.5px] leading-[1.5] text-mut [grid-column:1/-1]">{x.audienceHint}</span>
      </fieldset>

      <div>
        <Text name="subject" labelText={m.campaign.subject} value={subject} set={setSubject} max={150} />
        <span className={meter(subject.length, subject.length <= 50)}>{fill(x.subjectMeter, { count: subject.length })}</span>
      </div>
      <div>
        <Text name="preheader" labelText={m.campaign.preheader} value={preheader} set={setPreheader} max={200} />
        <span className={meter(preheader.length, preheader.length === 0 || (preheader.length >= 40 && preheader.length <= 90))}>
          {fill(x.preheaderMeter, { count: preheader.length })}
        </span>
      </div>
      <span className="text-[11.5px] text-mut">{x.placeholders}</span>

      <fieldset className="m-0 flex min-w-0 flex-col gap-[10px] border-0 p-0">
        <legend className={label}>{m.campaign.blocks}</legend>
        {blocks.map((b, i) => (
          <div key={i} className="rounded-panel border border-line bg-bg px-[12px] py-[10px]">
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-mut">
                {i + 1}. {blockName(b.type)}
              </span>
              <span className="flex gap-[6px]">
                <Button size="sm" tone="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={m.campaign.up}>
                  ↑
                </Button>
                <Button size="sm" tone="ghost" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label={m.campaign.down}>
                  ↓
                </Button>
                <Button size="sm" tone="ghost" onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}>
                  {m.campaign.remove}
                </Button>
              </span>
            </div>
            {b.type === 'heading' ? small(i, 'text', m.campaign.heading, 150) : null}
            {b.type === 'text' ? area(i, m.campaign.text, 5, 3000) : null}
            {b.type === 'button' ? (
              <>
                {small(i, 'text', m.campaign.button, 60)}
                {small(i, 'url', m.campaign.url, 500, 'url')}
              </>
            ) : null}
            {b.type === 'article' ? (
              <>
                {small(i, 'title', x.field.title, 150)}
                {area(i, m.campaign.text, 3, 1000)}
                {small(i, 'url', m.campaign.url, 500, 'url')}
                {small(i, 'label', x.field.label, 60)}
              </>
            ) : null}
            {b.type === 'bullets' ? area(i, x.field.lines, 4, 2000) : null}
            {b.type === 'image' ? (
              <>
                {small(i, 'url', m.campaign.url, 500, 'url')}
                {small(i, 'alt', x.field.alt, 150)}
                {small(i, 'href', x.field.href, 500, 'url')}
              </>
            ) : null}
            {b.type === 'quote' ? (
              <>
                {area(i, x.block.quote, 2, 600)}
                {small(i, 'title', x.field.attribution, 150)}
              </>
            ) : null}
            {b.type === 'event' ? (
              <>
                {small(i, 'title', x.field.title, 150)}
                {area(i, x.field.when, 3, 600)}
                {small(i, 'url', m.campaign.url, 500, 'url')}
                {small(i, 'label', x.field.label, 60)}
              </>
            ) : null}
            {b.type === 'ps' ? area(i, x.block.ps, 2, 600) : null}
          </div>
        ))}
        <span className="flex flex-wrap items-center gap-[6px]">
          <select value={adding} onChange={(e) => setAdding(e.target.value as Block['type'])} aria-label={x.add} className={`${input} w-auto`}>
            {(Object.keys(EMPTY) as Block['type'][]).map((t) => (
              <option key={t} value={t}>
                {blockName(t)}
              </option>
            ))}
          </select>
          <Button size="sm" tone="secondary" onClick={() => setBlocks([...blocks, { ...EMPTY[adding] }])}>
            {x.add}
          </Button>
        </span>
      </fieldset>

      <label className="block">
        <span className={label}>{x.signature}</span>
        <textarea
          name="signature"
          rows={2}
          maxLength={200}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          className={`${field} py-[9px] leading-[1.5]`}
        />
        <span className="mt-[4px] block text-[11.5px] text-mut">{x.signatureHint}</span>
      </label>

      <fieldset className="m-0 min-w-0 rounded-panel border border-line px-[12px] py-[10px]">
        <legend className="px-[4px] text-[12px] font-bold">{x.abTitle}</legend>
        <Text name="subject_b" labelText={x.subjectB} value={subjectB} set={setSubjectB} max={150} />
        <div className="mt-[8px] grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <Text name="ab_percent" labelText={x.abPercent} value={abPercent} set={setAbPercent} type="number" />
          <label className="block">
            <span className={label}>{x.abMetric}</span>
            <select name="ab_metric" value={abMetric} onChange={(e) => setAbMetric(e.target.value)} className={input}>
              <option value="open">{x.metric.open}</option>
              <option value="click">{x.metric.click}</option>
            </select>
          </label>
          <Text name="ab_wait_hours" labelText={x.abWait} value={abWait} set={setAbWait} type="number" />
        </div>
        <span className="mt-[6px] block text-[11.5px] text-mut">{x.abHint}</span>
      </fieldset>

      <fieldset className="m-0 min-w-0 rounded-panel border border-line px-[12px] py-[10px]">
        <legend className="px-[4px] text-[12px] font-bold">{x.webTitle}</legend>
        <label className="flex items-center gap-[8px] text-[13px]">
          <input type="checkbox" name="publish_web" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          {x.publishWeb}
        </label>
        {publish ? (
          <div className="mt-[8px] grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            <Text name="slug" labelText={x.slug} value={slug} set={setSlug} max={80} />
            <Text name="web_description" labelText={x.webDescription} value={webDescription} set={setWebDescription} max={200} />
          </div>
        ) : (
          <>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="web_description" value={webDescription} />
          </>
        )}
        <span className="mt-[6px] block text-[11.5px] text-mut">{x.webHint}</span>
      </fieldset>

      <div>
        <Text name="utm_campaign" labelText={m.campaign.utm} value={utm} set={setUtm} max={60} />
        <span className="mt-[4px] block text-[11.5px] text-mut">{m.campaign.utmHint}</span>
      </div>
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? common.saving : m.campaign.save}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
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
