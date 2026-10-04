import { z } from 'zod'

/**
 * CRM custom fields (0197, D-222; CUS-01 to CUS-04): the types, the registry's shape and how a value reads on a page.
 * A pure module, so the forms in the browser and the readers on the server share one definition; the database
 * checks every value again (app.crm_field_value).
 */
export const FIELD_TYPES = [
  'text',
  'large_text',
  'single_option',
  'multiple_options',
  'autocomplete',
  'number',
  'monetary',
  'user',
  'organization',
  'person',
  'phone',
  'time',
  'time_range',
  'date',
  'date_range',
  'address',
] as const
export type FieldType = (typeof FIELD_TYPES)[number]
export const FIELD_ENTITIES = ['company', 'contact'] as const
export type FieldEntity = (typeof FIELD_ENTITIES)[number]
export const OPTION_TYPES: readonly FieldType[] = ['single_option', 'multiple_options', 'autocomplete']
export const NUMERIC_TYPES: readonly FieldType[] = ['number', 'monetary']
export const IMPORTANCES = ['none', 'important', 'required'] as const
export const KEY = /^[a-z][a-z0-9_]{1,40}$/

const Option = z.object({ key: z.string(), label: z.string() })
export type FieldOption = z.infer<typeof Option>

export const FieldDef = z.object({
  id: z.string().uuid(),
  entity: z.enum(FIELD_ENTITIES),
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  type: z.enum(FIELD_TYPES),
  group_id: z.string().uuid().nullable(),
  sort: z.coerce.number(),
  options: z.array(Option),
  importance: z.enum(IMPORTANCES),
  required_from_stage: z.string().nullable(),
  in_add_form: z.boolean(),
  in_detail: z.boolean(),
  computed: z.boolean(),
  access: z.enum(['read', 'write', 'hidden']),
  // for the CRM settings' holders only
  formula: z.string().nullable().optional(),
  hidden_sets: z.array(z.string().uuid()).optional(),
  read_only_sets: z.array(z.string().uuid()).optional(),
  version: z.coerce.number().optional(),
  archived: z.boolean().optional(),
})
export type FieldDef = z.infer<typeof FieldDef>

export const FieldGroup = z.object({
  id: z.string().uuid(),
  entity: z.enum(FIELD_ENTITIES),
  name: z.string(),
  sort: z.coerce.number(),
  archived: z.boolean(),
})
export type FieldGroup = z.infer<typeof FieldGroup>

/** The fields an add form shows: those marked for it, and every required one (it could not be saved without them) */
export const addFormFields = (fields: FieldDef[]) => fields.filter((f) => f.in_add_form || f.importance === 'required')

/** A record's custom values, keyed by field key, and the names behind its references (0197) */
export const Custom = z.record(z.string(), z.unknown())
export const CustomRefs = z.record(z.string(), z.string())

// ---------------------------------------------------------------- filters
export const CONDITION_OPS = ['contains', 'eq', 'in', 'any', 'gte', 'lte', 'empty', 'not_empty'] as const
export type ConditionOp = (typeof CONDITION_OPS)[number]
export const Condition = z
  .object({ key: z.string().regex(KEY), op: z.enum(CONDITION_OPS), value: z.unknown().optional() })
  .strict()
export type Condition = z.infer<typeof Condition>
export const Conditions = z.array(Condition).max(20)

/** The operators a type has, as app.crm_conditions_ok allows them */
export function opsFor(type: FieldType): ConditionOp[] {
  switch (type) {
    case 'text':
    case 'large_text':
    case 'autocomplete':
    case 'phone':
      return ['contains', 'eq', 'empty', 'not_empty']
    case 'single_option':
      return ['in', 'empty', 'not_empty']
    case 'multiple_options':
      return ['any', 'empty', 'not_empty']
    case 'number':
    case 'monetary':
    case 'date':
      return ['eq', 'gte', 'lte', 'empty', 'not_empty']
    default:
      return ['empty', 'not_empty']
  }
}

/** A condition's value from what a person typed or picked, in the form the database compares */
export function conditionValue(f: FieldDef, op: ConditionOp, raw: string): unknown {
  if (op === 'empty' || op === 'not_empty') return undefined
  if (op === 'in' || op === 'any') return raw ? [raw] : undefined
  if (f.type === 'number' || f.type === 'monetary') {
    const n = Number(raw.replace(/\s/g, '').replace(',', '.'))
    return raw.trim() && Number.isFinite(n) ? n : undefined
  }
  return raw.trim() || undefined
}

/** A condition as a list shows it — «Region is Oslo» — with the field's and its options' labels */
export function conditionText(c: Condition, fields: FieldDef[], ops: Record<ConditionOp, string>): string {
  const f = fields.find((x) => x.key === c.key)
  const label = f?.label ?? c.key
  if (c.op === 'empty' || c.op === 'not_empty') return `${label} ${ops[c.op]}`
  const values = (Array.isArray(c.value) ? c.value : [c.value]).map((v) => (f ? optionLabel(f, v) : String(v)))
  return `${label} ${ops[c.op]} ${values.join(', ')}`
}

// ---------------------------------------------------------------- values on a page
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
function optionLabel(f: FieldDef, k: unknown) {
  return f.options.find((o) => o.key === k)?.label ?? String(k)
}
const kroner = (n: number) => `${n.toLocaleString('nb-NO', { maximumFractionDigits: 2 })} kr`

/**
 * A stored value as a page shows it: option labels, kroner, dates, the names behind references (an organization
 * the viewer may not see has no name and shows as «—»). Empty: null.
 */
export function shownValue(f: FieldDef, v: unknown, refs: Record<string, string>, day: (iso: string) => string): string | null {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return null
  switch (f.type) {
    case 'single_option':
      return optionLabel(f, v)
    case 'multiple_options':
      return Array.isArray(v) ? v.map((k) => optionLabel(f, k)).join(', ') : String(v)
    case 'number':
      return typeof v === 'number' ? v.toLocaleString('nb-NO', { maximumFractionDigits: 6 }) : String(v)
    case 'monetary':
      return isObj(v) && typeof v.amount === 'number' ? kroner(v.amount) : String(v)
    case 'user':
    case 'organization':
    case 'person':
      return refs[String(v)] ?? '—'
    case 'date':
      return day(String(v))
    case 'time_range':
      return isObj(v) ? `${String(v.from ?? '')}–${String(v.to ?? '')}` : String(v)
    case 'date_range':
      return isObj(v) ? `${day(String(v.from ?? ''))} – ${day(String(v.to ?? ''))}` : String(v)
    case 'address':
      return isObj(v)
        ? [v.street, [v.postcode, v.city].filter(Boolean).join(' '), v.country].filter((x) => typeof x === 'string' && x).join(', ')
        : String(v)
    default:
      return String(v)
  }
}

/** Option lines as an admin types them — «label» or «key | label», one per line — made into options */
export function parseOptions(text: string): FieldOption[] {
  const fold = (s: string) =>
    s
      .toLowerCase()
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'o')
      .replace(/å/g, 'a')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const bar = line.indexOf('|')
      const label = (bar >= 0 ? line.slice(bar + 1) : line).trim()
      const key = bar >= 0 ? line.slice(0, bar).trim() : fold(label)
      return { key, label }
    })
}

/** Options as lines again, for editing */
export const optionLines = (options: FieldOption[]) => options.map((o) => `${o.key} | ${o.label}`).join('\n')
