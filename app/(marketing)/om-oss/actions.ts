'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * "Skriv til oss" (D-92): the message becomes a ticket in the admin's queue through
 * `submit_contact` (0051), which refuses a malformed address, drops a filled honeypot and
 * limits one address to three messages an hour. The message itself is never logged.
 */
export type ContactResult = { ok: true } | { ok: false; problem: 'invalid' | 'rate_limited' | 'failed' }

const Input = z.object({
  topic: z.number().int().min(0).max(3),
  name: z.string().trim().min(1).max(120),
  mail: z.string().trim().email().max(254),
  org: z.string().trim().max(200),
  msg: z.string().trim().max(5000),
  trap: z.string().max(500),
})

export async function sendContact(input: z.input<typeof Input>): Promise<ContactResult> {
  const parsed = Input.safeParse(input)
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const d = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_contact', {
    p_topic: d.topic,
    p_name: d.name,
    p_email: d.mail,
    p_org: d.org,
    p_message: d.msg,
    p_trap: d.trap,
  })
  if (error) return { ok: false, problem: 'failed' }
  const reply = z.object({ ok: z.boolean(), error: z.string().optional() }).safeParse(data)
  if (!reply.success) return { ok: false, problem: 'failed' }
  if (reply.data.ok) return { ok: true }
  return {
    ok: false,
    problem: reply.data.error === 'rate_limited' ? 'rate_limited' : reply.data.error === 'invalid' ? 'invalid' : 'failed',
  }
}
