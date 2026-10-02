'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrgId } from '@/lib/org/current'
import { createClient } from '@/lib/supabase/server'
import { callFailed } from '@/lib/supabase/read'
import { readSupabaseEnv } from '@/lib/supabase/env'

/**
 * The Entra import's writes (0165, D-202): the groups and their order, the mode and the phone
 * opt-in, «Synkroniser nå», disconnecting, and letting a hand-set group follow the directory
 * again. Each is a role-checked RPC: the daglig leder of the organisation, nobody else, and the
 * database says so as a code rather than this file deciding it.
 *
 * The group picker reads the tenant's groups through the Edge Function, with the caller's own
 * access token: the function asks the database, as the caller, whether they are this
 * organisation's daglig leder, and only then uses the app's certificate to ask Graph. No
 * credential of the app's is held by this server or sent to the browser.
 */

export type EntraResult = { ok: true } | { ok: false; problem: string }
const CODE = /^[a-z_]{1,40}$/

const revalidate = () => {
  revalidatePath('/integrasjoner/entra')
  revalidatePath('/integrasjoner')
  revalidatePath('/oppsett')
}

/** an RPC's own { ok, error } answer, as a result the screen can word */
async function call(where: string, fn: string, args: Record<string, unknown>): Promise<EntraResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (callFailed(where, error)) return { ok: false, problem: 'denied' }
  const reply = z.object({ ok: z.boolean(), error: z.string().nullable().optional() }).safeParse(data)
  if (!reply.success) return { ok: false, problem: 'denied' }
  if (!reply.data.ok) return { ok: false, problem: reply.data.error && CODE.test(reply.data.error) ? reply.data.error : 'denied' }
  revalidate()
  return { ok: true }
}

const Guid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
const Groups = z.array(z.object({ id: Guid, name: z.string().trim().min(1).max(256) })).max(200)

export type EntraGroupList = { ok: true; groups: { id: string; name: string }[]; more: boolean } | { ok: false; problem: string }

export async function listEntraGroups(q: string): Promise<EntraGroupList> {
  const query = z.string().max(60).safeParse(q)
  if (!query.success) return { ok: false, problem: 'invalid' }
  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, problem: 'noOrg' }
  const env = readSupabaseEnv()
  if ('problem' in env) return { ok: false, problem: 'unavailable' }
  const supabase = await createClient()
  // the caller's own token: the function's role check is the database's, run as them
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) return { ok: false, problem: 'denied' }
  const url = `${env.url}/functions/v1/orgpuls-entra-sync?op=groups&org=${orgId}&q=${encodeURIComponent(query.data)}`
  let body: unknown
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, apikey: env.key },
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    })
    body = await res.json().catch(() => null)
  } catch {
    return { ok: false, problem: 'unavailable' }
  }
  const ok = z.object({ ok: z.literal(true), groups: z.array(z.object({ id: Guid, name: z.string() })), more: z.boolean() }).safeParse(body)
  if (ok.success) return ok.data
  const no = z.object({ ok: z.literal(false), error: z.string() }).safeParse(body)
  return { ok: false, problem: no.success && CODE.test(no.data.error) ? no.data.error : 'unavailable' }
}

/** the chosen groups, in priority order: the first wins for a person in two */
export async function saveEntraGroups(groups: { id: string; name: string }[]): Promise<EntraResult> {
  const parsed = Groups.safeParse(groups)
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, problem: 'noOrg' }
  return call('saveEntraGroups', 'entra_select_groups', { p_org: orgId, p_groups: parsed.data })
}

export async function saveEntraSettings(mode: string, includePhone: boolean): Promise<EntraResult> {
  const parsed = z.object({ mode: z.enum(['nightly', 'manual']), includePhone: z.boolean() }).safeParse({ mode, includePhone })
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, problem: 'noOrg' }
  return call('saveEntraSettings', 'entra_sync_settings', { p_org: orgId, p_mode: parsed.data.mode, p_include_phone: parsed.data.includePhone })
}

export async function syncEntraNow(): Promise<EntraResult> {
  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, problem: 'noOrg' }
  return call('syncEntraNow', 'entra_sync_now', { p_org: orgId })
}

export async function disconnectEntra(): Promise<EntraResult> {
  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, problem: 'noOrg' }
  return call('disconnectEntra', 'entra_disconnect', { p_org: orgId })
}

/** «Følg Entra»: a group set by hand in Ansatte is let go, and the directory places the person again */
export async function followEntra(formData: FormData): Promise<EntraResult> {
  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) return { ok: false, problem: 'invalid' }
  const orgId = await getCurrentOrgId()
  if (!orgId) return { ok: false, problem: 'noOrg' }
  return call('followEntra', 'entra_follow_directory', { p_org: orgId, p_employee: id.data })
}
