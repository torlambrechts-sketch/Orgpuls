'use client'

import { useState, useTransition } from 'react'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { Button } from '@/components/ui/Button'
import type { Company, List } from '@/lib/admin/crm'
import {
  addToList,
  createCampaign,
  findInRegistry,
  importCompanies,
  logActivity,
  removeFromList,
  saveCompany,
  saveList,
  toggleTask,
  type CompanyImport,
  type RegistryResult,
} from '@/lib/admin/crmActions'

/**
 * The CRM pipeline's forms (D-103): companies, the activity log, the Brønnøysund picker,
 * lists and a campaign started from a template. Fields are controlled, as in ActionForms,
 * so a refused submission keeps what was typed.
 */
type Common = { reason: string; reasonHint: string; saving: string; done: string }

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const input = `${field} h-[38px]`
const label = 'mb-[5px] block text-[12px] font-semibold'
const fill = (s: string, v: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

function Field({
  name,
  text,
  value,
  set,
  type = 'text',
  required = false,
  max,
}: {
  name: string
  text: string
  value: string
  set: (v: string) => void
  type?: string
  required?: boolean
  max?: number
}) {
  return (
    <label className="block">
      <span className={label}>{text}</span>
      <input name={name} type={type} required={required} maxLength={max} value={value} onChange={(e) => set(e.target.value)} className={input} />
    </label>
  )
}

// ---------------------------------------------------------------- companies
export function CompanyForm({
  m,
  common,
  company,
  admins,
}: {
  m: CrmMessages
  common: Common
  company?: Company
  admins: { id: string; email: string | null }[]
}) {
  const f = m.prospects
  const [name, setName] = useState(company?.name ?? '')
  const [orgNumber, setOrgNumber] = useState(company?.org_number ?? '')
  const [employees, setEmployees] = useState(company?.employees?.toString() ?? '')
  const [municipality, setMunicipality] = useState(company?.municipality ?? '')
  const [website, setWebsite] = useState(company?.website ?? '')
  const [phone, setPhone] = useState(company?.phone ?? '')
  const [owner, setOwner] = useState(company?.owner_id ?? '')
  const [nextStep, setNextStep] = useState(company?.next_step ?? '')
  const [nextAt, setNextAt] = useState(company?.next_step_at ?? '')
  const [tags, setTags] = useState(company?.tags.join(', ') ?? '')
  const [stage, setStage] = useState<string>(company ? (company.org_id ? '' : company.stage) : 'new')
  const [lost, setLost] = useState(company?.lost_reason ?? '')
  const [state, action, pending] = useKeptAction(saveCompany, () => undefined)
  const followsPlan = Boolean(company?.org_id)

  return (
    <form action={action} className="flex flex-col gap-[10px]">
      {company ? <input type="hidden" name="id" value={company.id} /> : null}
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <Field name="name" text={f.name} value={name} set={setName} required max={200} />
        {company ? null : <Field name="org_number" text={f.orgNumber} value={orgNumber} set={setOrgNumber} max={20} />}
        {company ? null : <Field name="employees" text={f.employees} value={employees} set={setEmployees} type="number" />}
        {company ? null : <Field name="municipality" text={f.municipality} value={municipality} set={setMunicipality} max={80} />}
        <Field name="website" text={f.website} value={website} set={setWebsite} max={300} />
        <Field name="phone" text={f.phone} value={phone} set={setPhone} max={40} />
        <label className="block">
          <span className={label}>{f.owner}</span>
          <select name="owner_id" value={owner} onChange={(e) => setOwner(e.target.value)} className={input}>
            <option value="">{f.noOwner}</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email ?? a.id}
              </option>
            ))}
          </select>
        </label>
        {followsPlan ? null : (
          <label className="block">
            <span className={label}>{f.stageLabel}</span>
            <select name="stage" value={stage} onChange={(e) => setStage(e.target.value)} className={input}>
              {(['new', 'contacted', 'engaged', 'meeting', 'lost', 'not_relevant'] as const).map((k) => (
                <option key={k} value={k}>
                  {m.stage[k]}
                </option>
              ))}
            </select>
          </label>
        )}
        <Field name="next_step" text={f.nextStep} value={nextStep} set={setNextStep} max={300} />
        <Field name="next_step_at" text={f.nextStepAt} value={nextAt} set={setNextAt} type="date" />
        <Field name="tags" text={f.tags} value={tags} set={setTags} max={400} />
        {stage === 'lost' ? <Field name="lost_reason" text={f.lostReason} value={lost} set={setLost} max={300} /> : null}
      </div>
      {followsPlan ? <p className="m-0 text-[12px] text-mut">{m.company.followsPlan}</p> : null}
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? common.saving : company ? m.company.save : f.submit}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
    </form>
  )
}

export function ActivityForm({
  m,
  common,
  company,
  contacts,
}: {
  m: CrmMessages
  common: Common
  company: string
  contacts: { id: string; name: string }[]
}) {
  const [kind, setKind] = useState('call')
  const [body, setBody] = useState('')
  const [due, setDue] = useState('')
  const [contact, setContact] = useState('')
  const [state, action, pending] = useKeptAction(logActivity, () => (setBody(''), setDue('')))
  return (
    <form action={action} className="flex flex-col gap-[8px]">
      <input type="hidden" name="company" value={company} />
      <div className="flex flex-wrap gap-[8px]">
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={m.company.log} className={`${input} w-auto`}>
          {(['call', 'email', 'meeting', 'note', 'task'] as const).map((k) => (
            <option key={k} value={k}>
              {m.company.kind[k]}
            </option>
          ))}
        </select>
        {contacts.length ? (
          <select name="contact" value={contact} onChange={(e) => setContact(e.target.value)} aria-label={m.company.contacts} className={`${input} w-auto`}>
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        {kind === 'task' ? (
          <input name="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label={m.company.due} className={`${input} w-auto`} />
        ) : null}
      </div>
      <textarea
        name="body"
        required
        rows={2}
        maxLength={4000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={m.company.body}
        aria-label={m.company.body}
        className={`${field} py-[9px] leading-[1.5]`}
      />
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" tone="quiet" disabled={pending}>
          {pending ? common.saving : m.company.submit}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
    </form>
  )
}

export function TaskToggle({ id, company, done, labels }: { id: string; company: string; done: boolean; labels: { done: string; reopen: string } }) {
  const [, action, pending] = useKeptAction(toggleTask, () => undefined)
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="company" value={company} />
      <button type="submit" disabled={pending} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-semibold text-link underline">
        {done ? labels.reopen : labels.done}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------- the register
const FORMS = ['AS', 'ASA', 'ENK', 'ANS', 'DA', 'SA', 'STI', 'FLI', 'KOMM'] as const
const ROLE = /^(post|postmottak|firmapost|firmaet|kontakt|kontor|info|mail|epost|e-post|hei|hello|office|admin|administrasjon|resepsjon|sentralbord|salg|sales|faktura|regnskap|hr|personal|ledelse|daglig\.leder|dagligleder|booking|service|kundeservice)@/

export function RegistryPicker({ m }: { m: CrmMessages }) {
  const b = m.prospects.brreg
  const [nace, setNace] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [min, setMin] = useState('10')
  const [max, setMax] = useState('100')
  const [form, setForm] = useState('AS')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<RegistryResult | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<CompanyImport | null>(null)
  const [pending, start] = useTransition()

  const search = (to: number) =>
    start(async () => {
      setAdded(null)
      setPage(to)
      const r = await findInRegistry({
        nace: nace.trim() || undefined,
        municipality: municipality.trim() || undefined,
        min: min === '' ? undefined : Number(min),
        max: max === '' ? undefined : Number(max),
        form: form || undefined,
        page: to,
      }).catch(() => ({ ok: false as const, problem: 'unreachable' }))
      setResult(r)
      setPicked(new Set())
    })

  const hits = result?.ok ? result.hits : []
  const fresh = hits.filter((h) => !h.known)

  return (
    <div className="flex flex-col gap-[12px]">
      <p className="m-0 max-w-[90ch] text-[12.5px] leading-[1.55] text-mut">{b.lead}</p>
      <form
        className="grid items-end gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]"
        onSubmit={(e) => {
          e.preventDefault()
          search(0)
        }}
      >
        <Field name="nace" text={b.nace} value={nace} set={setNace} max={6} />
        <Field name="municipality" text={b.municipality} value={municipality} set={setMunicipality} max={4} />
        <Field name="min" text={b.min} value={min} set={setMin} type="number" />
        <Field name="max" text={b.max} value={max} set={setMax} type="number" />
        <label className="block">
          <span className={label}>{b.form}</span>
          <select value={form} onChange={(e) => setForm(e.target.value)} className={input}>
            <option value="">{b.anyForm}</option>
            {FORMS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {b.search}
        </Button>
      </form>

      {result && !result.ok ? (
        <p role="alert" className="m-0 text-[12.5px] font-semibold text-danger">
          {result.problem === 'unreachable' ? b.unreachable : (m.problem[result.problem as keyof typeof m.problem] ?? m.problem.failed)}
        </p>
      ) : null}

      {result?.ok ? (
        <>
          <div className="flex flex-wrap items-center gap-[10px] text-[12.5px] text-mut">
            <span>{fill(b.found, { count: result.total, page: result.page + 1, pages: Math.max(1, result.pages) })}</span>
            <Button size="sm" tone="ghost" disabled={pending || page === 0} onClick={() => search(page - 1)}>
              {b.prev}
            </Button>
            <Button size="sm" tone="ghost" disabled={pending || page + 1 >= result.pages} onClick={() => search(page + 1)}>
              {b.next}
            </Button>
            <label className="flex items-center gap-[6px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={fresh.length > 0 && fresh.every((h) => picked.has(h.org_number))}
                onChange={(e) => setPicked(e.target.checked ? new Set(fresh.map((h) => h.org_number)) : new Set())}
              />
              {b.selectAll}
            </label>
          </div>
          {hits.length ? (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={b.title}>
              <table className="w-full border-collapse text-left text-[12.5px]">
                <tbody>
                  {hits.map((h) => (
                    <tr key={h.org_number} className="border-b border-line">
                      <td className="px-[8px] py-[7px] align-top">
                        <input
                          type="checkbox"
                          aria-label={h.name}
                          disabled={h.known}
                          checked={picked.has(h.org_number)}
                          onChange={(e) => {
                            const next = new Set(picked)
                            if (e.target.checked) next.add(h.org_number)
                            else next.delete(h.org_number)
                            setPicked(next)
                          }}
                        />
                      </td>
                      <td className="px-[8px] py-[7px] align-top">
                        <span className="font-semibold">{h.name}</span>
                        <span className="block text-mut">
                          {h.org_number} · {h.form_code ?? '—'} · {h.municipality ?? '—'}
                        </span>
                      </td>
                      <td className="px-[8px] py-[7px] align-top">
                        {h.employees ?? '—'}
                        <span className="block max-w-[34ch] truncate text-mut">{h.nace_label ?? h.nace_code ?? ''}</span>
                      </td>
                      <td className="px-[8px] py-[7px] align-top">
                        {h.email ? (
                          <>
                            {h.email}
                            <span className="block text-mut">{ROLE.test(h.email) && h.form_code !== 'ENK' ? b.roleAddress : b.personAddress}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-[8px] py-[7px] align-top font-semibold text-mut">{h.known ? b.known : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-0 text-[13px] text-mut">{b.none}</p>
          )}
          <span className="flex flex-wrap items-center gap-[10px]">
            <Button
              size="sm"
              disabled={pending || picked.size === 0}
              onClick={() =>
                start(async () => {
                  const rows = hits
                    .filter((h) => picked.has(h.org_number))
                    .map(({ known: _known, ...h }) => h)
                  const r = await importCompanies(rows).catch(() => ({ ok: false as const, problem: 'failed' }))
                  setAdded(r)
                  if (r.ok) search(page)
                })
              }
            >
              {b.add} ({picked.size})
            </Button>
            {added ? (
              added.ok ? (
                <span role="status" className="text-[12.5px] font-semibold text-link">
                  {fill(b.result, added)}
                </span>
              ) : (
                <span role="alert" className="text-[12.5px] font-semibold text-danger">
                  {m.problem[added.problem as keyof typeof m.problem] ?? m.problem.failed}
                </span>
              )
            ) : null}
          </span>
        </>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- lists
export function ListForm({ m, common, list }: { m: CrmMessages; common: Common; list?: List }) {
  const l = m.lists
  const [key, setKey] = useState(list?.key ?? '')
  const [nameNo, setNameNo] = useState(list?.name_no ?? '')
  const [nameEn, setNameEn] = useState(list?.name_en ?? '')
  const [descNo, setDescNo] = useState(list?.description_no ?? '')
  const [descEn, setDescEn] = useState(list?.description_en ?? '')
  const [pub, setPub] = useState(list?.public ?? true)
  const [archived, setArchived] = useState(list?.archived ?? false)
  const [state, action, pending] = useKeptAction(saveList, () => undefined)
  return (
    <form action={action} className="flex flex-col gap-[10px]">
      {list ? <input type="hidden" name="id" value={list.id} /> : null}
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {list ? null : <Field name="key" text={l.key} value={key} set={setKey} required max={40} />}
        <Field name="name_no" text={l.nameNo} value={nameNo} set={setNameNo} required max={80} />
        <Field name="name_en" text={l.nameEn} value={nameEn} set={setNameEn} required max={80} />
        <Field name="description_no" text={l.descNo} value={descNo} set={setDescNo} max={300} />
        <Field name="description_en" text={l.descEn} value={descEn} set={setDescEn} max={300} />
      </div>
      <label className="flex items-center gap-[8px] text-[13px]">
        <input type="checkbox" name="public" checked={pub} onChange={(e) => setPub(e.target.checked)} />
        {l.public}
      </label>
      {list ? (
        <label className="flex items-center gap-[8px] text-[13px]">
          <input type="checkbox" name="archived" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {l.archived}
        </label>
      ) : null}
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? common.saving : l.save}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
    </form>
  )
}

export function ContactListForms({
  m,
  common,
  contact,
  lists,
  member,
}: {
  m: CrmMessages
  common: Common
  contact: string
  lists: { id: string; key: string; name: string }[]
  member: string[]
}) {
  const c = m.contactLists
  const [list, setList] = useState(lists.find((l) => !member.includes(l.key))?.id ?? '')
  const [source, setSource] = useState('')
  const [reason, setReason] = useState('')
  const [addState, add, adding] = useKeptAction(addToList, () => setSource(''))
  const [removeState, remove, removing] = useKeptAction(removeFromList, () => setReason(''))
  const on = lists.filter((l) => member.includes(l.key))
  const off = lists.filter((l) => !member.includes(l.key))
  return (
    <div className="flex flex-col gap-[14px]">
      {on.length ? (
        <ul className="m-0 flex list-none flex-col gap-[8px] p-0">
          {on.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-[8px] text-[13px]">
              <span className="font-semibold">{l.name}</span>
              <form action={remove} className="flex flex-wrap items-center gap-[6px]">
                <input type="hidden" name="list" value={l.id} />
                <input type="hidden" name="contact" value={contact} />
                <input
                  name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={c.removeReason}
                  aria-label={`${c.removeReason}: ${l.name}`}
                  className={`${input} h-[32px] w-[220px]`}
                />
                <Button type="submit" size="sm" tone="ghost" disabled={removing}>
                  {c.remove}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-mut">{c.none}</p>
      )}
      <Outcome state={removeState} problems={m.problem} done={common.done} />
      {off.length ? (
        <form action={add} className="flex flex-wrap items-end gap-[8px]">
          <input type="hidden" name="contact" value={contact} />
          <label className="block">
            <span className={label}>{c.add}</span>
            <select name="list" value={list} onChange={(e) => setList(e.target.value)} className={`${input} w-auto`}>
              {off.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <div className="min-w-[220px] flex-1">
            <Field name="source" text={c.consentSource} value={source} set={setSource} required max={200} />
          </div>
          <Button type="submit" size="sm" tone="quiet" disabled={adding}>
            {c.submit}
          </Button>
          <Outcome state={addState} problems={{ ...m.problem, not_consented: c.refused }} done={c.added} />
        </form>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- templates
export function TemplateStart({ m, template, name }: { m: CrmMessages; template: string; name: string }) {
  const [value, setValue] = useState(name)
  const [state, action, pending] = useKeptAction(createCampaign, () => undefined)
  return (
    <form action={action} className="flex flex-wrap items-end gap-[8px]">
      <input type="hidden" name="template_key" value={template} />
      <input type="hidden" name="lang" value="no" />
      <div className="min-w-[200px] flex-1">
        <Field name="name" text={m.templates.name} value={value} set={setValue} required max={120} />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {m.templates.use}
      </Button>
      <Outcome state={state} problems={m.problem} done="" />
    </form>
  )
}
