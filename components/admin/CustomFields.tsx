'use client'

import { useState } from 'react'
import type en from '@/messages/en.json'
import type { AdminResult } from '@/lib/admin/actions'
import { conditionValue, opsFor, type Condition, type ConditionOp, type FieldDef } from '@/lib/admin/crmFieldTypes'

/**
 * Custom fields in a record's form (0197, D-212; CUS-01 to CUS-03): one input per writable field, by type, written
 * into one hidden «custom» value the server action passes on as JSON; the database checks every value again. A
 * read-only field is shown, not sent; a formula field is shown as calculated. References (organization, person) are
 * typed as org number, exact name or e-mail and resolved by the database.
 */
export type FieldMessages = (typeof en)['admin']['crmFields']

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none'
const label = 'mb-[5px] block text-[12px] font-semibold'
// a condition's controls sit on one line, as wide as their content
const ctl = 'box-border h-[34px] max-w-full rounded-ctl border border-line bg-bg px-[10px] text-[13px] text-ink outline-none'
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export function CustomFieldInputs({
  fields,
  values = {},
  refs = {},
  staff = [],
  required,
  m,
}: {
  fields: FieldDef[]
  values?: Record<string, unknown>
  refs?: Record<string, string>
  staff?: { id: string; email: string | null }[]
  /** the keys required now (a company's form knows its stage); without it, the fields required at every stage */
  required?: string[]
  m: FieldMessages
}) {
  const writable = fields.filter((f) => f.access === 'write' && !f.computed)
  const [state, setState] = useState<Record<string, unknown>>(() => Object.fromEntries(writable.map((f) => [f.key, values[f.key] ?? null])))
  // a reference shows its name until it is retyped
  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(writable.filter((f) => f.type === 'organization' || f.type === 'person').map((f) => [f.key, refs[str(values[f.key])] ?? str(values[f.key])])),
  )
  if (!fields.length) return null
  const set = (k: string, v: unknown) => setState((s) => ({ ...s, [k]: v }))
  const part = (k: string, sub: string, v: string) => setState((s) => ({ ...s, [k]: { ...(isObj(s[k]) ? s[k] : {}), [sub]: v } }))

  return (
    <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
      <input type="hidden" name="custom" value={JSON.stringify(state)} />
      {fields.map((f) => {
        const id = `cf-${f.key}`
        const v = f.key in state ? state[f.key] : values[f.key]
        const must = required ? required.includes(f.key) : f.importance === 'required' && !f.required_from_stage
        const head = (
          <span className={label}>
            {f.label}
            {must ? <span aria-hidden="true" className="text-danger"> *</span> : null}
            {must ? <span className="sr-only"> ({m.inputs.required})</span> : null}
            {f.importance === 'important' && (v === null || v === undefined || v === '') ? (
              <span className="ml-[6px] rounded-pill bg-sbg px-[7px] py-[1px] text-[10.5px] font-bold">{m.inputs.important}</span>
            ) : null}
            {f.description ? (
              <span title={f.description} className="ml-[6px] cursor-help text-mut">
                <span aria-hidden="true">ⓘ</span>
                <span className="sr-only">{f.description}</span>
              </span>
            ) : null}
          </span>
        )
        const wide = f.type === 'large_text' || f.type === 'address' || f.type === 'multiple_options' || f.type === 'time_range' || f.type === 'date_range'
        const cls = wide ? 'block [grid-column:1/-1]' : 'block'
        if (f.computed || f.access !== 'write') {
          return (
            <div key={f.key} className={cls}>
              {head}
              <span className="block min-h-[38px] rounded-ctl border border-dashed border-line px-[12px] py-[9px] text-[13.5px] text-mut">
                {readOnlyText(f, values[f.key])}
                {f.computed ? ` · ${m.inputs.calculated}` : f.access === 'read' ? ` · ${m.inputs.readOnly}` : ''}
              </span>
            </div>
          )
        }
        switch (f.type) {
          case 'large_text':
            return (
              <label key={f.key} className={cls} htmlFor={id}>
                {head}
                <textarea id={id} value={str(v)} onChange={(e) => set(f.key, e.target.value)} maxLength={10000} rows={3} className={`${field} py-[8px]`} />
              </label>
            )
          case 'single_option':
            return (
              <label key={f.key} className={cls} htmlFor={id}>
                {head}
                <select id={id} value={str(v)} onChange={(e) => set(f.key, e.target.value || null)} className={`${field} h-[38px]`}>
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          case 'multiple_options': {
            const picked = Array.isArray(v) ? (v as string[]) : []
            return (
              <fieldset key={f.key} className={`m-0 min-w-0 border-0 p-0 ${cls}`}>
                <legend className={label}>{head}</legend>
                <div className="flex flex-wrap gap-x-[14px] gap-y-[6px]">
                  {f.options.map((o) => (
                    <label key={o.key} className="flex items-center gap-[6px] text-[13px]">
                      <input
                        type="checkbox"
                        checked={picked.includes(o.key)}
                        onChange={(e) => set(f.key, e.target.checked ? [...picked, o.key] : picked.filter((x) => x !== o.key))}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          }
          case 'autocomplete':
            return (
              <label key={f.key} className={cls} htmlFor={id}>
                {head}
                <input id={id} list={`${id}-list`} value={str(v)} onChange={(e) => set(f.key, e.target.value)} maxLength={200} className={`${field} h-[38px]`} />
                <datalist id={`${id}-list`}>
                  {f.options.map((o) => (
                    <option key={o.key} value={o.label} />
                  ))}
                </datalist>
              </label>
            )
          case 'number':
          case 'monetary': {
            const shown = f.type === 'monetary' && isObj(v) ? str(v.amount) : str(v)
            return (
              <label key={f.key} className={cls} htmlFor={id}>
                {head}
                <span className="flex items-center gap-[6px]">
                  <input
                    id={id}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={shown}
                    onChange={(e) => set(f.key, e.target.value === '' ? null : Number(e.target.value))}
                    className={`${field} h-[38px]`}
                  />
                  {f.type === 'monetary' ? <span className="text-[12.5px] text-mut">{m.inputs.kr}</span> : null}
                </span>
              </label>
            )
          }
          case 'user':
            return (
              <label key={f.key} className={cls} htmlFor={id}>
                {head}
                <select id={id} value={str(v)} onChange={(e) => set(f.key, e.target.value || null)} className={`${field} h-[38px]`}>
                  <option value="">{m.inputs.nobody}</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.email ?? s.id}
                    </option>
                  ))}
                </select>
              </label>
            )
          case 'organization':
          case 'person':
            return (
              <label key={f.key} className={cls} htmlFor={id}>
                {head}
                <input
                  id={id}
                  value={typed[f.key] ?? ''}
                  placeholder={f.type === 'organization' ? m.inputs.orgHint : m.inputs.personHint}
                  onChange={(e) => {
                    setTyped((t) => ({ ...t, [f.key]: e.target.value }))
                    set(f.key, e.target.value.trim() || null)
                  }}
                  maxLength={254}
                  className={`${field} h-[38px]`}
                />
              </label>
            )
          case 'time':
          case 'date':
          case 'phone':
            return (
              <label key={f.key} className={cls} htmlFor={id}>
                {head}
                <input
                  id={id}
                  type={f.type === 'phone' ? 'tel' : f.type}
                  value={str(v)}
                  onChange={(e) => set(f.key, e.target.value || null)}
                  maxLength={40}
                  className={`${field} h-[38px]`}
                />
              </label>
            )
          case 'time_range':
          case 'date_range': {
            const kind = f.type === 'time_range' ? 'time' : 'date'
            const o = isObj(v) ? v : {}
            return (
              <fieldset key={f.key} className={`m-0 min-w-0 border-0 p-0 ${cls}`}>
                <legend className={label}>{head}</legend>
                <span className="flex flex-wrap items-center gap-[8px]">
                  <input type={kind} aria-label={`${f.label}: ${m.inputs.from}`} value={str(o.from)} onChange={(e) => part(f.key, 'from', e.target.value)} className={`${field} h-[38px] max-w-[200px]`} />
                  <span aria-hidden="true">–</span>
                  <input type={kind} aria-label={`${f.label}: ${m.inputs.to}`} value={str(o.to)} onChange={(e) => part(f.key, 'to', e.target.value)} className={`${field} h-[38px] max-w-[200px]`} />
                </span>
              </fieldset>
            )
          }
          case 'address': {
            const o = isObj(v) ? v : {}
            return (
              <fieldset key={f.key} className={`m-0 min-w-0 border-0 p-0 ${cls}`}>
                <legend className={label}>{head}</legend>
                <div className="grid gap-[8px] [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
                  {(['street', 'postcode', 'city', 'country'] as const).map((k) => (
                    <input
                      key={k}
                      aria-label={`${f.label}: ${m.inputs[k]}`}
                      placeholder={m.inputs[k]}
                      value={str(o[k])}
                      onChange={(e) => part(f.key, k, e.target.value)}
                      maxLength={k === 'street' ? 200 : k === 'postcode' ? 12 : 100}
                      className={`${field} h-[38px]`}
                    />
                  ))}
                </div>
              </fieldset>
            )
          }
          default:
            return (
              <label key={f.key} className={cls} htmlFor={id}>
                {head}
                <input id={id} value={str(v)} onChange={(e) => set(f.key, e.target.value)} maxLength={500} className={`${field} h-[38px]`} />
              </label>
            )
        }
      })}
    </div>
  )
}

/** A read-only or calculated value in a form, as plain text (a page has the formatted rows) */
function readOnlyText(f: FieldDef, v: unknown) {
  if (v === null || v === undefined || v === '') return '—'
  if (isObj(v) && typeof v.amount === 'number') return `${v.amount.toLocaleString('nb-NO', { maximumFractionDigits: 2 })} kr`
  if (typeof v === 'number') return v.toLocaleString('nb-NO', { maximumFractionDigits: 6 })
  if (Array.isArray(v)) return v.map((k) => f.options.find((o) => o.key === k)?.label ?? String(k)).join(', ')
  if (f.type === 'single_option') return f.options.find((o) => o.key === v)?.label ?? String(v)
  return isObj(v) ? Object.values(v).filter(Boolean).join(', ') : String(v)
}

/** A failed save that names fields says which, by their labels */
export function FieldsProblem({ state, fields, m }: { state: AdminResult | null; fields: FieldDef[]; m: FieldMessages }) {
  if (!state || state.ok || !('fields' in state) || !Array.isArray(state.fields) || !state.fields.length) return null
  const names = state.fields.map((k) => fields.find((f) => f.key === k)?.label ?? k).join(', ')
  return (
    <span role="alert" className="text-[12.5px] font-semibold text-danger">
      {(m.problemFields[state.problem as keyof typeof m.problemFields] ?? m.problemFields.invalid_field).replace('{fields}', names)}
    </span>
  )
}

/**
 * Conditions on custom fields (CUS-01: a new field is a filter without a deploy), written into a hidden value as
 * JSON: [{key, op, value}]. Used by the companies list and by segments.
 */
export function ConditionEditor({ fields, initial = [], name, m }: { fields: FieldDef[]; initial?: Condition[]; name: string; m: FieldMessages }) {
  const usable = fields.filter((f) => f.access !== 'hidden')
  const [rows, setRows] = useState<{ key: string; op: ConditionOp; raw: string }[]>(() =>
    initial.map((c) => ({ key: c.key, op: c.op, raw: Array.isArray(c.value) ? str(c.value[0]) : str(c.value) })),
  )
  const conditions = rows
    .map((r) => {
      const f = usable.find((x) => x.key === r.key)
      if (!f) return null
      const value = conditionValue(f, r.op, r.raw)
      if (value === undefined && r.op !== 'empty' && r.op !== 'not_empty') return null
      return value === undefined ? { key: r.key, op: r.op } : { key: r.key, op: r.op, value }
    })
    .filter(Boolean)
  if (!usable.length) return null
  return (
    <div className="flex flex-col gap-[8px]">
      <input type="hidden" name={name} value={conditions.length ? JSON.stringify(conditions) : ''} />
      {rows.map((r, i) => {
        const f = usable.find((x) => x.key === r.key) ?? usable[0]!
        const ops = opsFor(f.type)
        const update = (patch: Partial<typeof r>) => setRows((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)))
        return (
          <div key={i} className="flex flex-wrap items-center gap-[8px]">
            <select
              aria-label={m.filter.field}
              value={f.key}
              onChange={(e) => {
                const nf = usable.find((x) => x.key === e.target.value)!
                update({ key: nf.key, op: opsFor(nf.type)[0]!, raw: '' })
              }}
              className={ctl}
            >
              {usable.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
            <select aria-label={m.filter.op} value={r.op} onChange={(e) => update({ op: e.target.value as ConditionOp })} className={ctl}>
              {ops.map((o) => (
                <option key={o} value={o}>
                  {m.ops[o]}
                </option>
              ))}
            </select>
            {r.op === 'empty' || r.op === 'not_empty' ? null : f.type === 'single_option' || f.type === 'multiple_options' ? (
              <select aria-label={m.filter.value} value={r.raw} onChange={(e) => update({ raw: e.target.value })} className={ctl}>
                <option value="">—</option>
                {f.options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={m.filter.value}
                type={f.type === 'date' ? 'date' : f.type === 'number' || f.type === 'monetary' ? 'number' : 'text'}
                value={r.raw}
                onChange={(e) => update({ raw: e.target.value })}
                className={`${ctl} min-w-[140px]`}
              />
            )}
            <button type="button" onClick={() => setRows((all) => all.filter((_, j) => j !== i))} className="text-[12.5px] font-semibold text-link">
              {m.filter.remove}
            </button>
          </div>
        )
      })}
      {rows.length < 20 ? (
        <span>
          <button
            type="button"
            onClick={() => setRows((all) => [...all, { key: usable[0]!.key, op: opsFor(usable[0]!.type)[0]!, raw: '' }])}
            className="text-[12.5px] font-semibold text-link"
          >
            {m.filter.add}
          </button>
        </span>
      ) : null}
    </div>
  )
}
