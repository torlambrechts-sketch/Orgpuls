'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * A respondent's own conversation, by its key (0018). No session and no name: the key is
 * the credential, and `thread_by_key` / `follow_up` answer "not valid" alike for a key
 * that never existed and one that is wrong, so the pair cannot be used to probe.
 *
 * The key arrives in the body of this action, never in a URL the server sees: the page
 * keeps it in the fragment. Nothing here logs, and a refusal is read for its code only —
 * the body the person wrote must not reach a log (invariant 7).
 */
const Key = z.string().regex(/^[0-9a-f]{64}$/)

const Thread = z.object({
  state: z.enum(['venter', 'dialog', 'lukket']),
  factor_key: z.string(),
  opening: z.string(),
  messages: z.array(
    z.object({
      author: z.enum(['ansatt', 'leder']),
      body: z.string(),
      sent_hour: z.string(),
    }),
  ),
})

export type RespondentThread = z.infer<typeof Thread>

export async function readThread(key: unknown): Promise<RespondentThread | null> {
  const k = Key.safeParse(key)
  if (!k.success) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('thread_by_key', { p_key: k.data })
  if (error) return null
  const parsed = Thread.safeParse(data)
  return parsed.success ? parsed.data : null
}

export async function followUp(key: unknown, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const k = Key.safeParse(key)
  const b = z.string().trim().min(1).max(4000).safeParse(body)
  if (!k.success) return { ok: false, error: 'invalid_key' }
  if (!b.success) return { ok: false, error: 'invalid_body' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('follow_up', { p_key: k.data, p_body: b.data })
  if (error) return { ok: false, error: 'failed' }
  const r = z.object({ ok: z.boolean(), error: z.string().optional() }).safeParse(data)
  if (!r.success) return { ok: false, error: 'failed' }
  return r.data.ok ? { ok: true } : { ok: false, error: r.data.error ?? 'failed' }
}
