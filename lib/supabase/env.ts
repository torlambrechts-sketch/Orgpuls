/**
 * The two variables every Supabase client in this application needs.
 *
 * They are read through here rather than with `process.env.X!` so that a deployment with
 * a problem says which variable and what is wrong with it, instead of throwing a library
 * message from whichever code path happened to run first. Both are `NEXT_PUBLIC_`, so
 * their values are inlined at build time: changing them in a deployment requires a
 * rebuild, not a restart, and that is the part that is easy to get wrong.
 *
 * Neither is a secret. The anon key ships in the browser bundle by design — RLS is what
 * protects the data, not the key — so both may appear in a log, and the URL does,
 * because a malformed one is unreadable otherwise.
 *
 * Values are trimmed. A trailing newline or a pair of quotes around a value pasted into
 * a dashboard is never intentional, and the failure it causes — `new URL()` rejecting
 * the value inside the Supabase client — is indistinguishable from the variable being
 * absent. Trimming is reported rather than done silently.
 */
export interface SupabaseEnv {
  url: string
  key: string
  /** things that were wrong but recoverable, for the caller to log */
  warnings: string[]
}

export interface SupabaseEnvProblem {
  problem: string
}

export function readSupabaseEnv(): SupabaseEnv | SupabaseEnvProblem {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const missing = [
    rawUrl ? null : 'NEXT_PUBLIC_SUPABASE_URL',
    rawKey ? null : 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ].filter((n): n is string => n !== null)

  if (missing.length) {
    const plural = missing.length > 1
    return {
      problem:
        `Supabase is not configured: ${missing.join(' and ')} ${plural ? 'are' : 'is'} not set. ` +
        `Set ${plural ? 'them' : 'it'} in the deployment environment and rebuild — ` +
        'NEXT_PUBLIC_ values are inlined at build time, so a restart is not enough.',
    }
  }

  const warnings: string[] = []
  const url = clean(rawUrl as string)
  const key = clean(rawKey as string)
  if (url !== rawUrl) warnings.push('NEXT_PUBLIC_SUPABASE_URL had surrounding whitespace or quotes')
  if (key !== rawKey) warnings.push('NEXT_PUBLIC_SUPABASE_ANON_KEY had surrounding whitespace or quotes')

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return {
      problem:
        `NEXT_PUBLIC_SUPABASE_URL is not a URL: ${JSON.stringify(url)}. ` +
        'It should look like https://<project-ref>.supabase.co.',
    }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      problem:
        `NEXT_PUBLIC_SUPABASE_URL is not http or https: ${JSON.stringify(url)}. ` +
        'It should look like https://<project-ref>.supabase.co.',
    }
  }

  return { url, key, warnings }
}

/** Strip surrounding whitespace, and the quotes a copied `.env` line brings with it. */
function clean(value: string): string {
  const trimmed = value.trim()
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  return quoted ? trimmed.slice(1, -1).trim() : trimmed
}
