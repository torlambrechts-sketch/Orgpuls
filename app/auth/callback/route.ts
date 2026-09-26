import type { Route } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { SIGNUP_COOKIE } from '@/lib/auth/cookies'
import { restoreLocale } from '@/lib/i18n/server'
import { recordSource } from '@/lib/signup/source'
import { createClient } from '@/lib/supabase/server'

/**
 * Where Google sends the browser back (D-102). The code is exchanged for a session, then:
 *
 *   * login  — an account with an organisation goes in. A Google account Orgpuls does not
 *              know is signed out again and told to register or use its invitation: signing
 *              in must never quietly create a customer.
 *   * signup — the company kept in a cookie by continueWithGoogle becomes the organisation,
 *              exactly as a password signup's does, unless the account already has one.
 *   * invite — back to the invitation, now signed in, where the invited address is checked.
 *
 * A platform admin's account is refused whatever the flow: admin identities are separate
 * and sign in with a password and a second factor only (D-90).
 *
 * The query is parsed before use and every redirect is a fixed path: no open redirect.
 */
const Query = z.object({
  code: z.string().min(8).max(500),
  flow: z.enum(['login', 'signup', 'invite']).default('login'),
  token: z.string().regex(/^[0-9a-f]{64}$/).optional(),
})

const Pending = z.object({
  orgNumber: z.string().regex(/^\d{9}$/),
  companyName: z.string().min(1).max(200),
  employeeCount: z.number().int().min(0).max(100_000),
  attribution: z.string().max(4000).nullable(),
})

export async function GET(request: NextRequest) {
  const q = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!q.success) redirect('/logg-inn?feil=google_failed')
  const { code, flow, token } = q.data
  const failed = flow === 'signup' ? '/registrer?feil=google_failed' : '/logg-inn?feil=google_failed'

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    console.error(`[auth] google exchange refused: ${error?.code ?? error?.status ?? 'no_user'}`)
    redirect(failed)
  }
  const user = data.user

  // platform admins sign in with a password and TOTP on the admin host, never with Google
  const { data: who } = await supabase.rpc('admin_whoami')
  if (z.object({ is_admin: z.literal(true) }).safeParse(who).success) {
    await supabase.auth.signOut()
    redirect('/logg-inn?feil=google_failed')
  }

  if (flow === 'invite' && token) redirect(`/bli-med/${token}` as Route)

  const { data: member } = await supabase.schema('app').from('memberships').select('org_id').eq('user_id', user.id).eq('active', true).limit(1)
  const hasOrg = Array.isArray(member) && member.length > 0

  if (flow === 'signup') {
    const jar = await cookies()
    const raw = jar.get(SIGNUP_COOKIE)?.value
    jar.delete(SIGNUP_COOKIE)
    if (hasOrg) {
      await restoreLocale(supabase)
      redirect('/innsikt')
    }
    let pending: z.infer<typeof Pending> | null = null
    try {
      const p = Pending.safeParse(JSON.parse(raw ?? 'null'))
      pending = p.success ? p.data : null
    } catch {
      pending = null
    }
    if (!pending) redirect('/registrer?feil=google_failed')
    const meta = user.user_metadata as { full_name?: unknown; name?: unknown }
    const fullName =
      [meta.full_name, meta.name].find((v): v is string => typeof v === 'string' && v.trim().length > 1)?.trim().slice(0, 120) ??
      (user.email ?? '').split('@')[0] ??
      ''
    const { data: made, error: madeError } = await supabase.rpc('create_organisation', {
      p_name: pending.companyName,
      p_org_number: pending.orgNumber,
      p_employee_count: pending.employeeCount,
      p_full_name: fullName,
    })
    const outcome = z.object({ ok: z.boolean(), error: z.string().optional() }).safeParse(made)
    if (madeError || !outcome.success || !outcome.data.ok) {
      const why = outcome.success && outcome.data.error && /^[a-z_]{1,40}$/.test(outcome.data.error) ? outcome.data.error : 'org_failed'
      redirect(`/registrer?feil=${why}` as Route)
    }
    await recordSource(supabase, pending.attribution)
    await restoreLocale(supabase)
    redirect('/registrer?ferdig=1')
  }

  // login
  if (!hasOrg) {
    await supabase.auth.signOut()
    redirect('/logg-inn?feil=google_no_account')
  }
  await restoreLocale(supabase)
  redirect('/innsikt')
}
