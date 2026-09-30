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
const Claim = z.object({ ok: z.boolean(), run: z.coerce.number().int().positive().optional(), error: z.string().optional() })

/**
 * «Run authentication check» (Deliverability, D-185): SPF, DKIM and DMARC of each stream's domain,
 * looked up in public DNS now, as the campaign editor's check does (lib/admin/mailDomain.ts), and
 * recorded. In this order:
 *   1. the read, which refuses a role outside the growth section and names each stream's domain;
 *   2. the claim (admin_deliverability_claim), which refuses a role that does not write in the CRM
 *      and holds the minute for everyone BEFORE any lookup goes out, so neither two presses at
 *      once nor a run whose record is later refused sends DNS a second set of lookups;
 *   3. the lookups, fresh (not the ten-minute cache);
 *   4. the record, against the claimed run: the role again, the stream's own domain, known levels.
 * What is recorded is what DNS answered to this server; a failed lookup is `unknown`, never a failure.
 */
export async function runAuthCheck(_prev: AdminResult | null, _form: FormData): Promise<AdminResult> {
  const now = await growthDeliverability()
  if (isError(now)) return { ok: false, problem: now.error === 'not_allowed' ? 'not_allowed' : 'failed' }
  const supabase = await createClient()
  const claimed = await supabase.rpc('admin_deliverability_claim')
  const c = Claim.safeParse(claimed.data)
  if (claimed.error || !c.success) return { ok: false, problem: 'failed' }
  if (!c.data.ok || !c.data.run) return { ok: false, problem: c.data.error ?? 'failed' }
  const results = await Promise.all(
    now.streams.map(async (s) => ({ stream: s.key, domain: s.domain, ...levelsOf(await domainChecks(s.domain, { fresh: true })) })),
  )
  const { data, error } = await supabase.rpc('admin_deliverability_check', { p_run: c.data.run, p_results: results })
  const r = Reply.safeParse(data)
  if (error || !r.success) return { ok: false, problem: 'failed' }
  if (!r.data.ok) return { ok: false, problem: r.data.error ?? 'failed' }
  revalidatePath('/admin/deliverability')
  return { ok: true }
}
