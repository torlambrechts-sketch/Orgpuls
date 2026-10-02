import { z } from 'zod'

/**
 * Slack as a channel (0185, D-205): the shapes that cross the server boundary and the decisions
 * the screens make from them. Pure, so the unit tests can hold every one of them.
 *
 * Every payload from the database is parsed here, never cast (invariant 6).
 */

export type SlackWhen = 'paaminn' | 'alle'
export const SLACK_WHEN = ['paaminn', 'alle'] as const

const n = z.number().int().nonnegative()
const at = z.string().nullable()

export const SlackStatus = z.object({
  ok: z.literal(true),
  connected: z.boolean(),
  working: z.boolean().nullable(),
  team_name: z.string().nullable(),
  grid: z.boolean().nullable(),
  installed_at: at,
  installed_by: z.string().nullable(),
  broken_reason: z.string().nullable(),
  broken_at: at,
  synced_at: at,
  sync_requested_at: at,
  sync_members: n.nullable(),
  sync_error: z.string().nullable(),
  daglig_leder: z.boolean(),
  counts: z.object({ active: n, with_email: n, matched: n, sent_30d: n }).nullable(),
  last_event: z
    .object({ event: z.enum(['connected', 'disconnected', 'broken']), reason: z.string().nullable(), happened_at: z.string() })
    .nullable(),
})
export type SlackStatus = z.infer<typeof SlackStatus>

export const ConnectStart = z.union([
  z.object({ ok: z.literal(true), nonce: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.object({ ok: z.literal(false), error: z.enum(['not_allowed', 'demo']) }),
])

const CONNECT_REFUSALS = [
  'not_signed_in',
  'nonce_invalid',
  'nonce_used',
  'nonce_expired',
  'not_allowed',
  'demo',
  'consent_refused',
  'enterprise_install',
  'invalid_install',
  'team_taken',
] as const
export type ConnectRefusal = (typeof CONNECT_REFUSALS)[number]

export const ConnectResult = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), revoke: z.boolean(), error: z.enum(CONNECT_REFUSALS) }),
])

export const SimpleResult = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.enum(['not_allowed', 'not_connected']) }),
])

/** Slack's answer at the callback: a code, or an error, and the state either way */
export const SlackCallback = z.object({
  state: z.string().max(200),
  code: z.string().max(400).optional(),
  // Slack's own code, e.g. access_denied; its value is never shown or logged
  error: z.string().max(200).optional(),
})

/** The problems the screen can be sent back with: a closed list, so `?feil=` is never echoed */
export const PROBLEMS = [...CONNECT_REFUSALS, 'not_configured', 'failed', 'exchange_failed', 'not_connected'] as const
export type SlackProblem = (typeof PROBLEMS)[number]
export function problemFrom(value: string | undefined): SlackProblem | null {
  return (PROBLEMS as readonly string[]).includes(value ?? '') ? (value as SlackProblem) : null
}

/**
 * What the screen offers. Not configured: no app to install, no button. Connected: the workspace,
 * and for the daglig leder the controls. Not connected: the daglig leder's connect button, and for
 * everyone else a line saying who connects.
 */
export type SlackGate = 'not_configured' | 'can_connect' | 'leader_only' | 'connected' | 'broken'
export function slackGate(status: Pick<SlackStatus, 'connected' | 'working' | 'daglig_leder'> | null, configured: boolean): SlackGate {
  if (status?.connected) return status.working ? 'connected' : 'broken'
  if (!configured) return 'not_configured'
  return status?.daglig_leder ? 'can_connect' : 'leader_only'
}
