import { z } from 'zod'

/**
 * Microsoft Entra ID sign-in and the tenant binding (0155, D-201): the shapes that cross the
 * server boundary, and the decisions the screens make from them. Pure, so the unit tests can
 * hold every one of them without a database.
 *
 * Every payload from the database is parsed here, never cast (invariant 6): the `app` schema is
 * not in the generated types, so a cast would assert a shape nothing checks.
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// ---------------------------------------------------------------- is the provider switched on

/** Supabase Auth's public `/auth/v1/settings`: only the providers' switches are read. */
const AuthSettings = z.object({
  external: z.record(z.string(), z.unknown()).optional(),
})

/** Whether `/auth/v1/settings` reports the provider on. Anything unreadable is off. */
export function providerEnabled(json: unknown, provider: 'azure' | 'google'): boolean {
  const parsed = AuthSettings.safeParse(json)
  return parsed.success && parsed.data.external?.[provider] === true
}

/**
 * The Entra application's client id for the admin-consent request, from the environment. A
 * public identifier, never a secret; anything that is not a GUID counts as not set, and the
 * screens then say so and offer no button.
 */
export function entraClientIdFrom(value: string | undefined): string | null {
  const v = value?.trim().toLowerCase() ?? ''
  return GUID.test(v) ? v : null
}

// ---------------------------------------------------------------- the sign-in rules

const SIGN_IN_REFUSALS = [
  'not_signed_in',
  'platform_admin',
  'identity_ambiguous',
  'identity_incomplete',
  'personal_account',
  'no_membership',
  'tenant_mismatch',
  'identity_mismatch',
  'email_unverified',
] as const
export type SignInRefusal = (typeof SIGN_IN_REFUSALS)[number]

export const SignInCheck = z.union([
  z.object({ ok: z.literal(true), microsoft: z.boolean(), bound_now: z.boolean().optional() }),
  z.object({ ok: z.literal(false), microsoft: z.boolean().optional(), error: z.enum(SIGN_IN_REFUSALS) }),
])
export type SignInCheck = z.infer<typeof SignInCheck>

/**
 * What the sign-in page is told about a refusal. The database's codes are exact; the page's are
 * not, on purpose. No membership, a tenant other than the bound one, another object id and an
 * unverified address each say something about whether an Orgpuls account exists for the address
 * Microsoft presented — and that address is whatever the other tenant's administrator typed. So
 * they reach the page as one code with one message, which is true in every one of those cases
 * and never says which. A platform admin is refused as a failed sign-in, as on the Google path.
 */
export type SignInProblem = 'microsoft_failed' | 'microsoft_refused'
export function signInProblem(code: SignInRefusal | null): SignInProblem {
  switch (code) {
    case 'no_membership':
    case 'tenant_mismatch':
    case 'identity_mismatch':
    case 'email_unverified':
    case 'identity_ambiguous':
    case 'personal_account':
      return 'microsoft_refused'
    default:
      return 'microsoft_failed'
  }
}

// ---------------------------------------------------------------- the screens

export const EntraStatus = z.object({
  ok: z.literal(true),
  bound: z.boolean(),
  tenant_id: z.string().regex(GUID).nullable(),
  bound_at: z.string().nullable(),
  daglig_leder: z.boolean(),
  /** the current session came through Microsoft and passed the sign-in rules */
  microsoft: z.boolean(),
  /** that session's tenant: the one a consent would bind */
  own_tenant: z.string().regex(GUID).nullable(),
  me_bound_at: z.string().nullable(),
  last_event: z.object({ event: z.enum(['bound', 'unbound']), happened_at: z.string() }).nullable(),
})
export type EntraStatus = z.infer<typeof EntraStatus>

const BIND_PROBLEMS = [
  'not_signed_in',
  'not_allowed',
  'not_microsoft',
  'already_bound',
  'tenant_taken',
  'tenant_mismatch',
  'consent_refused',
  'nonce_invalid',
  'nonce_used',
  'nonce_expired',
  'not_bound',
] as const
export type BindProblem = (typeof BIND_PROBLEMS)[number] | 'not_configured' | 'failed'

export const BindStart = z.union([
  z.object({ ok: z.literal(true), nonce: z.string().regex(/^[0-9a-f]{64}$/), tenant: z.string().regex(GUID) }),
  z.object({ ok: z.literal(false), error: z.enum(BIND_PROBLEMS) }),
])
export const BindResult = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.enum(BIND_PROBLEMS) }),
])

/** A `?feil=` from the address bar, kept only if it is one of ours. */
export function bindProblemFrom(value: string | undefined): BindProblem | null {
  const all: readonly string[] = [...BIND_PROBLEMS, 'not_configured', 'failed']
  return value && all.includes(value) ? (value as BindProblem) : null
}

/**
 * Microsoft's admin-consent request for the caller's own tenant. Only the consent endpoint of
 * the tenant the leader signed in from is used, so the administrator who approves is one of that
 * organisation's, and the answer is checked against the same tenant on the way back.
 */
export function adminConsentUrl(p: { tenant: string; clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(p.tenant)}/v2.0/adminconsent`)
  url.searchParams.set('client_id', p.clientId)
  url.searchParams.set('scope', 'https://graph.microsoft.com/.default')
  url.searchParams.set('redirect_uri', p.redirectUri)
  url.searchParams.set('state', p.state)
  return url.toString()
}

/** Microsoft's answer to the consent request, as it arrives on the callback. */
export const ConsentAnswer = z.object({
  state: z.string().regex(/^[0-9a-f]{64}$/),
  tenant: z.string().max(64).optional(),
  admin_consent: z.string().max(10).optional(),
  // the code only: error_description is free text from Microsoft and is never passed on
  error: z.string().max(100).optional(),
})

/**
 * What the Entra screen can offer the person looking at it. The button exists in exactly one
 * state, `can_bind`; every other state is said in words (CLAUDE.md: never a fake flow).
 */
export type EntraGate = 'not_configured' | 'bound' | 'not_leader' | 'needs_microsoft' | 'can_bind'
export function entraGate(status: EntraStatus | null, clientId: string | null): EntraGate {
  if (status?.bound) return 'bound'
  if (!clientId) return 'not_configured'
  if (!status?.daglig_leder) return 'not_leader'
  if (!status.microsoft || !status.own_tenant) return 'needs_microsoft'
  return 'can_bind'
}
