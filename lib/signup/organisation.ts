import 'server-only'
import { z } from 'zod'
import type { createClient } from '@/lib/supabase/server'
import type { Market } from '@/lib/markets'

type Client = Awaited<ReturnType<typeof createClient>>

/**
 * The organisation a sign-up names, made or asked into (0232, X-114, D-279).
 *
 * `signup_organisation` runs as the signed-in user. It looks for the company among those already
 * here, by the number where one is typed, by its name or by a colleague's work address; finding it,
 * it makes no second organisation and files a request for its daglig leder instead. The person is
 * let in only when the daglig leder says so (Oppsett › Roller). Finding nothing, it makes the
 * organisation, with or without a number, as `create_organisation` did.
 *
 * One call for every way a sign-up finishes: the form with a session at once, the confirmation
 * link and a later password sign-in (lib/signup/pending.ts), and Google or Microsoft
 * (app/auth/callback/route.ts).
 */
export type SignupOutcome = { kind: 'created' } | { kind: 'requested'; company: string } | { kind: 'failed'; reason: string }

const Verdict = z.union([
  z.object({ ok: z.literal(true), outcome: z.literal('created') }),
  z.object({ ok: z.literal(true), outcome: z.literal('requested'), company: z.string().min(1).max(200) }),
  z.object({ ok: z.literal(false), error: z.string() }),
])

export async function signUpOrganisation(
  supabase: Client,
  input: { companyName: string; employeeCount: number; fullName: string; market: Market; orgNumber: string | null },
): Promise<SignupOutcome> {
  const { data, error } = await supabase.rpc('signup_organisation', {
    p_name: input.companyName,
    p_employee_count: input.employeeCount,
    p_full_name: input.fullName,
    p_market: input.market,
    // optional now: sent only when typed
    ...(input.orgNumber ? { p_org_number: input.orgNumber } : {}),
  })
  const verdict = Verdict.safeParse(data)
  if (error || !verdict.success) return { kind: 'failed', reason: 'org_failed' }
  if (!verdict.data.ok) return { kind: 'failed', reason: /^[a-z_]{1,40}$/.test(verdict.data.error) ? verdict.data.error : 'org_failed' }
  return verdict.data.outcome === 'requested' ? { kind: 'requested', company: verdict.data.company } : { kind: 'created' }
}

/**
 * The request the signed-in person made, for the page that tells them where it stands: still waiting
 * or declined, the company it went to, what they typed, and whether they may say that company is not
 * theirs (not where the number matched, 0232). Nothing once they belong to an organisation.
 */
export type JoinRequest = { company: string; status: 'pending' | 'dismissed'; typed: string; separable: boolean }

const MyRequest = z
  .object({
    company: z.string().min(1).max(200),
    status: z.enum(['pending', 'dismissed']),
    typed: z.string().min(1).max(200),
    separable: z.boolean(),
  })
  .nullable()

export async function myJoinRequest(supabase: Client): Promise<JoinRequest | null> {
  const { data, error } = await supabase.rpc('my_join_request')
  if (error) return null
  const parsed = MyRequest.safeParse(data)
  return parsed.success ? parsed.data : null
}

/** «We are another company»: their own organisation, made from what they typed (0232) */
export async function signUpSeparately(supabase: Client): Promise<SignupOutcome> {
  const { data, error } = await supabase.rpc('signup_separately')
  const verdict = Verdict.safeParse(data)
  if (error || !verdict.success) return { kind: 'failed', reason: 'org_failed' }
  if (!verdict.data.ok) return { kind: 'failed', reason: /^[a-z_]{1,40}$/.test(verdict.data.error) ? verdict.data.error : 'org_failed' }
  return verdict.data.outcome === 'requested' ? { kind: 'requested', company: verdict.data.company } : { kind: 'created' }
}
