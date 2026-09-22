/**
 * The two variables every Supabase client in this application needs.
 *
 * They are read through here rather than with `process.env.X!` so that a deployment
 * missing them says which one, once, instead of throwing the library's generic message
 * from whichever code path happened to run first. Both are `NEXT_PUBLIC_`, so their
 * values are inlined at build time: adding them to a deployment requires a rebuild, not
 * a restart, and that is the part that is easy to get wrong.
 *
 * Neither is a secret. The anon key ships in the browser bundle by design — RLS is what
 * protects the data, not the key.
 */
export interface SupabaseEnv {
  url: string
  key: string
}

export function readSupabaseEnv(): SupabaseEnv | { missing: string[] } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const missing = [
    url ? null : 'NEXT_PUBLIC_SUPABASE_URL',
    key ? null : 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ].filter((n): n is string => n !== null)

  return missing.length ? { missing } : { url: url as string, key: key as string }
}

/** The message a log should carry, naming the fix rather than the symptom. */
export function missingEnvMessage(missing: string[]): string {
  const plural = missing.length > 1
  return (
    `Supabase is not configured: ${missing.join(' and ')} ${plural ? 'are' : 'is'} not set. ` +
    `Set ${plural ? 'them' : 'it'} in the deployment environment and rebuild — ` +
    'NEXT_PUBLIC_ values are inlined at build time, so a restart is not enough.'
  )
}
