import 'server-only'
import { readSupabaseEnv } from '@/lib/supabase/env'
import { providerEnabled } from '@/lib/entra/schema'

/**
 * Whether Microsoft sign-in (Supabase Auth's `azure` provider) is switched on (D-201). Read from
 * the project's public settings exactly as googleEnabled reads Google's, so «Fortsett med
 * Microsoft» appears the moment the provider is enabled and never before (D-38's rule for a
 * sign-in button that cannot sign anybody in). Cached for five minutes; the request is the same
 * one googleEnabled makes, so Next's data cache serves both from one fetch.
 */
export async function microsoftEnabled(): Promise<boolean> {
  const env = readSupabaseEnv()
  if ('problem' in env) return false
  try {
    const res = await fetch(`${env.url}/auth/v1/settings`, {
      headers: { apikey: env.key },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return false
    return providerEnabled(await res.json(), 'azure')
  } catch {
    return false
  }
}
