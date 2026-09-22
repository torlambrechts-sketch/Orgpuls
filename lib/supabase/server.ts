import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { missingEnvMessage, readSupabaseEnv } from '@/lib/supabase/env'

/**
 * The cookie-bound, anon-key client. RLS applies to everything it does, and every
 * result read goes through a SECURITY DEFINER RPC that enforces k on top of that.
 *
 * There is deliberately no service-role client in this file. The service-role key
 * bypasses every policy in the database, so it belongs to a narrow server-only path
 * and never to the one screens reach for by default. If a screen appears to need it,
 * the RPC is missing a case — that is the thing to fix.
 */
export async function createClient() {
  const env = readSupabaseEnv()
  if ('missing' in env) {
    // named rather than generic: the library's own message says a URL and key are
    // required without saying which variable carries them
    throw new Error(missingEnvMessage(env.missing))
  }

  const cookieStore = await cookies()

  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  })
}
