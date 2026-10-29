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
import { brevoAuthenticatedDomains, brevoSend } from '../_shared/brevo.ts'
import {
  AUTH_ACTIONS,
  authLink,
  authSite,
  brandedCatalogue,
  brandNameOf,
  isReservedAddress,
  orgLangOf,
  MARKET_AUTH_LANG,
  MARKET_MAIL_DOMAIN,
  MARKET_SUPPORT_MAIL,
  mailFrom,
  renderAuth,
  supportFor,
  withMailOverrides,
  type AuthAction,
  type MailCatalogue,
} from '../_shared/mail.ts'
import { MAIL } from '../_shared/messages.gen.ts'

/**
 * The mail texts with their approved overrides (0101, D-152), read with the service key the
 * platform gives every function. A slow or failed read sends the deployed texts: a sign-in mail
 * never waits on a wording.
 */
async function withOverrides(cat: MailCatalogue, lang: string): Promise<MailCatalogue> {
  if (lang !== 'no' && lang !== 'en') return cat
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return cat
  try {
    const res = await fetch(`${url}/rest/v1/rpc/message_overrides`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_locale: lang }),
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) {
      await res.body?.cancel()
      return cat
    }
    return { ...cat, [lang]: await withMailOverrides(cat[lang], (await res.json()) as Record<string, unknown>) }
  } catch {
    return cat
  }
}

interface HookPayload {
  user: { email?: string; user_metadata?: { lang?: string } }
  /** redirect_to: where the request asked to come back to, which Auth has held to its allow list */
  email_data: { token_hash: string; email_action_type: string; redirect_to?: string }
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

  // the site the person signed up, was invited or asked on (UK-G, D-275): its link, brand and language
  const site = authSite(data.email_data.redirect_to, Deno.env.get('ORGPULS_APP_URL') ?? '')
  // the language the person asked in (a demo link carries the page's), English for Swedish and German,
  // which the mail is not written in (orgLangOf); else the site's market's
  const lang = orgLangOf(data.user.user_metadata?.lang ?? (site.market ? MARKET_AUTH_LANG[site.market] : undefined))
  const link = authLink(site.url, action, data.email_data.token_hash)
  const brand = brandNameOf(site.market)
  const key = Deno.env.get('BREVO_API_KEY') ?? ''
  // the brand's domain is asked beside the wordings, and briefly: Auth waits on this hook, and a slow
  // answer sends from the product's address rather than not at all
  const [cat, domains] = await Promise.all([
    withOverrides(MAIL as unknown as MailCatalogue, lang),
    site.market && MARKET_MAIL_DOMAIN[site.market] ? brevoAuthenticatedDomains(key, 1000) : Promise.resolve(new Set<string>()),
  ])
  const footer = site.market ? `${brand} · ${new URL(site.url).host.replace(/^www\./, '')}` : undefined
  const r = renderAuth(brandedCatalogue(cat, brand, site.market ? MARKET_SUPPORT_MAIL[site.market] : undefined), action, lang, email, link, footer)

  const base = { email: Deno.env.get('ORGPULS_MAIL_FROM') ?? '', name: Deno.env.get('ORGPULS_MAIL_FROM_NAME') ?? 'Orgpuls' }
  const res = await brevoSend(key, {
    ...mailFrom(base, site.market, domains, supportFor(site.market, Deno.env.get('ORGPULS_SUPPORT_MAIL') ?? 'hjelp@orgpuls.no')),
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
