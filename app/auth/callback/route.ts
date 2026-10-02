import type { Route } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { SIGNUP_COOKIE } from '@/lib/auth/cookies'
import { checkMicrosoftSignIn } from '@/lib/entra/read'
import { signInProblem, type SignInCheck } from '@/lib/entra/schema'
import { restoreLocale } from '@/lib/i18n/server'
import { recordSource } from '@/lib/signup/source'
import { createClient } from '@/lib/supabase/server'

/**
 * Where Google (D-102) and Microsoft (D-201) send the browser back. The code is exchanged for a
 * session, then:
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
 * **Microsoft (D-201).** After every exchange, whatever the query says, the database's sign-in
 * rules run (public.entra_sign_in_check, 0155): a session that did not come through Microsoft
 * passes untouched; one that did must belong to a member, from the organisation's bound tenant
 * if it has one, and from the Microsoft person (tenant id, object id) the membership was bound to
 * on its first Microsoft sign-in. The query's `p` only chooses which message a failure shows, so
 * nobody can route a Microsoft sign-in past the rules by editing the address. A refused session
 * is signed out locally — only this browser's session, so a stranger's Microsoft account that
 * Supabase linked to somebody's address cannot sign that person out everywhere. The one refusal
 * that is not final is "no membership yet" on the invitation and signup paths: the membership is
 * made next (accept_invite, create_organisation) and the rules run again straight after.
 *
 * **This route is not the only way to a session (D-204).** A client can exchange the code itself
 * (POST /auth/v1/token?grant_type=pkce), take the implicit flow's tokens, or post a Microsoft ID
 * token, and never come here. So the same rules (app.entra_rules, shared with the check above)
 * also run inside Supabase Auth, in the Custom Access Token hook public.entra_access_token_hook
 * (0156): every 'oauth' issuance is judged, and a refresh of a session this route recorded as
 * Microsoft's is judged again. The hook must be switched on in the dashboard before the azure
 * provider (docs/integrations/entra-signin.md). A sign-in it refuses fails the exchange below
 * with a 403 and never becomes a session; this route's check remains the one that binds the
 * membership and records the session.
 *
 * The query is parsed before use and every redirect is a fixed path: no open redirect.
 */
const Query = z.object({
  code: z.string().min(8).max(500),
  flow: z.enum(['login', 'signup', 'invite']).default('login'),
  token: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  p: z.enum(['google', 'azure']).default('google'),
})

const Pending = z.object({
  orgNumber: z.string().regex(/^\d{9}$/),
  companyName: z.string().min(1).max(200),
  employeeCount: z.number().int().min(0).max(100_000),
})

export async function GET(request: NextRequest) {
  const q = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!q.success) redirect('/logg-inn?feil=google_failed')
  const { code, flow, token, p } = q.data
  const problem = p === 'azure' ? 'microsoft_failed' : 'google_failed'
  const failed = (flow === 'signup' ? `/registrer?feil=${problem}` : `/logg-inn?feil=${problem}`) as Route

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    console.error(`[auth] ${p} exchange refused: ${error?.code ?? error?.status ?? 'no_user'}`)
    // the token hook's refusal (0156): the one message every rule's refusal gets, never which rule
    if (p === 'azure' && error?.status === 403) redirect('/logg-inn?feil=microsoft_refused')
    redirect(failed)
  }
  const user = data.user

  // platform admins sign in with a password and TOTP on the admin host, never with Google or Microsoft
  const { data: who } = await supabase.rpc('admin_whoami')
  if (z.object({ is_admin: z.literal(true) }).safeParse(who).success) {
    await supabase.auth.signOut({ scope: 'local' })
    redirect(failed)
  }

  // the Microsoft rules, for every provider (see above); codes only are ever logged
  const refuse = async (check: SignInCheck & { ok: false }): Promise<never> => {
    console.error(`[auth] microsoft sign-in refused: ${check.error}`)
    await supabase.auth.signOut({ scope: 'local' })
    redirect((check.error === 'not_signed_in' ? failed : `/logg-inn?feil=${signInProblem(check.error)}`) as Route)
  }
  const check = await checkMicrosoftSignIn(supabase)
  if (!check.ok && !(check.error === 'no_membership' && flow !== 'login')) await refuse(check)

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
      const parsed = Pending.safeParse(JSON.parse(raw ?? 'null'))
      pending = parsed.success ? parsed.data : null
    } catch {
      pending = null
    }
    if (!pending) {
      await signOutIfMicrosoft(supabase, check)
      redirect(`/registrer?feil=${problem}` as Route)
    }
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
      await signOutIfMicrosoft(supabase, check)
      redirect(`/registrer?feil=${why}` as Route)
    }
    // the new membership now exists: the first Microsoft sign-in binds it, as for any member
    if (!check.ok) {
      const again = await checkMicrosoftSignIn(supabase)
      if (!again.ok) {
        console.error(`[auth] microsoft sign-in refused after signup: ${again.error}`)
        await supabase.auth.signOut({ scope: 'local' })
        redirect(`/registrer?feil=${problem}` as Route)
      }
    }
    await recordSource(supabase)
    await restoreLocale(supabase)
    redirect('/registrer?ferdig=1')
  }

  // login
  if (!hasOrg) {
    await supabase.auth.signOut({ scope: 'local' })
    redirect(p === 'azure' ? '/logg-inn?feil=microsoft_refused' : '/logg-inn?feil=google_no_account')
  }
  await restoreLocale(supabase)
  redirect('/innsikt')
}

/**
 * A Microsoft session with no organisation is not left behind when the signup cannot finish.
 * A Google one is, as before D-201: its account exists and the signup can be retried.
 */
async function signOutIfMicrosoft(supabase: Awaited<ReturnType<typeof createClient>>, check: SignInCheck) {
  if (check.microsoft) await supabase.auth.signOut({ scope: 'local' })
}
