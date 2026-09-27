'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { LOCALES } from '@/lib/i18n/locales'
import { createClient } from '@/lib/supabase/server'

/**
 * The demo's actions (0094, D-143). A request is one anonymous RPC — which counts it against
 * the address, the network and the day — and, only when it says yes, a login link from Auth.
 * The answer is the same for an address that has an account and one that has not. Neither
 * the address nor the network is logged; the network reaches the database only to be hashed.
 */
export type DemoRequestResult = { ok: true } | { ok: false; problem: 'invalid' | 'limited' | 'closed' | 'failed' }

const Request = z.object({
  mail: z.string().trim().toLowerCase().email().max(254),
  consent: z.boolean(),
  lang: z.enum(LOCALES),
  trap: z.string().max(500),
})
const Reply = z.object({ ok: z.boolean(), error: z.string().optional() })

export async function requestDemo(input: z.input<typeof Request>): Promise<DemoRequestResult> {
  const parsed = Request.safeParse(input)
  if (!parsed.success) return { ok: false, problem: 'invalid' }
  const d = parsed.data
  // a form bot fills the hidden field: it is told what a person would be, and nothing is sent
  if (d.trap) return { ok: true }

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || ''
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('demo_request', {
    p_email: d.mail,
    p_ip: ip,
    p_consent: d.consent,
    p_lang: d.lang,
  })
  if (error) {
    console.error(`[demo] request refused: ${error.code ?? 'unknown'}`)
    return { ok: false, problem: 'failed' }
  }
  const r = Reply.safeParse(data)
  if (!r.success) return { ok: false, problem: 'failed' }
  if (!r.data.ok) {
    const e = r.data.error
    return { ok: false, problem: e === 'invalid' ? 'invalid' : e === 'limited' ? 'limited' : e === 'closed' ? 'closed' : 'failed' }
  }

  // the link lands on /auth/confirm, which sends a demo visitor on to /demo/start
  const { error: otp } = await supabase.auth.signInWithOtp({ email: d.mail, options: { shouldCreateUser: true } })
  if (otp) {
    console.error(`[demo] login link refused: ${otp.code ?? otp.status ?? 'unknown'}`)
    return { ok: false, problem: otp.status === 429 ? 'limited' : 'failed' }
  }
  return { ok: true }
}

/** «Tilbakestill demo»: a fresh copy now, then the start page */
export async function resetDemo(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('demo_reset')
  if (error) console.error(`[demo] reset refused: ${error.code ?? 'unknown'}`)
  redirect('/innsikt')
}

/**
 * «Opprett egen konto»: the demo copy and its login are deleted, and the visitor registers
 * with the same address. create_organisation refuses somebody who is already a member of an
 * organisation, a demo included, so the demo has to go first.
 */
export async function leaveDemo(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('demo_leave')
  if (error) {
    console.error(`[demo] leave refused: ${error.code ?? 'unknown'}`)
    redirect('/innsikt')
  }
  await supabase.auth.signOut()
  redirect('/registrer')
}
