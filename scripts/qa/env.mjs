/**
 * The QA stack's environment: the local Supabase started by `supabase start` (never the
 * hosted project), every feature flag on, its own build directory and port. The anon key
 * is read from `supabase status` at run time — it is the CLI's published local default, but
 * nothing here writes a key into a tracked file.
 */
import { execFileSync } from 'node:child_process'

export const QA_PORT = Number(process.env.QA_PORT ?? 3100)
export const QA_BASE = `http://localhost:${QA_PORT}`

export function qaEnv() {
  let status
  try {
    status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  } catch {
    console.error('qa: the local Supabase stack is not running. Start it with `npm run qa:up`.')
    process.exit(2)
  }
  const url = status.API_URL
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    console.error('qa: `supabase status` does not describe a local stack; refusing')
    process.exit(2)
  }
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    QA_DATABASE_URL: status.DB_URL,
    ORGPULS_FLAGS: process.env.QA_FLAGS ?? '*',
    NEXT_DIST_DIR: '.next-qa',
    PORT: String(QA_PORT),
  }
}
