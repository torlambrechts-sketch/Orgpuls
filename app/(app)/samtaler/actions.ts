'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Writing to a conversation.
 *
 * Both actions go through the RPCs rather than the tables, because there is no table
 * access to go through: `app.comment_threads` and `app.thread_messages` have RLS with no
 * policy and no grant. `public.reply_to_thread` and `public.set_thread` check the
 * employer role themselves against `auth.uid()`, so — as everywhere else in this
 * codebase — the role is not re-checked here.
 *
 * **No respondent free text is logged, ever.** A failed reply returns a key, not the body
 * that failed, and nothing here writes a comment into an error path. CLAUDE.md invariant
 * 7: a person can be recognised by what they describe.
 */
const Uuid = z.string().uuid()

export type ThreadActionResult = { ok: true } | { ok: false; problem: string }

const Reply = z.object({ id: Uuid, body: z.string().trim().min(1).max(4000) })

export async function replyToThread(formData: FormData): Promise<ThreadActionResult> {
  const parsed = Reply.safeParse({ id: formData.get('id'), body: formData.get('body') })
  if (!parsed.success) return { ok: false, problem: 'invalid_body' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reply_to_thread', {
    p_thread: parsed.data.id,
    p_body: parsed.data.body,
  })
  if (error) return { ok: false, problem: 'denied' }

  const result = z.object({ ok: z.boolean(), error: z.string().optional() }).safeParse(data)
  if (!result.success || !result.data.ok) {
    return { ok: false, problem: result.success ? (result.data.error ?? 'denied') : 'denied' }
  }

  revalidatePath('/samtaler')
  revalidatePath('/innsikt')
  // Resultat's Samtaler column replies through here too (D-54)
  revalidatePath('/resultat')
  return { ok: true }
}

export async function closeThread(formData: FormData): Promise<ThreadActionResult> {
  const parsed = z.object({ id: Uuid }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return { ok: false, problem: 'invalid_body' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_thread', {
    p_thread: parsed.data.id,
    p_state: 'lukket',
    p_flagged: null,
  })
  if (error) return { ok: false, problem: 'denied' }

  const result = z.object({ ok: z.boolean(), error: z.string().optional() }).safeParse(data)
  if (!result.success || !result.data.ok) {
    return { ok: false, problem: result.success ? (result.data.error ?? 'denied') : 'denied' }
  }

  revalidatePath('/samtaler')
  revalidatePath('/innsikt')
  return { ok: true }
}
