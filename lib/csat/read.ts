import 'server-only'
import { headers } from 'next/headers'
import { networkOf } from '@/lib/brreg/throttle'
import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'
import { csatAllowed } from './throttle'
import { parseKey, readOpen, type CsatOpen } from './parse'

/** The requester's network, for the throttle; never stored whole */
export async function requestNetwork(): Promise<string> {
  const h = await headers()
  return networkOf(h.get('x-forwarded-for') ?? h.get('x-real-ip'))
}

/**
 * The rating page's first read (0135): whether the key may still be used, and the case number.
 * A malformed key is refused without a call; the database says `invalid` for the rest alike.
 */
export async function openRating(raw: unknown): Promise<CsatOpen> {
  const key = parseKey(raw)
  if (!key) return { ok: false, problem: 'invalid' }
  if (!csatAllowed(await requestNetwork())) return { ok: false, problem: 'rate_limited' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('csat_open', { p_token: key })
  if (callFailed('csat_open', error)) return { ok: false, problem: 'failed' }
  return readOpen(data)
}
