import 'server-only'
import { z } from 'zod'
import type { createClient } from '@/lib/supabase/server'
import { restoreLocale } from '@/lib/i18n/server'
import { DEFAULT_MARKET, MARKETS } from '@/lib/markets'
import { ORG_NUMBER_SHAPE, validOrgNumber } from '@/lib/org-number'
import { signUpOrganisation, type SignupOutcome } from './organisation'

type Client = Awaited<ReturnType<typeof createClient>>

/**
 * A sign-up whose e-mail is not confirmed yet (D-200).
 *
 * With e-mail confirmation on, `auth.signUp` returns no session, so the organisation cannot be
 * created at the form: `create_organisation` runs as the signed-in user. The form therefore
 * keeps the company it named on the account (`user_metadata.pending_org`), and the first
 * confirmed session — the confirmation link (/auth/confirm) or a later password sign-in — creates
 * it, or files the request to join it where the company is already here (0232, D-279).
 * `signup_organisation` checks everything again (one organisation per account, the number's rule),
 * so a value a user edits in their own metadata can name only their own sign-up.
 */
export const PENDING_KEY = 'pending_org'

export const PendingOrg = z
  .object({
    // optional since 0232 (X-114): a sign-up names the company, and the number only where it was typed
    orgNumber: z.string().regex(ORG_NUMBER_SHAPE).nullable().default(null),
    companyName: z.string().trim().min(1).max(200),
    employeeCount: z.number().int().min(0).max(100_000),
    // the market of the host the form was sent from (D-251); a sign-up kept before it was carried is Norway's
    market: z.enum(MARKETS).default(DEFAULT_MARKET),
  })
  // the market's organisation number rule (lib/org-number.ts, 0218, 0222), where one was typed
  .refine((p) => p.orgNumber === null || validOrgNumber(p.market, p.orgNumber), { path: ['orgNumber'] })
export type PendingOrg = z.infer<typeof PendingOrg>

export type PendingOutcome = { kind: 'none' } | SignupOutcome

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
  // made, or asked into where the company is already here (0232): either way the sign-up is done
  const outcome = await signUpOrganisation(supabase, { ...pending.data, fullName })
  if (outcome.kind === 'failed') return outcome
  await supabase.auth.updateUser({ data: { [PENDING_KEY]: null } })
  await restoreLocale(supabase)
  return outcome
}
