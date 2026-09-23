import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { readFailed, parseFailed } from '@/lib/supabase/read'

/**
 * Which organisation the caller is acting in — answered only when the answer is unique.
 * Q3 in docs/CODE_REVIEW_2026-09-23.md.
 *
 * Five places used to ask with `.select('id').limit(1).maybeSingle()` on
 * `app.organizations`: whatever row RLS returned first. That is correct only while a user
 * belongs to exactly one organisation, and nothing in the schema holds that true.
 * `create_organisation` refuses a second organisation at sign-up (0024), but
 * `membership_admin_insert` lets any daglig leder add *any* user to their own
 * organisation — so a person can end up in two. For them, `limit(1)` picks one of the two
 * without saying which, and `createMeasure` would file a new measure in whichever
 * organisation Postgres happened to return first.
 *
 * **The rule here is: refuse rather than guess.** Zero organisations is `null` — the
 * ordinary state of a signed-in account that has not been given a membership. More than
 * one is also `null`, and a log line, because there is no correct row to pick and every
 * wrong one writes somebody's data into somebody else's organisation. When the product
 * gains an organisation switcher, this is the one place that learns about it.
 *
 * It asks for two rows, not all of them: two is enough to know the answer is not unique.
 * No auth round trip is needed — RLS on organizations is `is_org_member(id)`, so the rows
 * that come back are exactly the caller's organisations.
 */
export function onlyOrganisation<T>(where: string, rows: T[]): T | null {
  if (rows.length === 1) return rows[0] ?? null
  if (rows.length > 1) {
    console.error(
      `[org] ${where}: the caller belongs to more than one organisation; refusing to pick one`,
    )
  }
  return null
}

const IdRow = z.object({ id: z.string() })

/** Memoised per request; every action and screen that needs the org id shares one read. */
export const getCurrentOrgId = cache(async (): Promise<string | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from('organizations').select('id').limit(2)

  if (readFailed('getCurrentOrgId', error, data)) return null
  const parsed = z.array(IdRow).safeParse(data)
  if (parseFailed('getCurrentOrgId', parsed)) return null
  return onlyOrganisation('getCurrentOrgId', parsed.data)?.id ?? null
})
