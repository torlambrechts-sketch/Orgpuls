'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { networkOf } from '@/lib/brreg/throttle'
import { contactOf } from '@/lib/entry/contact'
import { entryAllowed } from '@/lib/entry/throttle'
import { callFailed } from '@/lib/supabase/read'
import { createClient } from '@/lib/supabase/server'

/**
 * "Send meg lenken" on the QR page (0076, D-126). The database decides whether anybody gets
 * a link; this side normalises what was typed and passes it on. The answer the page shows is
 * the same whether or not the address or number matched — only a malformed entry, a busy
 * network or a failed call is told apart, and none of those says anything about a person.
 *
 * What was typed is never logged, returned or stored here (invariant 7's reasoning: a
 * number is a person). The database keeps it only as the outbox row it may queue.
 */
export type EntryState = { status: 'idle' | 'sent' | 'invalid' | 'busy' | 'failed' }

const Code = z.string().regex(/^[a-hjkmnp-z2-9]{8}$/)
const Answer = z.union([z.object({ ok: z.literal(true) }), z.object({ error: z.enum(['unknown', 'invalid']) })])

export async function requestLink(code: string, _prev: EntryState, form: FormData): Promise<EntryState> {
  const c = Code.safeParse(code)
  const raw = form.get('contact')
  const contact = typeof raw === 'string' ? contactOf(raw) : null
  if (!c.success) return { status: 'failed' }
  if (!contact) return { status: 'invalid' }

  const h = await headers()
  if (!entryAllowed(networkOf(h.get('x-forwarded-for') ?? h.get('x-real-ip')))) return { status: 'busy' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('request_link', { p_code: c.data, p_contact: contact.value })
  if (callFailed('requestLink', error)) return { status: 'failed' }
  const parsed = Answer.safeParse(data)
  if (!parsed.success) return { status: 'failed' }
  if ('error' in parsed.data) return { status: parsed.data.error === 'invalid' ? 'invalid' : 'failed' }
  return { status: 'sent' }
}
