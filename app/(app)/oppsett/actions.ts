'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { LOCALES } from '@/lib/i18n/locales'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/org/current'
import { K_FLOOR, K_MAX } from '@/lib/org/threshold'
import { writeFailed } from '@/lib/supabase/write'
import { lookupOrgNumber } from '@/lib/brreg/lookup'
import { DUTY_ROLES } from '@/lib/settings/read'
import { normalizePhone } from '@/supabase/functions/_shared/sms'
import { parseCsv } from '@/lib/csv/parse'
import { INDUSTRY_SLUGS, industryForNace } from '@/content/industries/meta'

/**
 * Writing Oppsett.
 *
 * Every write here lands on a table whose write policy is `has_role(daglig_leder)`, and
 * none of these functions re-checks the role. That is deliberate and is the pattern the
 * rest of the product uses: the policy is the rule, a caller without it updates zero rows,
 * and a second check in TypeScript is a second rule that can drift from the first.
 *
 * `threshold` is the exception worth naming, because it looks like a security control and
 * is only half of one. A round takes the organisation's threshold while it is planned and keeps
 * it from the moment it opens (`app.rounds.k`, 0150), and what withholds a result is that
 * round's k, floored at `app.k_floor()` — a *function* returning 3. The database refuses
 * anything outside 3..10 whatever is posted here, and logs every change.
 */

export type SettingsResult = { ok: true } | { ok: false; problem: string }

/** Refuses rather than guesses when the caller is in more than one; see lib/org/current.ts. */
const orgId = getCurrentOrgId

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
  const { data: refreshed, error } = await supabase
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
    .select('id')

  if (writeFailed('refreshFromRegistry', error, refreshed)) return { ok: false, problem: 'denied' }
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
  const parsed = z.enum(LOCALES).safeParse(formData.get('lang'))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  return updateOrg({ default_lang: parsed.data })
}

export async function saveLawMode(formData: FormData): Promise<SettingsResult> {
  const parsed = z.enum(['on', 'off']).safeParse(formData.get('lawMode'))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  return updateOrg({ law_mode: parsed.data === 'on' })
}

/**
 * The name the product prints, where it differs from the register's — a trading name, or
 * the register's capitals. The Veiviser's "Navn" field (D-76); the column refuses blank.
 */
export async function saveOrgName(formData: FormData): Promise<SettingsResult> {
  const parsed = z.string().trim().min(1).max(120).safeParse(String(formData.get('name') ?? ''))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  return updateOrg({ name: parsed.data })
}

export async function saveBht(formData: FormData): Promise<SettingsResult> {
  const parsed = z.string().trim().max(120).safeParse(String(formData.get('bhtName') ?? ''))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  // the column refuses a blank string, so an empty field means "no BHT recorded"
  return updateOrg({ bht_name: parsed.data === '' ? null : parsed.data })
}

/**
 * «Bransje» (0091, D-139). Choosing what the NACE code suggests follows the code (`brreg`), so it
 * moves when the code does; anything else is the organisation's own (`manual`), kept when the code
 * changes, together with the suggestion it was chosen against so a later change can be offered.
 * The suggestion is worked out here from the stored code, never taken from the form.
 */
const IndustryChoice = z.union([z.literal('none'), z.enum(INDUSTRY_SLUGS)])

async function naceSuggestion(): Promise<string | null | undefined> {
  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from('organizations').select('registry_nace_code').limit(2)
  const parsed = z.array(z.object({ registry_nace_code: z.string().nullable() })).length(1).safeParse(data)
  if (error || !parsed.success) return undefined
  return industryForNace(parsed.data[0]!.registry_nace_code)?.slug ?? null
}

export async function saveIndustry(formData: FormData): Promise<SettingsResult> {
  const parsed = IndustryChoice.safeParse(formData.get('industry'))
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const suggested = await naceSuggestion()
  if (suggested === undefined) return { ok: false, problem: 'denied' }
  const choice = parsed.data === 'none' ? null : parsed.data
  return updateOrg(
    choice === suggested
      ? { industry_source: 'brreg', industry_key: null, industry_suggested: null }
      : { industry_source: 'manual', industry_key: choice, industry_suggested: suggested },
  )
}

/** «Behold»: the code suggests something new, and the organisation keeps its own choice. */
export async function keepIndustry(): Promise<SettingsResult> {
  const suggested = await naceSuggestion()
  if (suggested === undefined) return { ok: false, problem: 'denied' }
  return updateOrg({ industry_suggested: suggested })
}

async function updateOrg(patch: Record<string, unknown>): Promise<SettingsResult> {
  const id = await orgId()
  if (!id) return { ok: false, problem: 'denied' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('organizations')
    .update(patch)
    .eq('id', id)
    .select('id')
  if (writeFailed('updateOrg', error, data)) return { ok: false, problem: 'denied' }

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

  const { data: saved, error } = await supabase
    .schema('app')
    .from('year_wheels')
    .update({ baseline_month: parsed.data })
    .eq('id', wheel.data.id)
    .select('id')

  if (writeFailed('setBaselineMonth', error, saved)) return { ok: false, problem: 'denied' }
  revalidate()
  revalidatePath('/malinger')
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
  const { data, error } = await supabase
    .schema('app')
    .from('locations')
    .insert({
      org_id: id,
      name: parsed.data.name,
      address: parsed.data.address === '' ? null : parsed.data.address,
      headcount: parsed.data.headcount,
      sort_order: 99,
    })
    .select('id')

  // the one constraint a person can hit by typing: two sites with the same name
  if (error) return { ok: false, problem: error.code === '23505' ? 'duplicate' : 'denied' }
  if (writeFailed('addLocation', null, data)) return { ok: false, problem: 'denied' }
  revalidate()
  return { ok: true }
}

export async function removeLocation(formData: FormData): Promise<SettingsResult> {
  const parsed = z.string().uuid().safeParse(formData.get('id'))
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('locations')
    .delete()
    .eq('id', parsed.data)
    .select('id')
  if (writeFailed('removeLocation', error, data)) return { ok: false, problem: 'denied' }
  revalidate()
  return { ok: true }
}

/* ------------------------------------------------------------------ Ansatte */

const Person = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.union([z.literal(''), z.string().trim().email()]),
  groupId: z.union([z.literal(''), z.string().uuid()]),
  // what was typed; normalised below, and refused rather than guessed when unusable (D-66)
  phone: z.string().trim().max(40),
})

export async function addEmployee(formData: FormData): Promise<SettingsResult> {
  const parsed = Person.safeParse({
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    groupId: String(formData.get('groupId') ?? ''),
    phone: String(formData.get('phone') ?? ''),
  })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const phone = parsed.data.phone === '' ? null : normalizePhone(parsed.data.phone)
  if (parsed.data.phone !== '' && !phone) return { ok: false, problem: 'phone' }

  const id = await orgId()
  if (!id) return { ok: false, problem: 'denied' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('employees')
    .insert({
      org_id: id,
      full_name: parsed.data.name,
      email: parsed.data.email === '' ? null : parsed.data.email,
      group_id: parsed.data.groupId === '' ? null : parsed.data.groupId,
      phone,
    })
    .select('id')

  if (writeFailed('addEmployee', error, data)) return { ok: false, problem: 'denied' }
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
 *
 * Column E is the mobile number (D-66). A row whose e-mail already belongs to someone in
 * the register is not a new person: it gives that person their number, and nothing else
 * about them changes. That is how a register of 34 gets its numbers — paste the same sheet
 * again with the column added — without 34 duplicates. An unusable number is left out,
 * never guessed at.
 */
const MAX_ROWS = 2000
// 2000 rows of six columns with room to spare; a longer paste is refused before it is read
const MAX_CHARS = 1_000_000

export type ImportResult =
  | { ok: true; written: number; updated: number; skipped: number }
  | { ok: false; problem: string }

export async function importEmployees(formData: FormData): Promise<ImportResult> {
  const pasted = z.string().max(MAX_CHARS).safeParse(String(formData.get('rows') ?? ''))
  if (!pasted.success) return { ok: false, problem: 'too_many' }
  const text = pasted.data
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
  const { data: known } = await supabase.schema('app').from('employees').select('id, email').not('email', 'is', null)
  const existing = z.array(z.object({ id: z.string(), email: z.string() })).safeParse(known ?? [])
  const byEmail = new Map((existing.success ? existing.data : []).map((e) => [e.email.toLowerCase(), e.id]))
  const phoneUpdates: { id: string; phone: string | null; language: string | null }[] = []

  // quoted fields, a comma inside a name, CRLF and a byte-order mark: lib/csv/parse.ts
  const records = parseCsv(text)
  if (records.length > MAX_ROWS) return { ok: false, problem: 'too_many' }

  const rows: {
    org_id: string
    full_name: string
    email: string | null
    group_id: string | null
    phone: string | null
    language: string | null
  }[] = []
  let skipped = 0

  for (const [index, cells] of records.entries()) {
    // a quoted name may hold a line break; the register keeps a name on one line
    const name = (cells[0] ?? '').replace(/\s+/g, ' ')
    // an optional header row, recognised the way the design recognises it
    if (index === 0 && /^(navn|name)$/i.test(name)) continue
    if (name === '') {
      skipped += 1
      continue
    }
    const email = cells[1] ?? ''
    const group = cells[2] ?? ''
    const phone = normalizePhone(cells[4] ?? '')
    // column F, the employee's language (engagement P1.2, D-127): a default for their survey
    // and invitation where that language is offered, never a filter
    const language = languageOf(cells[5] ?? '')
    const already = email.includes('@') ? byEmail.get(email.toLowerCase()) : undefined
    if (already) {
      if (phone || language) phoneUpdates.push({ id: already, phone, language })
      else skipped += 1
      continue
    }
    rows.push({
      org_id: id,
      full_name: name.slice(0, 120),
      email: email.includes('@') ? email : null,
      group_id: byName.get(group.toLocaleLowerCase('no')) ?? null,
      phone,
      language,
    })
  }

  if (rows.length === 0 && phoneUpdates.length === 0) return { ok: false, problem: 'empty' }

  // numbers for people already in the register, one row each: RLS decides each update
  let updated = 0
  for (const u of phoneUpdates) {
    const { data: done, error } = await supabase
      .schema('app')
      .from('employees')
      .update({ ...(u.phone ? { phone: u.phone } : {}), ...(u.language ? { language: u.language } : {}) })
      .eq('id', u.id)
      .select('id')
    if (writeFailed('importEmployees', error, done)) return { ok: false, problem: 'denied' }
    updated += done.length
  }
  if (rows.length === 0) {
    revalidate()
    return { ok: true, written: 0, updated, skipped }
  }

  /*
   * The import reports what it wrote, not what it was given. `rows.length` is the number
   * of lines that parsed; `written.length` is the number the database accepted. They are
   * the same number whenever the policy admits the caller, and the screen should print the
   * second, because "34 ansatte lagt inn" over a refused insert is the failure this whole
   * helper exists to stop.
   */
  const { data: written, error } = await supabase
    .schema('app')
    .from('employees')
    .insert(rows)
    .select('id')
  if (writeFailed('importEmployees', error, written)) return { ok: false, problem: 'denied' }

  revalidate()
  return { ok: true, written: written.length, updated, skipped }
}

export async function setEmployeeGroup(formData: FormData): Promise<SettingsResult> {
  const parsed = z
    .object({ id: z.string().uuid(), groupId: z.union([z.literal(''), z.string().uuid()]) })
    .safeParse({ id: formData.get('id'), groupId: String(formData.get('groupId') ?? '') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('employees')
    .update({ group_id: parsed.data.groupId === '' ? null : parsed.data.groupId })
    .eq('id', parsed.data.id)
    .select('id')

  if (writeFailed('setEmployeeGroup', error, data)) return { ok: false, problem: 'denied' }
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
  const { data, error } = await supabase
    .schema('app')
    .from('employees')
    .update({ duty_role: parsed.data.dutyRole === '' ? null : parsed.data.dutyRole })
    .eq('id', parsed.data.id)
    .select('id')

  if (writeFailed('setEmployeeDutyRole', error, data)) return { ok: false, problem: 'denied' }
  revalidate()
  return { ok: true }
}

/* ------------------------------------------------------------------ Grupper */

/**
 * Creating and renaming a group (D-172). The write is the table's own, under 0026's
 * `group_admin_insert` / `group_admin_update`: the daglig leder of the organisation, nobody
 * else. What a policy cannot say is said by the table (0130): a name trimmed and 1..60
 * characters, one per organisation in any case — «salg» beside «Salg» is the duplicate the
 * import could not tell apart — and a renamed group's former names kept for comment masking.
 *
 * There is no delete. Results, round audiences and memberships are keyed by the group's id,
 * which is also why a rename is safe: a closed round's figures follow the group to its new name.
 */
const GroupName = z.string().trim().min(1).max(60)

const groupProblem = (code: string | undefined) =>
  code === '23505' ? 'duplicate' : code === '23514' ? 'invalid' : 'denied'

const revalidateGroups = () => {
  revalidate()
  revalidatePath('/malinger')
  revalidatePath('/resultater')
}

export async function createGroup(formData: FormData): Promise<SettingsResult> {
  const parsed = GroupName.safeParse(String(formData.get('name') ?? ''))
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const id = await orgId()
  if (!id) return { ok: false, problem: 'denied' }

  const supabase = await createClient()
  // last in the list: after the highest sort_order the organisation has
  const { data: last } = await supabase
    .schema('app')
    .from('groups')
    .select('sort_order')
    .eq('org_id', id)
    .order('sort_order', { ascending: false })
    .limit(1)
  const order = z.array(z.object({ sort_order: z.number().int() })).safeParse(last ?? [])
  const next = (order.success ? (order.data[0]?.sort_order ?? 0) : 0) + 1

  const { data, error } = await supabase
    .schema('app')
    .from('groups')
    .insert({ org_id: id, name: parsed.data, sort_order: next })
    .select('id')
  if (error) return { ok: false, problem: groupProblem(error.code) }
  if (writeFailed('createGroup', null, data)) return { ok: false, problem: 'denied' }
  revalidateGroups()
  return { ok: true }
}

export async function renameGroup(formData: FormData): Promise<SettingsResult> {
  const parsed = z
    .object({ id: z.string().uuid(), name: GroupName })
    .safeParse({ id: formData.get('id'), name: String(formData.get('name') ?? '') })
  if (!parsed.success) return { ok: false, problem: 'invalid' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('groups')
    .update({ name: parsed.data.name })
    .eq('id', parsed.data.id)
    .select('id')
  if (error) return { ok: false, problem: groupProblem(error.code) }
  if (writeFailed('renameGroup', null, data)) return { ok: false, problem: 'denied' }
  revalidateGroups()
  return { ok: true }
}

/**
 * The threshold: 5 by default and strongly recommended, down to 3 for small teams, up to 10
 * (D-198). The screen warns before it saves a 3 or a 4 (ThresholdPicker, the wizard).
 *
 * The change applies to the rounds that have not opened; a round that has opened keeps the
 * threshold its respondents were shown (0150). The database logs who changed it, from what to
 * what (app.survey_defaults_log, read by Målinger › Innstillinger).
 */
export async function setThreshold(formData: FormData): Promise<SettingsResult> {
  const parsed = z.coerce.number().int().min(K_FLOOR).max(K_MAX).safeParse(formData.get('threshold'))
  if (!parsed.success) return { ok: false, problem: 'invalid_threshold' }

  const id = await orgId()
  if (!id) return { ok: false, problem: 'denied' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('organizations')
    .update({ threshold: parsed.data })
    .eq('id', id)
    .select('id')

  if (writeFailed('setThreshold', error, data)) return { ok: false, problem: 'denied' }
  revalidate()
  revalidatePath('/resultater')
  revalidatePath('/kommentarer')
  // the change log, and the planned rounds that now carry the new threshold
  revalidatePath('/malinger')
  revalidatePath('/maleoppsett')
  return { ok: true }
}

/**
 * A language as a spreadsheet writes it: a code (no, nb, nn, en, pl, lt) or the language's own
 * name, in any case. Anything else is no language, and the employee meets bokmål.
 */
function languageOf(cell: string): 'no' | 'en' | 'pl' | 'lt' | null {
  const v = cell.trim().toLowerCase()
  if (['no', 'nb', 'nn', 'norsk', 'bokmål', 'bokmal', 'nynorsk', 'norwegian'].includes(v)) return 'no'
  if (['en', 'english', 'engelsk'].includes(v)) return 'en'
  if (['pl', 'polski', 'polsk', 'polish'].includes(v)) return 'pl'
  if (['lt', 'lietuvių', 'lietuviu', 'litauisk', 'lithuanian'].includes(v)) return 'lt'
  return null
}
