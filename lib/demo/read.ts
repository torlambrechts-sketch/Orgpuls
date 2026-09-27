import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { callFailed, parseFailed } from '@/lib/supabase/read'

/**
 * Whether the signed-in user is in a demo copy of their own (0094, D-143), and when it is made
 * fresh. Anything else — a real organisation, a failed read — is not a demo: the banner and the
 * report's stamp then draw nothing, and the screens stay as the design draws them.
 */
const State = z.union([
  z.object({ demo: z.literal(true), reset_at: z.string(), fresh_after: z.string(), expires_at: z.string() }),
  z.object({ demo: z.literal(false) }),
])
export type DemoState = { demo: true; freshAfter: string; expiresAt: string } | { demo: false }

export async function getDemoState(): Promise<DemoState> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('demo_state')
  if (callFailed('getDemoState', error)) return { demo: false }
  const parsed = State.safeParse(data)
  if (parseFailed('getDemoState', parsed) || !parsed.data.demo) return { demo: false }
  return { demo: true, freshAfter: parsed.data.fresh_after, expiresAt: parsed.data.expires_at }
}
