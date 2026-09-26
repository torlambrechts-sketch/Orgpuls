import 'server-only'
import { z } from 'zod'
import type { createClient } from '@/lib/supabase/server'

const Tag = z.string().max(200).optional()
const Attribution = z.object({
  first: z.object({ landing: Tag, referrer: Tag, utm_source: Tag, utm_medium: Tag, utm_campaign: Tag }),
  last: z.object({ utm_source: Tag, utm_medium: Tag, utm_campaign: Tag }),
})

/**
 * Where the signup came from (D-91): the tab's first page and the campaign tags, kept by
 * lib/marketing/utm. The database cleans and classifies them and records them once. A
 * signup never fails for want of attribution, so nothing here can refuse one.
 */
export async function recordSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raw: FormDataEntryValue | null,
): Promise<void> {
  if (typeof raw !== 'string' || raw.length > 4000) return
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return
  }
  const parsed = Attribution.safeParse(json)
  if (!parsed.success) return
  await supabase.rpc('record_signup_source', { p_first: parsed.data.first, p_last: parsed.data.last })
}
