import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { readSupabaseEnv } from '@/lib/supabase/env'

/**
 * A client with no session and no cookies, for what anyone may read by its exact address: a
 * logo, an image. The cookie-bound client could refresh a session on such a request and send
 * `Set-Cookie` on a response marked `public, immutable` (audit P3); this one never can.
 */
export function anonClient() {
  const env = readSupabaseEnv()
  if ('problem' in env) return null
  return createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } })
}
