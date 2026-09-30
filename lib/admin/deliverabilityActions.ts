'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { AdminResult } from './actions'
import { isError } from './api'
import { levelsOf } from './deliverability'
import { growthDeliverability } from './growthG4'
import { domainChecks } from './mailDomain'

const Reply = z.object({ ok: z.boolean(), error: z.string().optional() })

/**
 * «Run authentication check» (Deliverability, D-185): SPF, DKIM and DMARC of each stream's domain,
 * looked up in public DNS now, as the campaign editor's check does (lib/admin/mailDomain.ts), and
 * recorded. The read first — it refuses a role outside the growth section — then the lookups, then
 * the write, which checks the role again, that each result is for its stream's own domain, and that
 * no check ran in the last minute. What is recorded is what DNS answered; a failed lookup is
 * `unknown`, never a failure.
 */
export async function runAuthCheck(_prev: AdminResult | null, _form: FormData): Promise<AdminResult> {
  const now = await growthDeliverability()
  if (isError(now)) return { ok: false, problem: now.error === 'not_allowed' ? 'not_allowed' : 'failed' }
  // the rate limit is the database's; this only spares DNS a lookup the write would refuse
  const last = Math.max(0, ...now.streams.map((s) => (s.check ? Date.parse(s.check.checked_at) : 0)))
  if (Date.now() - last < 60_000) return { ok: false, problem: 'too_soon' }
  const results = await Promise.all(
    now.streams.map(async (s) => ({ stream: s.key, domain: s.domain, ...levelsOf(await domainChecks(s.domain, { fresh: true })) })),
  )
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_deliverability_check', { p_results: results })
  const r = Reply.safeParse(data)
  if (error || !r.success) return { ok: false, problem: 'failed' }
  if (!r.data.ok) return { ok: false, problem: r.data.error ?? 'failed' }
  revalidatePath('/admin/deliverability')
  return { ok: true }
}
