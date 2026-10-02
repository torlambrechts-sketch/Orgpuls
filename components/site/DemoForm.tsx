'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { requestDemo, type DemoField } from '@/lib/demo/actions'
import { DEMO_ROLES, type DemoRole } from '@/lib/demo/roles'

/**
 * The demo's signup (D-143, D-191): who is asking — name, work address, company, role — and
 * the consent box, then a login link. No design exists for it; the fields are the site's
 * (D-187: a visible label above every field, 16 px so iOS does not zoom) and the button is the
 * v3 bundle's form button (Plattform/Forside: h52, r13, ink hairline on #F5C64A, 16/700).
 *
 * The box is never ticked for the visitor: consent is what they give, not what we assume. The
 * address is proved by the link before anything becomes a contact, so the form asks for it as
 * it is and the server checks the rest again (lib/demo/actions.ts, public.demo_request).
 */
const label = 'flex flex-col gap-[6px] text-[13.5px] font-semibold text-ink'
const field =
  'h-[48px] w-full rounded-cta border bg-bg px-[14px] text-[16px] font-normal text-ink aria-[invalid=true]:border-danger'
const errorLine = 'm-0 text-[13px] font-semibold leading-[1.45] text-danger'
const cta =
  'flex h-[52px] w-full cursor-pointer items-center justify-center gap-[9px] rounded-tile border border-ink bg-ac px-[22px] text-[16px] font-bold text-ink disabled:cursor-default disabled:opacity-70'

export type DemoWords = {
  title: string
  lead: string
  name: string
  mail: string
  company: string
  role: string
  rolePick: string
  roles: Record<DemoRole, string>
  consent: string
  submit: string
  sending: string
  nameMissing: string
  mailInvalid: string
  companyMissing: string
  roleMissing: string
  fieldsProblem: string
  limited: string
  closed: string
  failed: string
  note: string
  sent: {
    title: string
    /** with `{mail}` */
    lead: string
    from: string
    helpTitle: string
    help: ReactNode[]
    again: string
  }
}

const ORDER: DemoField[] = ['name', 'mail', 'company', 'role']

export function DemoRequest({ words: w, lang }: { words: DemoWords; lang: 'no' | 'en' }) {
  const [values, setValues] = useState({ name: '', mail: '', company: '', role: '' })
  const [consent, setConsent] = useState(false)
  const [trap, setTrap] = useState('')
  const [errors, setErrors] = useState<Partial<Record<DemoField, string>>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [sending, start] = useTransition()
  const refs = useRef<Partial<Record<DemoField, HTMLInputElement | HTMLSelectElement | null>>>({})
  const sentHead = useRef<HTMLHeadingElement>(null)

  const missing: Record<DemoField, string> = {
    name: w.nameMissing,
    mail: w.mailInvalid,
    company: w.companyMissing,
    role: w.roleMissing,
  }

  const check = (): Partial<Record<DemoField, string>> => {
    const e: Partial<Record<DemoField, string>> = {}
    const name = values.name.trim()
    const company = values.company.trim()
    if (!name || name.length > 120) e.name = w.nameMissing
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.mail.trim())) e.mail = w.mailInvalid
    if (!company || company.length > 200) e.company = w.companyMissing
    if (!(DEMO_ROLES as readonly string[]).includes(values.role)) e.role = w.roleMissing
    return e
  }

  const showErrors = (e: Partial<Record<DemoField, string>>) => {
    setErrors(e)
    const first = ORDER.find((f) => e[f])
    if (first) refs.current[first]?.focus()
  }

  const set = (f: DemoField, v: string) => {
    setValues((s) => ({ ...s, [f]: v }))
    setErrors((e) => (e[f] ? { ...e, [f]: undefined } : e))
    setProblem(null)
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col">
        <h2
          ref={sentHead}
          tabIndex={-1}
          className="m-0 font-display text-[26px] font-semibold leading-[1.15] outline-none"
        >
          {w.sent.title}
        </h2>
        <p className="m-0 mt-[10px] text-[15px] leading-[1.6] text-body [text-wrap:pretty]">
          {w.sent.lead.replace('{mail}', sent)}
        </p>
        <p className="m-0 mt-[12px] rounded-cta bg-mint px-[14px] py-[11px] text-[14px] leading-[1.55] text-greendeep">
          {w.sent.from}
        </p>
        <h3 className="m-0 mt-[20px] text-[14.5px] font-bold">{w.sent.helpTitle}</h3>
        <ul className="m-0 mt-[8px] flex list-disc flex-col gap-[6px] pl-[18px] text-[14px] leading-[1.55] text-body">
          {w.sent.help.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            setSent(null)
            setProblem(null)
          }}
          className="mt-[18px] flex h-[44px] w-fit cursor-pointer items-center rounded-cta border border-ink bg-sf px-[18px] text-[14.5px] font-bold text-ink"
        >
          {w.sent.again}
        </button>
      </div>
    )
  }

  const err = (f: DemoField) =>
    errors[f] ? (
      <p id={`demo-${f}-error`} role="alert" className={errorLine}>
        {errors[f]}
      </p>
    ) : null
  const a11y = (f: DemoField) => ({
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': errors[f] ? `demo-${f}-error` : undefined,
  })

  return (
    <form
      noValidate
      // a submit before the page has hydrated would otherwise be a GET, with the name and the
      // address in the URL and so in every log on the way; a POST carries them in the body
      method="post"
      aria-labelledby="demo-form-title"
      className="flex flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        const found = check()
        if (Object.keys(found).length) {
          showErrors(found)
          return
        }
        start(async () => {
          const r = await requestDemo({ ...values, consent, lang, trap, role: values.role as DemoRole }).catch(() => null)
          if (r?.ok) {
            setSent(values.mail.trim())
            requestAnimationFrame(() => sentHead.current?.focus())
            return
          }
          if (r?.problem === 'invalid') {
            // the server names the fields it refused; an address it will not send to is the address
            const fields = r.fields?.length ? r.fields : (['mail'] as DemoField[])
            showErrors(Object.fromEntries(fields.map((f) => [f, missing[f]])))
            setProblem(w.fieldsProblem)
            return
          }
          setProblem(r?.problem === 'limited' ? w.limited : r?.problem === 'closed' ? w.closed : w.failed)
        })
      }}
    >
      <h2 id="demo-form-title" className="m-0 font-display text-[26px] font-semibold leading-[1.15]">
        {w.title}
      </h2>
      <p className="m-0 mt-[8px] text-[14.5px] leading-[1.55] text-body [text-wrap:pretty]">{w.lead}</p>

      <div className="mt-[20px] flex flex-col gap-[14px]">
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="demo-name" className={label}>
            {w.name}
          </label>
          <input
            id="demo-name"
            ref={(el) => {
              refs.current.name = el
            }}
            name="name"
            value={values.name}
            autoComplete="name"
            maxLength={120}
            required
            onChange={(e) => set('name', e.target.value)}
            className={`${field} border-line`}
            {...a11y('name')}
          />
          {err('name')}
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="demo-mail" className={label}>
            {w.mail}
          </label>
          <input
            id="demo-mail"
            ref={(el) => {
              refs.current.mail = el
            }}
            name="email"
            type="email"
            inputMode="email"
            value={values.mail}
            autoComplete="email"
            maxLength={254}
            required
            onChange={(e) => set('mail', e.target.value)}
            className={`${field} border-line`}
            {...a11y('mail')}
          />
          {err('mail')}
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="demo-company" className={label}>
            {w.company}
          </label>
          <input
            id="demo-company"
            ref={(el) => {
              refs.current.company = el
            }}
            name="organization"
            value={values.company}
            autoComplete="organization"
            maxLength={200}
            required
            onChange={(e) => set('company', e.target.value)}
            className={`${field} border-line`}
            {...a11y('company')}
          />
          {err('company')}
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="demo-role" className={label}>
            {w.role}
          </label>
          <span className="relative block">
            <select
              id="demo-role"
              ref={(el) => {
                refs.current.role = el
              }}
              name="organization-title"
              value={values.role}
              autoComplete="organization-title"
              required
              onChange={(e) => set('role', e.target.value)}
              className={`${field} cursor-pointer appearance-none border-line pr-[40px] ${values.role ? '' : 'text-mut'}`}
              {...a11y('role')}
            >
              <option value="" disabled>
                {w.rolePick}
              </option>
              {DEMO_ROLES.map((r) => (
                <option key={r} value={r} className="text-ink">
                  {w.roles[r]}
                </option>
              ))}
            </select>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-[15px] top-1/2 -translate-y-1/2 text-[12px] text-mut"
            >
              ▾
            </span>
          </span>
          {err('role')}
        </div>

        <label className="mt-[2px] flex cursor-pointer items-start gap-[10px] text-[14px] font-normal leading-[1.5] text-body">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-[3px] h-[18px] w-[18px] flex-none cursor-pointer accent-ink"
          />
          <span>{w.consent}</span>
        </label>
      </div>

      {/* for form bots only: off screen, out of the tab order, hidden from assistive technology */}
      <input
        name="website"
        value={trap}
        onChange={(e) => setTrap(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-10000px] h-px w-px overflow-hidden"
      />

      <button type="submit" disabled={sending} className={`${cta} mt-[20px]`}>
        {sending ? w.sending : w.submit}
        {sending ? null : <span aria-hidden="true">→</span>}
      </button>
      {problem ? (
        <p role="alert" className={`${errorLine} mt-[10px]`}>
          {problem}
        </p>
      ) : null}
      <p className="m-0 mt-[12px] text-[13px] leading-[1.5] text-mut [text-wrap:pretty]">{w.note}</p>
    </form>
  )
}
