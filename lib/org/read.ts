import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * The organisation.
 *
 * Four columns, all of them printed on the statutory report's front matter: the legal
 * name, the organisation number Arbeidstilsynet identifies the undertaking by, the
 * headcount the response rate is a fraction of, and the privacy threshold — which is
 * read here for display only. What results are actually withheld by is
 * `app.k_threshold()`, floored at `app.k_min()`, and no screen may substitute this
 * column for it.
 */
const OrgRow = z.object({
  id: z.string(),
  name: z.string(),
  org_number: z.string().nullable(),
  employee_count: z.coerce.number(),
  threshold: z.coerce.number(),
})

export type Organization = z.infer<typeof OrgRow>

/**
 * Memoised for the length of one request. P2 in docs/CODE_REVIEW_2026-09-23.md.
 *
 * `/rapport` calls fifteen read functions, two of them `getResultsSummary` explicitly, and
 * `getMeasureEffects` then called it again for every round it found — so the most expensive
 * aggregation in the product ran three to five times for the same rounds in a single
 * render, returning identical results each time. Measured in the database on the design
 * fixture: `results_summary` 12.8 ms warm, 37.8 ms cold, over 1 559 buffers.
 *
 * React's `cache()` is per-request and argument-addressable: one render pass makes one call
 * per distinct argument, and nothing survives into the next request, so there is no
 * staleness to reason about. It is not a data cache and must not be confused with one — a
 * second page view recomputes everything.
 */
export const getOrganization = cache(async (): Promise<Organization | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('organizations')
    .select('id, name, org_number, employee_count, threshold')
    .limit(1)
    .maybeSingle()

  if (readFailed('getOrganization', error, data)) return null
  const parsed = OrgRow.safeParse(data)
  return parsed.success ? parsed.data : null
})

/**
 * "924118742" -> "924 118 742", the grouping the design prints. Presentation, so it is
 * done here rather than stored that way; anything that is not nine digits is printed
 * as it was entered rather than mangled into a shape it does not have.
 */
export function formatOrgNumber(orgNumber: string | null): string | null {
  if (!orgNumber) return null
  const digits = orgNumber.replace(/\s/g, '')
  return /^\d{9}$/.test(digits) ? digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : orgNumber
}

/**
 * The departments, and the people who could own a measure.
 *
 * Both are ordinary org-scoped reads through RLS: `group_read` and `employee_read`
 * admit any member of the organisation. Neither has anything to do with a response —
 * an employee row is who works here, not who answered, and the two are never joined,
 * which is the whole reason app.responses carries no employee at all.
 */
const GroupRow = z.object({ id: z.string(), name: z.string() })

export type Group = z.infer<typeof GroupRow>

export const getGroups = cache(async (): Promise<Group[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('groups')
    .select('id, name')
    .order('sort_order')

  if (readFailed('getGroups', error, data)) return []
  const parsed = z.array(GroupRow).safeParse(data)
  return parsed.success ? parsed.data : []
})

const EmployeeRow = z.object({ id: z.string(), full_name: z.string() })

export interface Person {
  id: string
  name: string
}

/** Only the people still employed: a measure handed to someone who has left is not a plan. */
export const getEmployees = cache(async (): Promise<Person[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('employees')
    .select('id, full_name')
    .eq('active', true)
    .order('full_name')

  if (readFailed('getEmployees', error, data)) return []
  const parsed = z.array(EmployeeRow).safeParse(data)
  if (parseFailed('getEmployees', parsed)) return []
  return parsed.data.map((e) => ({ id: e.id, name: e.full_name }))
})

/**
 * The signed-in person's role in this organisation.
 *
 * The design draws this as a dropdown the viewer changes — a prototype's way of
 * demonstrating three roles on one screen. A role is not a preference: it is what the
 * organisation granted, `app.memberships.role`, and every policy in the schema is
 * already keyed off it through `app.has_role`. So it is read, not chosen, and a viewer
 * who picked "Daglig leder" from a menu would still be refused by the database. D-06's
 * substitution, in the other direction: the honest control here is no control.
 *
 * `membership_read` admits any member of the organisation, so the filter on the user is
 * what narrows it to the viewer rather than what authorises the read.
 */
const ROLES = ['daglig_leder', 'avdelingsleder', 'verneombud'] as const
export type Role = (typeof ROLES)[number]

export const getViewerRole = cache(async (): Promise<Role | null> => {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null

  const { data, error } = await supabase
    .schema('app')
    .from('memberships')
    .select('role')
    .eq('user_id', auth.user.id)
    .eq('active', true)
    .limit(1)
    .maybeSingle()

  if (readFailed('getViewerRole', error, data)) return null
  const parsed = z.object({ role: z.enum(ROLES) }).safeParse(data)
  return parsed.success ? parsed.data.role : null
})
