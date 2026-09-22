'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { lookupOrgNumber } from '@/lib/brreg/lookup'
import { DUTY_ROLES } from '@/lib/settings/read'

/**
 * Writing Oppsett.
 *
 * Every write here lands on a table whose write policy is `has_role(daglig_leder)`, and
 * none of these functions re-checks the role. That is deliberate and is the pattern the
 * rest of the product uses: the policy is the rule, a caller without it updates zero rows,
 * and a second check in TypeScript is a second rule that can drift from the first.
 *
 * `threshold` is the exception worth naming, because it looks like a security control and
 * is not one. What withholds a result is `app.k_threshold()`, floored at `app.k_min()`,
 * which is a *function* returning 5. This column can only raise the floor, never lower it,
 * and the database refuses anything outside 5..10 whatever is posted here.
 */

export type SettingsResult = { ok: true } | { ok: false; problem: string }

const orgId = async () => {
  const supabase = await createClient()
  const { data } = await supabase
    .schema('app')
    .from('organizations')
    .select('id')
    .limit(1)
    .maybeSingle()
  const parsed = z.object({ id: z.string() }).safeParse(data)
  return parsed.success ? parsed.data.id : null
}

const revalidate = () => {
  revalidatePath('/oppsett')
  revalidatePath('/innsikt')
  revalidatePath('/rapport')
}

/* ------------------------------------------------------------------ Selskap */

/**
 * Look the number up, and store what came back.
 *
 * The button writes. That is the honest shape: the design's fact table is nine rows of
 * register data sitting under a "Hent fra Brønnøysund" button, and a table that showed
 * facts the database did not hold would go blank on the next render. What is fetched is
 * what is stored, together with the moment it was fetched.
 *
 * The register's own headcount is stored beside the organisation's, never over it.
 * `employee_count` is the denominator of every response rate in the product, and
 * Enhetsregisteret counts something subtly different — registered employment, which lags
 * and which includes people this measurement would not ask. Overwriting it from a register
 * would move "28 av 34 · 82 %" without anybody deciding to.
 */
export async function fetchRegistry(formData: FormData): Promise<SettingsResult> {
  const parsed = z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{9}$/))
    .safeParse(formData.get('orgNumber') ?? '')
  if (!parsed.success) return { ok: false, problem: 'invalid_org_number' }

  const result = await lookupOrgNumber(parsed.data)
  if (!result.ok) return { ok: false, problem: result.problem }

  const id = await orgId()
  if (!id) return { ok: false, problem: 'denied' }

  const f = result.facts
  const supabase = await createClient()
  const { error } = await supabase
    .schema('app')
    .from('organizations')
    .update({
      name: f.name,
      org_number: f.orgNumber,
      registry_fetched_at: new Date().toISOString(),
      registry_form_code: f.formCode,
      registry_form_label: f.formLabel,
      registry_nace_code: f.naceCode,
      registry_nace_label: f.naceLabel,
      registry_registered_on: f.registeredOn,
      registry_address: f.address,
      registry_municipality: f.municipality,
      registry_municipality_no: f.municipalityNo,
      registry_employees: f.employees,
      registry_vat: f.vat,
    })
    .eq('id', id)

  if (error) return { ok: false, problem: 'denied' }
  revalidate()
  return { ok: true }
}

/**
 * Three narrow writes rather than one wide one.
 *
 * A single `saveCompany(lang, lawMode, bht)` would need every control to post the other
 * two, and the first one to post a stale copy would quietly undo somebody else's change.
 * Each control writes its own column.
 */
export async function saveLanguage(formData: FormData): Promise<SettingsResult> {
  const parsed = z.enum(['no', 'en']).safeParse(formData.get('lang'))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  return updateOrg({ default_lang: parsed.data })
}

export async function saveLawMode(formData: FormData): Promise<SettingsResult> {
  const parsed = z.enum(['on', 'off']).safeParse(formData.get('lawMode'))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  return updateOrg({ law_mode: parsed.data === 'on' })
}

export async function saveBht(formData: FormData): Promise<SettingsResult> {
  const parsed = z.string().trim().max(120).safeParse(String(formData.get('bhtName') ?? ''))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  // the column refuses a blank string, so an empty field means "no BHT recorded"
  return updateOrg({ bht_name: parsed.data === '' ? null : parsed.data })
}

async function updateOrg(patch: Record<string, unknown>): Promise<SettingsResult> {
  const id = await orgId()
  if (!id) return { ok: false, problem: 'denied' }

  const supabase = await createClient()
  const { error } = await supabase.schema('app').from('organizations').update(patch).eq('id', id)
  if (error) return { ok: false, problem: 'denied' }

  revalidate()
  return { ok: true }
}

/**
 * The work-environment year's start month is `app.year_wheels.baseline_month` and not a
 * column on the organisation — the design's own note says the årshjul follows it, and two
 * columns would be two truths. If no wheel exists there is nothing to move, and saying so
 * is better than silently creating one the organisation never switched on.
 */
export async function saveBaselineMonth(formData: FormData): Promise<SettingsResult> {
  const parsed = z.coerce.number().int().min(1).max(12).safeParse(formData.get('month'))
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const supabase = await createClient()
  const { data } = await supabase
    .schema('app')
    .from('year_wheels')
    .select('id')
    .limit(1)
    .maybeSingle()

  const wheel = z.object({ id: z.string() }).safeParse(data)
  if (!wheel.success) return { ok: false, problem: 'no_wheel' }

  const { error } = await supabase
    .schema('app')
    .from('year_wheels')
    .update({ baseline_month: parsed.data })
    .eq('id', wheel.data.id)

  if (error) return { ok: false, problem: 'denied' }
  revalidate()
  revalidatePath('/arshjulet')
  return { ok: true }
}

const NewLocation = z.object({
  name: z.string().trim().min(1).max(80),
  address: z.string().trim().max(160),
  headcount: z.number().int().min(0).max(100_000),
})

export async function addLocation(formData: FormData): Promise<SettingsResult> {
  const parsed = NewLocation.safeParse({
    name: String(formData.get('name') ?? ''),
    address: String(formData.get('address') ?? ''),
    headcount: Number(formData.get('headcount') ?? 0),
  })
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const id = await orgId()
  if (!id) return { ok: false, problem: 'denied' }

  const supabase = await createClient()
  const { error } = await supabase
    .schema('app')
    .from('locations')
    .insert({
      org_id: id,
      name: parsed.data.name,
      address: parsed.data.address === '' ? null : parsed.data.address,
      headcount: parsed.data.headcount,
      sort_order: 99,
    })

  // the one constraint a person can hit by typing: two sites with the same name
  if (error) return { ok: false, problem: error.code === '23505' ? 'duplicate' : 'denied' }
  revalidate()
  return { ok: true }
}

export async function removeLocation(formData: FormData): Promise<SettingsResult> {
  const parsed = z.string().uuid().safeParse(formData.get('id'))
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.schema('app').from('locations').delete().eq('id', parsed.data)
  if (error) return { ok: false, problem: 'denied' }
  revalidate()
  return { ok: true }
}

/* ------------------------------------------------------------------ Ansatte */

const Person = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.union([z.literal(''), z.string().trim().email()]),
  groupId: z.union([z.literal(''), z.string().uuid()]),
})

export async function addEmployee(formData: FormData): Promise<SettingsResult> {
  const parsed = Person.safeParse({
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    groupId: String(formData.get('groupId') ?? ''),
  })
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const id = await orgId()
  if (!id) return { ok: false, problem: 'denied' }

  const supabase = await createClient()
  const { error } = await supabase.schema('app').from('employees').insert({
    org_id: id,
    full_name: parsed.data.name,
    email: parsed.data.email === '' ? null : parsed.data.email,
    group_id: parsed.data.groupId === '' ? null : parsed.data.groupId,
  })

  if (error) return { ok: false, problem: 'denied' }
  revalidate()
  return { ok: true }
}

/**
 * The paste-from-a-spreadsheet import.
 *
 * Parsing happens on the server even though the preview the user saw was parsed on the
 * client. The two use the same rules, but only one of them decides what is written, and
 * it is not the one running in a browser.
 *
 * A row with no group is imported without one rather than refused. The design says as
 * much — those people land in "Uten gruppe" and the register says how many — and refusing
 * the whole paste because one line is short is how a leader gives up and does it by hand.
 */
const MAX_ROWS = 2000

export type ImportResult =
  | { ok: true; written: number; skipped: number }
  | { ok: false; problem: string }

export async function importEmployees(formData: FormData): Promise<ImportResult> {
  const text = String(formData.get('rows') ?? '')
  if (text.trim() === '') return { ok: false, problem: 'empty' }

  const id = await orgId()
  if (!id) return { ok: false, problem: 'denied' }

  const supabase = await createClient()
  const { data: groupRows } = await supabase.schema('app').from('groups').select('id, name')
  const groups = z
    .array(z.object({ id: z.string(), name: z.string() }))
    .safeParse(groupRows ?? [])
  const byName = new Map(
    (groups.success ? groups.data : []).map((g) => [g.name.toLocaleLowerCase('no'), g.id]),
  )

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length > MAX_ROWS) return { ok: false, problem: 'too_many' }

  const rows: { org_id: string; full_name: string; email: string | null; group_id: string | null }[] =
    []
  let skipped = 0

  for (const [index, line] of lines.entries()) {
    const cells = line.split(/[\t;,]/).map((c) => c.trim())
    const name = cells[0] ?? ''
    // an optional header row, recognised the way the design recognises it
    if (index === 0 && /^(navn|name)$/i.test(name)) continue
    if (name === '') {
      skipped += 1
      continue
    }
    const email = cells[1] ?? ''
    const group = cells[2] ?? ''
    rows.push({
      org_id: id,
      full_name: name.slice(0, 120),
      email: email.includes('@') ? email : null,
      group_id: byName.get(group.toLocaleLowerCase('no')) ?? null,
    })
  }

  if (rows.length === 0) return { ok: false, problem: 'empty' }

  const { error } = await supabase.schema('app').from('employees').insert(rows)
  if (error) return { ok: false, problem: 'denied' }

  revalidate()
  return { ok: true, written: rows.length, skipped }
}

export async function setEmployeeGroup(formData: FormData): Promise<SettingsResult> {
  const parsed = z
    .object({ id: z.string().uuid(), groupId: z.union([z.literal(''), z.string().uuid()]) })
    .safeParse({ id: formData.get('id'), groupId: String(formData.get('groupId') ?? '') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase
    .schema('app')
    .from('employees')
    .update({ group_id: parsed.data.groupId === '' ? null : parsed.data.groupId })
    .eq('id', parsed.data.id)

  if (error) return { ok: false, problem: 'denied' }
  revalidate()
  return { ok: true }
}

/**
 * A duty, not a grant. Writing `verneombud` here records who holds the position the act
 * names; it does not give that person a single row they could not read before, because
 * nothing in any policy consults this column. Access is `app.memberships.role`.
 */
export async function setEmployeeDutyRole(formData: FormData): Promise<SettingsResult> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      dutyRole: z.union([z.literal(''), z.enum(DUTY_ROLES)]),
    })
    .safeParse({ id: formData.get('id'), dutyRole: String(formData.get('dutyRole') ?? '') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase
    .schema('app')
    .from('employees')
    .update({ duty_role: parsed.data.dutyRole === '' ? null : parsed.data.dutyRole })
    .eq('id', parsed.data.id)

  if (error) return { ok: false, problem: 'denied' }
  revalidate()
  return { ok: true }
}

/* ------------------------------------------------------------------ Grupper */

/**
 * The threshold may be raised, never lowered below the floor.
 *
 * The design offers 3 as a chip. The column refuses anything under 5 and `app.k_min()`
 * would override it even if it did not, so a 3 chip would be a control that appears to do
 * something and cannot. The screen offers what the database accepts. D-31.
 */
export async function setThreshold(formData: FormData): Promise<SettingsResult> {
  const parsed = z.coerce.number().int().min(5).max(10).safeParse(formData.get('threshold'))
  if (!parsed.success) return { ok: false, problem: 'invalid_threshold' }

  const id = await orgId()
  if (!id) return { ok: false, problem: 'denied' }

  const supabase = await createClient()
  const { error } = await supabase
    .schema('app')
    .from('organizations')
    .update({ threshold: parsed.data })
    .eq('id', id)

  if (error) return { ok: false, problem: 'denied' }
  revalidate()
  revalidatePath('/resultat')
  revalidatePath('/samtaler')
  return { ok: true }
}
