'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { marketOfHost } from '@/lib/hosts'
import { normalizeOrgNumber, validOrgNumber } from '@/lib/org-number'
import { SIGNUP_COOKIE } from './cookies'

/**
 * "Fortsett med Google" (D-102) and «Fortsett med Microsoft» (D-201): signing in, signing up and
 * accepting an invitation.
 *
 * The browser goes to Google and back to /auth/callback on the host it started from, with
 * the flow in the query. Supabase keeps the PKCE verifier in a cookie, so the code that
 * comes back is useless to anyone but this browser.
 *
 * Signing up has to survive the round trip: the company the form names (its number only where
 * typed) and the consent travel in a short-lived, http-only cookie. Nothing is written until the
 * callback has a session; signup_organisation then checks everything again, as it does for a
 * password signup, and makes the organisation or files the request to join it (0232, D-279).
 *
 * Microsoft goes through Supabase Auth's `azure` provider, configured against the multitenant
 * `organizations` endpoint, asking for `openid profile email`. The provider in the callback's
 * query only chooses which message a failure shows: the callback runs the Microsoft sign-in
 * rules after every exchange, whatever the query says (app/auth/callback/route.ts).
 */

const Flow = z.discriminatedUnion('flow', [
  z.object({ flow: z.literal('login') }),
  z.object({ flow: z.literal('invite'), token: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.object({
    flow: z.literal('signup'),
    // optional (0232, X-114): empty is none; typed, the shape of any market's number, and the
    // market's own rule once the host has named it (below)
    orgNumber: z
      .string()
      .default('')
      .transform((v) => normalizeOrgNumber(v))
      .pipe(z.union([z.literal(''), z.string().regex(/^[0-9A-Z]{1,10}$/)])),
    companyName: z.string().trim().min(1).max(200),
    employeeCount: z.coerce.number().int().min(0).max(100_000),
    consent: z.literal('on'),
  }),
])

async function origin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'www.orgpuls.com'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

type Provider = 'google' | 'azure'
const PROBLEM: Record<Provider, string> = { google: 'google_failed', azure: 'microsoft_failed' }

async function startOAuth(provider: Provider, formData: FormData): Promise<void> {
  const parsed = Flow.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect(`/logg-inn?feil=${PROBLEM[provider]}` as never)
  const f = parsed.data
  const failed = `${f.flow === 'signup' ? '/registrer' : '/logg-inn'}?feil=${PROBLEM[provider]}`

  const callback = new URL('/auth/callback', await origin())
  callback.searchParams.set('flow', f.flow)
  if (provider === 'azure') callback.searchParams.set('p', 'azure')
  if (f.flow === 'invite') callback.searchParams.set('token', f.token)
  // the number has to be one in the market of the host the sign-up started on (0218), as that
  // market stores it (a UK number of digits only padded to eight, 0222)
  const market = marketOfHost(callback.host)
  if (f.flow === 'signup' && f.orgNumber && !validOrgNumber(market, f.orgNumber)) redirect(failed as never)
  if (f.flow === 'signup') {
    ;(await cookies()).set(
      SIGNUP_COOKIE,
      JSON.stringify({
        orgNumber: f.orgNumber ? normalizeOrgNumber(f.orgNumber, market) : null,
        companyName: f.companyName,
        employeeCount: f.employeeCount,
        // the market of the host the sign-up started on (D-251), read back by the callback
        market,
      }),
      { httpOnly: true, secure: callback.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 1800 },
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callback.toString(),
      queryParams: { prompt: 'select_account' },
      ...(provider === 'azure' ? { scopes: 'openid profile email' } : {}),
    },
  })
  if (error || !data.url) redirect(failed as never)
  redirect(data.url as never)
}

export async function continueWithGoogle(formData: FormData): Promise<void> {
  return startOAuth('google', formData)
}

export async function continueWithMicrosoft(formData: FormData): Promise<void> {
  return startOAuth('azure', formData)
}
