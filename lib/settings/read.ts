import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Everything Oppsett reads.
 *
 * All of it goes through ordinary RLS rather than through an RPC, because none of it is
 * a result. A company's registry record, its sites, its roster and its groups are facts
 * about an organisation; the k gate exists to protect what people *answered*, and no
 * query in this file touches `app.responses`, `app.answers` or `app.response_comments`.
 * The one number here that comes from a round — how many answered in each group — is
 * counted from `app.invitations`, which records that a person was asked and that they
 * came back, and never what they said.
 *
 * **On the roster being readable at all.** `employee_read` admits any member of the
 * organisation, so a verneombud or an avdelingsleder can list every colleague's name and
 * e-mail. That is a deliberate decision, taken with the user rather than inherited by
 * accident — see D-30. It is worth being precise about what it does and does not mean:
 * knowing who works here has never been the thing this product protects. What it protects
 * is the join between a person and an answer, and that join does not exist as a column.
 */

const OrgRow = z.object({
  id: z.string(),
  name: z.string(),
  org_number: z.string().nullable(),
  employee_count: z.coerce.number(),
  threshold: z.coerce.number(),
  default_lang: z.string().nullable(),
  law_mode: z.boolean(),
  bht_name: z.string().nullable(),
  registry_fetched_at: z.string().nullable(),
  registry_form_code: z.string().nullable(),
  registry_form_label: z.string().nullable(),
  registry_nace_code: z.string().nullable(),
  registry_nace_label: z.string().nullable(),
  registry_registered_on: z.string().nullable(),
  registry_address: z.string().nullable(),
  registry_municipality: z.string().nullable(),
  registry_municipality_no: z.string().nullable(),
  registry_employees: z.coerce.number().nullable(),
  registry_vat: z.boolean().nullable(),
})

export type CompanyRow = z.infer<typeof OrgRow>

const COMPANY_COLUMNS =
  'id, name, org_number, employee_count, threshold, default_lang, law_mode, bht_name, ' +
  'registry_fetched_at, registry_form_code, registry_form_label, registry_nace_code, ' +
  'registry_nace_label, registry_registered_on, registry_address, registry_municipality, ' +
  'registry_municipality_no, registry_employees, registry_vat'

export async function getCompany(): Promise<CompanyRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('organizations')
    .select(COMPANY_COLUMNS)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  const parsed = OrgRow.safeParse(data)
  return parsed.success ? parsed.data : null
}

/** A place, never a person: `headcount` is stated about a site and derived from nothing. */
const LocationRow = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  headcount: z.coerce.number(),
})

export type Location = z.infer<typeof LocationRow>

export async function getLocations(): Promise<Location[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('locations')
    .select('id, name, address, headcount')
    .order('sort_order')

  if (error || !data) return []
  const parsed = z.array(LocationRow).safeParse(data)
  return parsed.success ? parsed.data : []
}

/**
 * The register.
 *
 * `duty_role` is a statutory position and not access — migration 0021 says so on the
 * column itself. The screen labels it "Rolle" because the design does, and the access
 * matrix on the neighbouring tab is the thing that explains what actually grants a read.
 */
export const DUTY_ROLES = [
  'daglig_leder',
  'avdelingsleder',
  'verneombud',
  'tillitsvalgt',
] as const
export type DutyRole = (typeof DUTY_ROLES)[number]

const RosterRow = z.object({
  id: z.string(),
  full_name: z.string(),
  email: z.string().nullable(),
  active: z.boolean(),
  group_id: z.string().nullable(),
  duty_role: z.enum(DUTY_ROLES).nullable(),
  created_at: z.string(),
})

export interface RosterPerson {
  id: string
  name: string
  email: string | null
  active: boolean
  groupId: string | null
  dutyRole: DutyRole | null
  createdAt: string
}

export async function getRoster(): Promise<RosterPerson[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('employees')
    .select('id, full_name, email, active, group_id, duty_role, created_at')
    .order('full_name')

  if (error || !data) return []
  const parsed = z.array(RosterRow).safeParse(data)
  if (!parsed.success) return []
  return parsed.data.map((r) => ({
    id: r.id,
    name: r.full_name,
    email: r.email,
    active: r.active,
    groupId: r.group_id,
    dutyRole: r.duty_role,
    createdAt: r.created_at,
  }))
}

/**
 * Each group's headcount, and how many of them answered the last round that closed.
 *
 * The second number decides whether the design prints "Vises alene" or "Slås sammen", so
 * it has to be the real count and not the headcount. It is counted from `app.invitations`
 * — a row that says a person was asked and whether they came back. That is participation,
 * not a result: it carries no answer, and the group's *index* still goes through the
 * k-gated RPC like every other cell.
 *
 * A group with no invitation in that round returns 0 rather than being absent, because
 * "nobody answered" and "the group did not exist yet" look identical on the screen
 * otherwise, and only one of them is a reason to merge it.
 */
const GroupStatRow = z.object({
  id: z.string(),
  name: z.string(),
  headcount: z.coerce.number(),
  answered: z.coerce.number(),
})

export type GroupStat = z.infer<typeof GroupStatRow>

export async function getGroupStats(roundId: string | null): Promise<GroupStat[]> {
  const supabase = await createClient()

  const [groups, employees, invitations] = await Promise.all([
    supabase.schema('app').from('groups').select('id, name').order('sort_order'),
    supabase.schema('app').from('employees').select('id, group_id').eq('active', true),
    roundId
      ? supabase
          .schema('app')
          .from('invitations')
          .select('employee_id, responded_at')
          .eq('round_id', roundId)
      : Promise.resolve({ data: [], error: null }),
  ])

  const g = z.array(z.object({ id: z.string(), name: z.string() })).safeParse(groups.data)
  if (!g.success) return []

  const e = z
    .array(z.object({ id: z.string(), group_id: z.string().nullable() }))
    .safeParse(employees.data)
  const i = z
    .array(z.object({ employee_id: z.string(), responded_at: z.string().nullable() }))
    .safeParse(invitations.data)

  const groupOf = new Map((e.success ? e.data : []).map((r) => [r.id, r.group_id]))
  const heads = new Map<string, number>()
  for (const r of e.success ? e.data : []) {
    if (r.group_id) heads.set(r.group_id, (heads.get(r.group_id) ?? 0) + 1)
  }

  const answered = new Map<string, number>()
  for (const r of i.success ? i.data : []) {
    if (r.responded_at === null) continue
    const gid = groupOf.get(r.employee_id)
    if (gid) answered.set(gid, (answered.get(gid) ?? 0) + 1)
  }

  return g.data.map((row) => ({
    id: row.id,
    name: row.name,
    headcount: heads.get(row.id) ?? 0,
    answered: answered.get(row.id) ?? 0,
  }))
}

/**
 * How many of the register have a mobile number.
 *
 * Counted with `head: true`, so PostgREST returns the count and not the rows. A phone
 * number is the most directly identifying thing in the register and nothing on this screen
 * needs to print one — the only question the Integrasjoner tab asks is whether SMS would
 * reach people, and that is a number, not a list.
 */
export async function countWithPhone(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .schema('app')
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)
    .not('phone', 'is', null)

  return error || count === null ? 0 : count
}
