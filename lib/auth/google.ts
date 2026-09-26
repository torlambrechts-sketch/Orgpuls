import 'server-only'
import { readSupabaseEnv } from '@/lib/supabase/env'

/**
 * Whether Google sign-in is switched on in Supabase Auth (D-102). Read from the project's
 * public settings, so the button appears the moment the provider is enabled and never
 * before: a sign-in button that cannot sign anybody in is the dead control D-38 keeps off
 * this screen. Cached for five minutes.
 */
export async function googleEnabled(): Promise<boolean> {
  const env = readSupabaseEnv()
  if ('problem' in env) return false
  try {
    const res = await fetch(`${env.url}/auth/v1/settings`, {
      headers: { apikey: env.key },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return false
    const json = (await res.json()) as { external?: { google?: boolean } }
    return json.external?.google === true
  } catch {
    return false
  }
}
