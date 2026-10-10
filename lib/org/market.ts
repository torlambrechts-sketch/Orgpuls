import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { z } from 'zod'
import { DEFAULT_MARKET, isMarket, type Market } from '@/lib/markets'
import { createClient } from '@/lib/supabase/server'
import { onlyOrganisation } from '@/lib/org/current'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/** A Supabase session cookie (`sb-<ref>-auth-token`, chunked as `.0`, `.1` when long) */
const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/

const MarketRow = z.object({ market: z.string() })

/**
 * The market of the caller's organisation (0214), or null for a visitor and for an account that is
 * in no organisation, or in two (lib/org/current.ts: refuse rather than guess). It decides which
 * law the product's texts state (lib/i18n/market-overlay.ts, D-257), so a Swedish organisation
 * reads Swedish law on any host.
 *
 * A visitor without a session is not asked about: the public pages render on every request, and a
 * read that can only come back empty is a round trip for nothing. A market the code does not know
 * yet reads as Norway's, as everywhere else (lib/settings/read.ts).
 *
 * Memoised per request, like every org read.
 */
export const getOrgMarket = cache(async (): Promise<Market | null> => {
  if (!(await cookies()).getAll().some((c) => SESSION_COOKIE.test(c.name))) return null
  const supabase = await createClient()
  const { data, error } = await supabase.schema('app').from('organizations').select('market').limit(2)
  if (readFailed('getOrgMarket', error, data)) return null
  const parsed = z.array(MarketRow).safeParse(data)
  if (parseFailed('getOrgMarket', parsed)) return null
  const row = onlyOrganisation('getOrgMarket', parsed.data)
  if (!row) return null
  return isMarket(row.market) ? row.market : DEFAULT_MARKET
})
