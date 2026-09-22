import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

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

export async function getOrganization(): Promise<Organization | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('organizations')
    .select('id, name, org_number, employee_count, threshold')
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  const parsed = OrgRow.safeParse(data)
  return parsed.success ? parsed.data : null
}

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
