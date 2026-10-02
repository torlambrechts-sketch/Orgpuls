import 'server-only'
import { z } from 'zod'
import type { createClient } from '@/lib/supabase/server'
import { restoreLocale } from '@/lib/i18n/server'
import { recordSource } from './source'

type Client = Awaited<ReturnType<typeof createClient>>

/**
 * A sign-up whose e-mail is not confirmed yet (D-200).
 *
 * With e-mail confirmation on, `auth.signUp` returns no session, so the organisation cannot be
 * created at the form: `create_organisation` runs as the signed-in user. The form therefore
 * keeps the company it named on the account (`user_metadata.pending_org`), and the first
 * confirmed session — the confirmation link (/auth/confirm) or a later password sign-in — creates
 * it. `create_organisation` checks everything again (one organisation per account, a free
 * org.nr.), so a value a user edits in their own metadata can name only their own sign-up.
 */
export const PENDING_KEY = 'pending_org'

export const PendingOrg = z.object({
  orgNumber: z.string().regex(/^\d{9}$/),
  companyName: z.string().trim().min(1).max(200),
  employeeCount: z.number().int().min(0).max(100_000),
})
export type PendingOrg = z.infer<typeof PendingOrg>

export type PendingOutcome = { kind: 'none' } | { kind: 'created' } | { kind: 'failed'; reason: string }

export async function completePendingSignup(supabase: Client): Promise<PendingOutcome> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { kind: 'none' }
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const pending = PendingOrg.safeParse(meta[PENDING_KEY])
  if (!pending.success) return { kind: 'none' }

  const { data: member } = await supabase
    .schema('app')
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('active', true)
    .limit(1)
  if (Array.isArray(member) && member.length > 0) {
    await supabase.auth.updateUser({ data: { [PENDING_KEY]: null } })
    return { kind: 'none' }
  }

  const fullName =
    typeof meta.full_name === 'string' && meta.full_name.trim().length > 1
      ? meta.full_name.trim().slice(0, 120)
      : ((user.email ?? '').split('@')[0] ?? '')
  const { data, error } = await supabase.rpc('create_organisation', {
    p_name: pending.data.companyName,
    p_org_number: pending.data.orgNumber,
    p_employee_count: pending.data.employeeCount,
    p_full_name: fullName,
  })
  const outcome = z.object({ ok: z.boolean(), error: z.string().optional() }).safeParse(data)
  if (error || !outcome.success || !outcome.data.ok) {
    const reason = outcome.success && outcome.data.error && /^[a-z_]{1,40}$/.test(outcome.data.error) ? outcome.data.error : 'org_failed'
    return { kind: 'failed', reason }
  }
  await supabase.auth.updateUser({ data: { [PENDING_KEY]: null } })
  await recordSource(supabase)
  await restoreLocale(supabase)
  return { kind: 'created' }
}
