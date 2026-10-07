import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'

/**
 * Records today's visit to Innsikt and returns the day of the one before (0210, D-244):
 * «Du var sist inne 26. september». Null on a first visit, and on any refusal – the line is
 * then left out, never filled in.
 */
export async function recordInnsiktVisit(orgId: string | null): Promise<string | null> {
  if (!orgId) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('innsikt_visit', { p_org: orgId })
  if (callFailed('recordInnsiktVisit', error)) return null
  const parsed = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .safeParse(data)
  return parsed.success ? parsed.data : null
}
