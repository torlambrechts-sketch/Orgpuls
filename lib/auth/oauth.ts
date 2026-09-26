'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { SIGNUP_COOKIE } from './cookies'

/**
 * "Fortsett med Google" (D-102): signing in, signing up and accepting an invitation.
 *
 * The browser goes to Google and back to /auth/callback on the host it started from, with
 * the flow in the query. Supabase keeps the PKCE verifier in a cookie, so the code that
 * comes back is useless to anyone but this browser.
 *
 * Signing up has to survive the round trip: the company found in step 1 and the consent
 * given in step 2 travel in a short-lived, http-only cookie. Nothing is written until the
 * callback has a session; create_organisation then checks everything again, as it does
 * for a password signup.
 */

const Flow = z.discriminatedUnion('flow', [
  z.object({ flow: z.literal('login') }),
  z.object({ flow: z.literal('invite'), token: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.object({
    flow: z.literal('signup'),
    orgNumber: z.string().regex(/^\d{9}$/),
    companyName: z.string().trim().min(1).max(200),
    employeeCount: z.coerce.number().int().min(0).max(100_000),
    consent: z.literal('on'),
    attribution: z.string().max(4000).optional(),
  }),
])

async function origin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'www.orgpuls.com'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function continueWithGoogle(formData: FormData): Promise<void> {
  const parsed = Flow.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/logg-inn?feil=google_failed')
  const f = parsed.data

  const callback = new URL('/auth/callback', await origin())
  callback.searchParams.set('flow', f.flow)
  if (f.flow === 'invite') callback.searchParams.set('token', f.token)
  if (f.flow === 'signup') {
    ;(await cookies()).set(
      SIGNUP_COOKIE,
      JSON.stringify({
        orgNumber: f.orgNumber,
        companyName: f.companyName,
        employeeCount: f.employeeCount,
        attribution: f.attribution ?? null,
      }),
      { httpOnly: true, secure: callback.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 1800 },
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callback.toString(), queryParams: { prompt: 'select_account' } },
  })
  if (error || !data.url) redirect(f.flow === 'signup' ? '/registrer?feil=google_failed' : '/logg-inn?feil=google_failed')
  redirect(data.url as never)
}
