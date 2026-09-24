/**
 * orgpuls-auth-mail — Supabase Auth's send-email hook, delivering through Brevo. D-65.
 *
 * Auth calls this instead of its built-in mailer, which allowed two messages an hour and
 * linked to whatever Site URL said. The request is signed (Standard Webhooks) with a secret
 * only Auth and this function hold; an unsigned or tampered call is refused before anything
 * is read from it.
 *
 * The link is built here, not by Auth: it points at the app's /auth/confirm, which verifies
 * the token hash server-side and sets the session cookie — so a password reset opens
 * /nytt-passord signed in, rather than a page that has to fish a token out of a fragment.
 *
 * Handled: recovery, signup, magiclink, invite. Anything else (an e-mail change, a
 * reauthentication code) has no screen in this product; it is refused with an error Auth
 * shows, rather than sent as a mail nobody can act on.
 */
import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { brevoSend } from '../_shared/brevo.ts'
import { AUTH_ACTIONS, authLink, isReservedAddress, langOf, renderAuth, type AuthAction, type MailCatalogue } from '../_shared/mail.ts'
import { MAIL } from '../_shared/messages.gen.ts'

interface HookPayload {
  user: { email?: string; user_metadata?: { lang?: string } }
  email_data: { token_hash: string; email_action_type: string }
}

const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'method')

  const secret = (Deno.env.get('ORGPULS_AUTH_HOOK_SECRET') ?? '').replace(/^v1,whsec_/, '')
  const payload = await req.text()
  let data: HookPayload
  try {
    data = new Webhook(secret).verify(payload, Object.fromEntries(req.headers)) as HookPayload
  } catch {
    return fail(401, 'invalid signature')
  }

  const action = data.email_data?.email_action_type as AuthAction
  const email = data.user?.email
  if (!AUTH_ACTIONS.includes(action)) return fail(400, `unsupported email action: ${String(action)}`)
  if (!email || !data.email_data.token_hash) return fail(400, 'incomplete payload')
  // a demo account's address cannot exist; acknowledged, never sent (0032's rule 4)
  if (isReservedAddress(email)) {
    console.log(`[auth-mail] ${action}: reserved domain, not sent`)
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const lang = langOf(data.user.user_metadata?.lang)
  const link = authLink(Deno.env.get('ORGPULS_APP_URL') ?? '', action, data.email_data.token_hash)
  const r = renderAuth(MAIL as unknown as MailCatalogue, action, lang, email, link)

  const res = await brevoSend(Deno.env.get('BREVO_API_KEY') ?? '', {
    sender: { email: Deno.env.get('ORGPULS_MAIL_FROM') ?? '', name: Deno.env.get('ORGPULS_MAIL_FROM_NAME') ?? 'Orgpuls' },
    to: [{ email }],
    subject: r.subject,
    html: r.html,
    text: r.text,
    tag: `orgpuls-auth-${action}`,
  })
  if (!res.ok) {
    console.error(`[auth-mail] ${action}: ${res.code}`)
    return fail(502, 'the mail could not be sent')
  }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
})
