'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * The public side of the CRM (0055, D-101): the newsletter's double opt-in, its confirmation,
 * and unsubscribing. Each is one anonymous RPC. None reveals whether an address is known:
 * the signup answers the same for a new and a subscribed address. No address or token is
 * logged.
 */
export type SignupResult = { ok: true } | { ok: false; problem: 'invalid' | 'rate_limited' | 'failed' }
export type TokenResult = { ok: true } | { ok: false; problem: 'invalid' | 'failed' }

const Signup = z.object({
  mail: z.string().trim().email().max(254),
  name: z.string().trim().max(120),
  company: z.string().trim().max(200),
  lang: z.enum(['no', 'en']),
  source: z.enum(['newsletter', 'contact_form']),
  trap: z.string().max(500),
})
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() })
const Token = z.string().regex(/^[0-9a-f]{64}$/)

export async function signUpNewsletter(input: z.input<typeof Signup>): Promise<SignupResult> {
  const parsed = Signup.safeParse(input)
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const d = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('crm_newsletter_signup', {
    p_email: d.mail,
    p_name: d.name,
    p_company: d.company,
    p_lang: d.lang,
    p_source: d.source,
    p_trap: d.trap,
  })
  if (error) return { ok: false, problem: 'failed' }
  const r = Reply.safeParse(data)
  if (!r.success) return { ok: false, problem: 'failed' }
  if (r.data.ok) return { ok: true }
  return { ok: false, problem: r.data.error === 'rate_limited' ? 'rate_limited' : r.data.error === 'invalid' ? 'invalid' : 'failed' }
}

async function withToken(fn: 'crm_confirm' | 'crm_unsubscribe', token: string): Promise<TokenResult> {
  const t = Token.safeParse(token)
  if (!t.success) return { ok: false, problem: 'invalid' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, { p_token: t.data })
  if (error) return { ok: false, problem: 'failed' }
  const r = Reply.safeParse(data)
  if (!r.success) return { ok: false, problem: 'failed' }
  return r.data.ok ? { ok: true } : { ok: false, problem: 'invalid' }
}

export async function confirmNewsletter(token: string): Promise<TokenResult> {
  return withToken('crm_confirm', token)
}

export async function unsubscribeNewsletter(token: string): Promise<TokenResult> {
  return withToken('crm_unsubscribe', token)
}
