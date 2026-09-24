/**
 * orgpuls-dispatch — empties app.outbox through Brevo. D-65.
 *
 * Called every five minutes by pg_cron through pg_net (migration 0032), with a secret of
 * its own in `x-dispatch-secret`. Not the service-role key: this caller needs to be able to
 * start a drain, nothing else, and a leaked drain trigger is a nuisance where a leaked
 * service key is the database. `verify_jwt` is off because pg_net sends no JWT.
 *
 * The loop: claim a batch (the database mints each respondent link, leases the row and,
 * since 0033, picks the channel), render, send, and report each row as done or failed. An
 * SMS that cannot be sent — no credits, an unregistered sender, a number the operator
 * refuses — falls back to e-mail when the person has an address, so nobody is left out. A rejected key stops the run and
 * gives every unsent claim back without spending an attempt, so a bad key cannot exhaust
 * the queue. Log lines carry row ids and HTTP codes — never an address, never a link.
 *
 *   POST                  drain until the queue is empty or 40 s have passed
 *   POST ?probe=1         report the Brevo account's state, send nothing
 *   POST ?probe=send      send one sample invitation in Brevo's sandbox (validated, dropped)
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { brevoSend, brevoSendSms, type SendResult } from '../_shared/brevo.ts'
import { groupsOf, langOf, renderNotice, smsLead, type MailCatalogue, type NoticeJob } from '../_shared/mail.ts'
import { smsContent, smsLength } from '../_shared/sms.ts'
import { MAIL } from '../_shared/messages.gen.ts'

const BATCH = 25
const BUDGET_MS = 40_000

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]
  return d === 0
}

function env(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`missing setting ${name}`)
  return v
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const secret = Deno.env.get('ORGPULS_DISPATCH_SECRET') ?? ''
  if (!secret || !same(req.headers.get('x-dispatch-secret') ?? '', secret)) return json({ error: 'unauthorised' }, 403)

  const key = env('BREVO_API_KEY')
  const sender = { email: env('ORGPULS_MAIL_FROM'), name: Deno.env.get('ORGPULS_MAIL_FROM_NAME') ?? 'Orgpuls' }
  const smsSender = Deno.env.get('ORGPULS_SMS_SENDER') ?? 'Orgpuls'
  const appUrl = env('ORGPULS_APP_URL')
  const cat = MAIL as unknown as MailCatalogue
  const probe = new URL(req.url).searchParams.get('probe')

  if (probe === '1') {
    const h = { 'api-key': key, accept: 'application/json' }
    const [acc, dom] = await Promise.all([
      fetch('https://api.brevo.com/v3/account', { headers: h }),
      fetch('https://api.brevo.com/v3/senders/domains', { headers: h }),
    ])
    const domains = dom.ok ? ((await dom.json()) as { domains?: Array<{ domain_name: string; authenticated: boolean }> }).domains ?? [] : []
    const plans = acc.ok ? ((await acc.json()) as { plan?: Array<{ type: string; credits?: number }> }).plan ?? [] : []
    return json({
      account: acc.status,
      smsCredits: plans.filter((p) => p.type === 'sms').reduce((n, p) => n + (p.credits ?? 0), 0),
      smsSender,
      senderDomain: sender.email.split('@')[1],
      senderDomainAuthenticated: domains.some((d) => d.domain_name === sender.email.split('@')[1] && d.authenticated),
      appHost: new URL(appUrl).host,
    })
  }

  if (probe === 'send') {
    const job: NoticeJob = {
      id: 'probe', kind: 'invitasjon', audience: null, channel: 'email', sms_text: null, lang: 'no', org: 'Orgpuls', k: 5,
      round: { kind: 'grunnlinje', year: 2026, pulse: null, opens_at: null, closes_at: new Date().toISOString() },
      recipients: [{ email: 'probe@orgpuls.com', phone: null, name: 'Probe', lang: 'no', member: false }],
      token: '0'.repeat(64),
    }
    const r = renderNotice(cat, job, { lang: 'no', member: false, name: 'Probe' }, appUrl)
    const res = await brevoSend(key, { sender, to: [{ email: 'probe@orgpuls.com', name: 'Probe' }], subject: r.subject, html: r.html, text: r.text, tag: 'orgpuls-probe' }, { sandbox: true })
    return json(res.ok ? { ok: true } : res)
  }

  const svc = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const started = Date.now()
  const tally = { claimed: 0, sent: 0, sms: 0, failed: 0, retry: 0, released: 0 }

  while (Date.now() - started < BUDGET_MS) {
    const { data, error } = await svc.rpc('dispatch_claim', { p_batch: BATCH })
    if (error) {
      console.error(`[dispatch] claim failed: ${error.code ?? ''} ${error.message}`)
      return json({ error: 'claim', ...tally }, 500)
    }
    const jobs = (data ?? []) as NoticeJob[]
    if (jobs.length === 0) break
    tally.claimed += jobs.length

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]
      let outcome: SendResult = { ok: true, id: '' }
      let channel: 'email' | 'sms' = 'email'
      const sendMail = async () => {
        for (const g of groupsOf(job)) {
          const to = g.to.filter((r) => r.email)
          if (to.length === 0) return { ok: false, retryable: false, auth: false, code: 'no_address' } as SendResult
          const r = renderNotice(cat, job, g, appUrl)
          const res = await brevoSend(key, { sender, to: to.map((p) => ({ email: p.email as string, name: p.name })), subject: r.subject, html: r.html, text: r.text, tag: `orgpuls-${job.kind}` })
          if (!res.ok) return res
          outcome = res
        }
        return outcome
      }
      try {
        const person = job.recipients[0]
        if (job.channel === 'sms' && person?.phone && job.token) {
          const lang = langOf(person.lang ?? job.lang)
          const content = smsContent(smsLead(cat, job, lang), `${appUrl.replace(/\/+$/, '')}/s/${job.token}`)
          outcome = await brevoSendSms(key, {
            sender: smsSender,
            recipient: person.phone,
            content,
            unicode: smsLength(content).unicode,
            tag: `orgpuls-${job.kind}`,
          })
          channel = 'sms'
          if (!outcome.ok && !outcome.auth && person.email) {
            // the same link, by the channel that works; the failure is logged by code
            console.error(`[dispatch] ${job.id}: ${outcome.code}, falling back to e-mail`)
            channel = 'email'
            outcome = await sendMail()
          }
        } else {
          outcome = await sendMail()
        }
      } catch (e) {
        // a rendering fault is a bug in this code, not a property of the row: keep it for a fix
        console.error(`[dispatch] ${job.id}: render failed: ${(e as Error).message}`)
        outcome = { ok: false, retryable: true, auth: false, code: 'render' }
      }

      if (outcome.ok) {
        await svc.rpc('dispatch_done', { p_id: job.id, p_ok: true, p_provider_id: outcome.id || null, p_channel: channel })
        tally.sent++
        if (channel === 'sms') tally.sms++
      } else if (outcome.auth) {
        const rest = jobs.slice(i).map((j) => j.id)
        await svc.rpc('dispatch_release', { p_ids: rest, p_error: 'provider_unauthorised' })
        tally.released += rest.length
        console.error(`[dispatch] Brevo refused the key (${outcome.code}); ${rest.length} claims given back`)
        return json({ error: 'provider_unauthorised', ...tally }, 502)
      } else {
        await svc.rpc('dispatch_done', { p_id: job.id, p_ok: false, p_error: outcome.code, p_permanent: !outcome.retryable })
        if (outcome.retryable) tally.retry++
        else tally.failed++
        console.error(`[dispatch] ${job.id}: ${outcome.code}${outcome.retryable ? ', will retry' : ', given up'}`)
      }
    }
    if (jobs.length < BATCH) break
  }

  if (tally.claimed) console.log(`[dispatch] claimed ${tally.claimed}, sent ${tally.sent} (${tally.sms} by SMS), retry ${tally.retry}, failed ${tally.failed}`)
  return json(tally)
})
