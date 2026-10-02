import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed } from '@/lib/supabase/read'

/**
 * The Entra import's state, for Integrasjoner › Microsoft Entra ID (0165, D-202).
 *
 * Read through public.entra_sync_status, which the daglig leder alone may call: the tables
 * behind it have no client policy, and the Graph delta links in them never leave the
 * database except to the Edge Function. What comes back is settings, the last run's codes and
 * counts, the selected groups, and — names of the organisation's own employees — who waits for a
 * round to close and who is in two groups. Parsed, not cast: `supabase gen types` does not emit
 * the app schema, so a cast would assert a shape nothing checked.
 *
 * The tenant itself is step 1's (0155): public.entra_status says whether one is bound.
 */

export const SKIP_REASONS = ['guest', 'disabled', 'no_mailbox', 'no_name', 'email_taken', 'email_ambiguous', 'no_data'] as const
export type SkipReason = (typeof SKIP_REASONS)[number]

const Count = z.number().int().nonnegative()

const Run = z.object({
  status: z.enum(['running', 'done', 'failed']),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  error: z.string().nullable(),
  counts: z
    .object({
      added: Count.optional(),
      linked: Count.optional(),
      updated: Count.optional(),
      deactivated: Count.optional(),
      moved: Count.optional(),
      deferred: Count.optional(),
      renamed: Count.optional(),
      rename_conflicts: Count.optional(),
      conflicts: Count.optional(),
      applied_deferred: Count.optional(),
      skipped: z.record(z.string(), Count).optional(),
      full: z.boolean().optional(),
    })
    .passthrough(),
})

const Status = z.object({
  ok: z.literal(true),
  bound: z.boolean(),
  set_up: z.boolean(),
  function_ready: z.boolean(),
  mode: z.enum(['nightly', 'manual']),
  include_phone: z.boolean(),
  requested_at: z.string().nullable(),
  round_open: z.boolean(),
  run: Run.nullable(),
  groups: z.array(
    z.object({
      entra_group_id: z.string(),
      group_id: z.string(),
      name: z.string(),
      entra_name: z.string().nullable(),
      priority: z.number().int(),
      nested: z.boolean(),
      members: Count,
      active: Count,
    }),
  ),
  synced: Count,
  synced_inactive: Count,
  pinned: Count,
  deferred: z.array(z.object({ employee_id: z.string(), name: z.string(), from: z.string().nullable(), to: z.string(), since: z.string() })),
  conflicts: z.array(z.object({ employee_id: z.string(), name: z.string(), groups: z.array(z.string()).nullable(), chosen: z.string().nullable() })),
  skipped: z.record(z.string(), Count),
})
export type EntraSyncStatus = z.infer<typeof Status>

/** null: not the daglig leder, or the read failed (logged) — the screen then offers nothing */
export async function getEntraSync(orgId: string): Promise<EntraSyncStatus | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('entra_sync_status', { p_org: orgId })
  if (callFailed('getEntraSync', error)) return null
  if (typeof data === 'object' && data !== null && (data as { ok?: unknown }).ok === false) return null
  const parsed = Status.safeParse(data)
  if (parseFailed('getEntraSync', parsed)) return null
  return parsed.data
}

const Tenant = z.object({
  ok: z.literal(true),
  bound: z.boolean(),
  tenant_id: z.string().nullable(),
  bound_at: z.string().nullable(),
})
export type EntraTenant = z.infer<typeof Tenant>

/** step 1's binding (0155): whether a Microsoft tenant is bound to the organisation, and which */
export async function getEntraTenant(orgId: string): Promise<EntraTenant | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('entra_status', { p_org: orgId })
  if (callFailed('getEntraTenant', error)) return null
  const parsed = Tenant.safeParse(data)
  if (parseFailed('getEntraTenant', parsed)) return null
  return parsed.data
}
