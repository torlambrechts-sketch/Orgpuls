import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { getCurrentOrgId } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * The organisation's own logo (0104, D-154): its address and whether it stands in the header.
 *
 * The image itself is served at /logo/<key> (app/logo/[key]/route.ts). The key changes with the
 * bytes, so an address can be cached for a year and a new logo is a new address.
 */
export const LOGO_KEY = /^[0-9a-f]{32}$/

export interface OrgLogo {
  key: string
  inHeader: boolean
}

export { logoPath } from '@/lib/org/brand'

/** A key from a definer function's JSON: a well-formed one, or nothing. */
export const LogoKey = z
  .string()
  .regex(LOGO_KEY)
  .nullable()
  .optional()
  .transform((v) => v ?? null)

const Row = z.object({ key: z.string().regex(LOGO_KEY), in_header: z.boolean() })

export const getOrgLogo = cache(async (): Promise<OrgLogo | null> => {
  // the current organisation's, not whatever RLS lets the member read (audit P3)
  const org = await getCurrentOrgId()
  if (!org) return null
  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from('org_logos').select('key, in_header').eq('org_id', org).limit(2)
  if (readFailed('getOrgLogo', error, data)) return null
  const parsed = z.array(Row).safeParse(data)
  if (parseFailed('getOrgLogo', parsed)) return null
  // one organisation per session (lib/org/current.ts); two rows is no right answer
  const [row, ...rest] = parsed.data
  if (!row || rest.length) return null
  return { key: row.key, inHeader: row.in_header }
})
