import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed } from '@/lib/supabase/read'
import { EntraStatus, SignInCheck, entraClientIdFrom } from '@/lib/entra/schema'

/** The Entra application's client id (ENTRA_CLIENT_ID, server environment), or null when unset. */
export function entraClientId(): string | null {
  return entraClientIdFrom(process.env.ENTRA_CLIENT_ID)
}

/** The organisation's Microsoft 365 binding and what the viewer may do with it, or null. */
export async function getEntraStatus(orgId: string): Promise<EntraStatus | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('entra_status', { p_org: orgId })
  if (callFailed('getEntraStatus', error)) return null
  // a non-member is answered {ok:false}; there is nothing to show then
  if (data && typeof data === 'object' && 'ok' in data && data.ok === false) return null
  const parsed = EntraStatus.safeParse(data)
  if (parseFailed('getEntraStatus', parsed)) return null
  return parsed.data
}

/**
 * The Microsoft sign-in rules (public.entra_sign_in_check), for the session the client now
 * holds. Called after every OAuth code exchange and after an invitation is accepted. A call
 * that fails, or an answer that does not parse, is a refusal: this check fails closed.
 */
export async function checkMicrosoftSignIn(supabase: Awaited<ReturnType<typeof createClient>>): Promise<SignInCheck> {
  const { data, error } = await supabase.rpc('entra_sign_in_check')
  if (callFailed('checkMicrosoftSignIn', error)) return { ok: false, error: 'not_signed_in' }
  const parsed = SignInCheck.safeParse(data)
  if (parseFailed('checkMicrosoftSignIn', parsed)) return { ok: false, error: 'not_signed_in' }
  return parsed.data
}
