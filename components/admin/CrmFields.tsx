'use client'

import { useState } from 'react'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import type { FieldMessages } from '@/components/admin/CustomFields'
import { Button } from '@/components/ui/Button'
import { archiveCrmField, archiveCrmFieldGroup, saveCrmField, saveCrmFieldGroup } from '@/lib/admin/crmFieldActions'
import { FIELD_TYPES, IMPORTANCES, NUMERIC_TYPES, OPTION_TYPES, optionLines, type FieldDef, type FieldEntity, type FieldGroup, type FieldType } from '@/lib/admin/crmFieldTypes'

/**
 * CRM › Custom fields (0197, D-222; CUS-01 to CUS-04, SF-38): a field's form — type, options, rule, stage, formula
 * and who may not see or change it — and its group's. The database decides; these forms ask.
 */
type Common = { reason: string; reasonHint: string; saving: string; done: string }

const input = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none h-[38px]'
const label = 'mb-[5px] block text-[12px] font-semibold'
const hint = 'mt-[4px] block text-[12px] leading-[1.45] text-mut'

function Reason({ common, required }: { common: Common; required: boolean }) {
  const [value, setValue] = useState('')
  return (
    <label className="block">
      <span className={label}>{common.reason}</span>
      <input name="reason" value={value} onChange={(e) => setValue(e.target.value)} required={required} minLength={required ? 5 : undefined} maxLength={500} className={input} />
      {required ? <span className={hint}>{common.reasonHint}</span> : null}
    </label>
  )
}

/** Add a field (no field) or change one; the key is fixed once it is made */
export function FieldForm({
  field,
  entity,
  groups,
  stages,
  sets,
  m,
  common,
  reasonRequired,
}: {
  field?: FieldDef
  entity: FieldEntity
  groups: FieldGroup[]
  stages: { key: string; name: string }[]
  sets: { id: string; name: string; kind: string }[]
  m: FieldMessages
  common: Common
  reasonRequired: boolean
}) {
  const [key, setKey] = useState(field?.key ?? '')
  const [labelText, setLabel] = useState(field?.label ?? '')
  const [description, setDescription] = useState(field?.description ?? '')
  const [type, setType] = useState<FieldType>(field?.type ?? 'text')
  const [group, setGroup] = useState(field?.group_id ?? '')
  const [sort, setSort] = useState(String(field?.sort ?? 0))
  const [options, setOptions] = useState(optionLines(field?.options ?? []))
  const [importance, setImportance] = useState<string>(field?.importance ?? 'none')
  const [fromStage, setFromStage] = useState(field?.required_from_stage ?? '')
  const [inAdd, setInAdd] = useState(field?.in_add_form ?? false)
  const [inDetail, setInDetail] = useState(field?.in_detail ?? true)
  const [formula, setFormula] = useState(field?.formula ?? '')
  const [hidden, setHidden] = useState<string[]>(field?.hidden_sets ?? [])
  const [readOnly, setReadOnly] = useState<string[]>(field?.read_only_sets ?? [])
  const [state, action, pending] = useKeptAction(saveCrmField, () =>
    field ? undefined : (setKey(''), setLabel(''), setDescription(''), setOptions(''), setFormula(''), setHidden([]), setReadOnly([])),
  )
  const f = m.fields
  const others = sets.filter((s) => s.kind !== 'admin')
  const picks = (name: string, value: string[], set: (v: string[]) => void, title: string) => (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={label}>{title}</legend>
      <div className="flex flex-wrap gap-x-[14px] gap-y-[6px]">
        {others.map((s) => (
          <label key={s.id} className="flex items-center gap-[6px] text-[13px]">
            <input type="checkbox" name={name} value={s.id} checked={value.includes(s.id)} onChange={(e) => set(e.target.checked ? [...value, s.id] : value.filter((x) => x !== s.id))} />
            {s.name}
          </label>
        ))}
      </div>
    </fieldset>
  )

  return (
    <form action={action} className="flex flex-col gap-[12px]">
      {field ? <input type="hidden" name="id" value={field.id} /> : null}
      {field?.version !== undefined ? <input type="hidden" name="version" value={field.version} /> : null}
      <input type="hidden" name="entity" value={entity} />
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <label className="block">
          <span className={label}>{f.label}</span>
          <input name="label" value={labelText} onChange={(e) => setLabel(e.target.value)} required maxLength={80} className={input} />
        </label>
        <label className="block">
          <span className={label}>{f.key}</span>
          <input
            name="key"
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase())}
            readOnly={Boolean(field)}
            required={!field}
            pattern="[a-z][a-z0-9_]{1,40}"
            maxLength={41}
            className={`${input} font-mono ${field ? 'text-mut' : ''}`}
          />
          {field ? null : <span className={hint}>{f.keyHint}</span>}
        </label>
        <label className="block">
          <span className={label}>{f.type}</span>
          <select name="type" value={type} onChange={(e) => setType(e.target.value as FieldType)} className={input}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {m.types[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>{f.group}</span>
          <select name="group_id" value={group} onChange={(e) => setGroup(e.target.value)} className={input}>
            <option value="">{m.groups.none}</option>
            {groups
              .filter((g) => !g.archived || g.id === group)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>{f.sort}</span>
          <input name="sort" type="number" value={sort} onChange={(e) => setSort(e.target.value)} className={input} />
        </label>
      </div>
      <label className="block">
        <span className={label}>{f.description}</span>
        <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} className={`${input} h-auto py-[8px]`} />
        <span className={hint}>{f.descriptionHint}</span>
      </label>
      {OPTION_TYPES.includes(type) ? (
        <label className="block">
          <span className={label}>{f.options}</span>
          <textarea name="options" value={options} onChange={(e) => setOptions(e.target.value)} rows={Math.min(12, Math.max(3, options.split('\n').length + 1))} className={`${input} h-auto py-[8px] font-mono text-[12.5px]`} />
          <span className={hint}>{f.optionsHint}</span>
        </label>
      ) : null}
      {NUMERIC_TYPES.includes(type) ? (
        <label className="block">
          <span className={label}>{f.formula}</span>
          <input name="formula" value={formula} onChange={(e) => setFormula(e.target.value)} maxLength={500} className={`${input} font-mono text-[12.5px]`} />
          <span className={hint}>{f.formulaHint}</span>
        </label>
      ) : null}
      <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <label className="block">
          <span className={label}>{f.importance}</span>
          <select name="importance" value={importance} onChange={(e) => setImportance(e.target.value)} className={input}>
            {IMPORTANCES.map((i) => (
              <option key={i} value={i}>
                {m.importance[i]}
              </option>
            ))}
          </select>
          <span className={hint}>{f.importanceHint}</span>
        </label>
        {entity === 'company' && importance === 'required' ? (
          <label className="block">
            <span className={label}>{f.fromStage}</span>
            <select name="required_from_stage" value={fromStage} onChange={(e) => setFromStage(e.target.value)} className={input}>
              <option value="">{f.anyStage}</option>
              {stages.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-[18px] gap-y-[6px]">
        <label className="flex items-center gap-[6px] text-[13px]">
          <input type="checkbox" name="in_add_form" checked={inAdd} onChange={(e) => setInAdd(e.target.checked)} />
          {f.inAddForm}
        </label>
        <label className="flex items-center gap-[6px] text-[13px]">
          <input type="checkbox" name="in_detail" checked={inDetail} onChange={(e) => setInDetail(e.target.checked)} />
          {f.inDetail}
        </label>
      </div>
      {others.length ? (
        <div className="flex flex-col gap-[8px] rounded-ctl border border-line px-[12px] py-[10px]">
          {picks('hidden_sets', hidden, (v) => (setHidden(v), setReadOnly(readOnly.filter((x) => !v.includes(x)))), f.hidden)}
          {picks('read_only_sets', readOnly.filter((x) => !hidden.includes(x)), setReadOnly, f.readOnly)}
          <span className="text-[12px] text-mut">{f.accessHint}</span>
        </div>
      ) : null}
      {reasonRequired ? <Reason common={common} required /> : null}
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" tone={field ? 'quiet' : undefined} disabled={pending}>
          {pending ? common.saving : field ? f.save : f.add}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
    </form>
  )
}

/** Archive a field or a group, or bring it back */
export function ArchiveForm({
  kind,
  id,
  archived,
  m,
  common,
  reasonRequired,
}: {
  kind: 'field' | 'group'
  id: string
  archived: boolean
  m: FieldMessages
  common: Common
  reasonRequired: boolean
}) {
  const [state, action, pending] = useKeptAction(kind === 'field' ? archiveCrmField : archiveCrmFieldGroup, () => undefined)
  const words = kind === 'field' ? m.fields : m.groups
  return (
    <form action={action} className="flex flex-wrap items-end gap-[10px]">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
      {reasonRequired ? <Reason common={common} required /> : null}
      <Button type="submit" size="tiny" tone="ghost" disabled={pending}>
        {pending ? common.saving : archived ? words.unarchive : words.archive}
      </Button>
      <Outcome state={state} problems={m.problem} done={common.done} />
    </form>
  )
}

/** Add a group (no group), or rename and re-sort one */
export function GroupForm({ group, entity, m, common, reasonRequired }: { group?: FieldGroup; entity: FieldEntity; m: FieldMessages; common: Common; reasonRequired: boolean }) {
  const [name, setName] = useState(group?.name ?? '')
  const [sort, setSort] = useState(String(group?.sort ?? 0))
  const [state, action, pending] = useKeptAction(saveCrmFieldGroup, () => (group ? undefined : (setName(''), setSort('0'))))
  return (
    <form action={action} className="flex flex-col gap-[10px]">
      {group ? <input type="hidden" name="id" value={group.id} /> : null}
      <input type="hidden" name="entity" value={entity} />
      <div className="grid items-end gap-[10px] [grid-template-columns:minmax(0,1fr)_90px]">
        <label className="block">
          <span className={label}>{m.groups.name}</span>
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={input} />
        </label>
        <label className="block">
          <span className={label}>{m.groups.sort}</span>
          <input name="sort" type="number" value={sort} onChange={(e) => setSort(e.target.value)} className={input} />
        </label>
      </div>
      {reasonRequired ? <Reason common={common} required /> : null}
      <span className="flex flex-wrap items-center gap-[10px]">
        <Button type="submit" size="sm" tone="quiet" disabled={pending}>
          {pending ? common.saving : group ? m.groups.save : m.groups.add}
        </Button>
        <Outcome state={state} problems={m.problem} done={common.done} />
      </span>
    </form>
  )
}
