'use server'

import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'
import { parseCsatForm, readSubmit, type CsatResult } from '@/lib/csat/parse'
import { requestNetwork } from '@/lib/csat/read'
import { csatAllowed } from '@/lib/csat/throttle'

/**
 * The rating, once (0135): the key from the resolution mail, 1–5 and an optional comment,
 * through csat_submit. The comment is the customer's own words: it is never logged, and a
 * refusal names the field, never its content.
 */
export async function rateCase(_prev: CsatResult | null, formData: FormData): Promise<CsatResult> {
  const parsed = parseCsatForm(formData)
  if (!parsed.ok) return parsed
  if (!csatAllowed(await requestNetwork())) return { ok: false, problem: 'rate_limited' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('csat_submit', {
    p_token: parsed.data.key,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment,
  })
  if (callFailed('csat_submit', error)) return { ok: false, problem: 'failed' }
  return readSubmit(data)
}
