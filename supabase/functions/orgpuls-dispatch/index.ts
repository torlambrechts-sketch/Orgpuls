/**
 * orgpuls-dispatch — empties app.outbox through Brevo. D-65.
 *
 * Called every five minutes by pg_cron through pg_net (migration 0032), with a secret of
 * its own in `x-dispatch-secret`. Not the service-role key: this caller needs to be able to
 * start a drain, nothing else, and a leaked drain trigger is a nuisance where a leaked
 * service key is the database. `verify_jwt` is off because pg_net sends no JWT.
 *
 * After the notices, replies to support tickets (0051) are drained the same way, each sent
 * with the support inbox as Reply-To.
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
 *   POST ?probe=sms       send one real test SMS to {"to": "<number>"}: proves the sender name
 *                         and credits end to end. The number is used once and never logged.
 *   POST ?probe=tracking  whether Brevo counts opens and clicks: 30-day totals, the hosts clicked
 *                         links went through, the registered webhooks — counts and hosts only (D-97)
 *   POST ?probe=webhook   register Brevo's delivery-event webhook for orgpuls-mail-events, once (D-97)
 *   POST ?probe=smsstatus&id=<messageId>
 *                         the delivery events Brevo holds for one SMS: event names, dates
 *                         and reasons only — the number is dropped before anything is returned.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { brevoSend, brevoSendSms, type SendResult } from '../_shared/brevo.ts'
import { groupsOf, langOf, renderNotice, renderTicketReply, smsLead, type MailCatalogue, type NoticeJob, type TicketJob } from '../_shared/mail.ts'
import { normalizePhone, smsContent, smsLength } from '../_shared/sms.ts'
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

  if (probe === 'sms') {
    const body = (await req.json().catch(() => ({}))) as { to?: string }
    const to = normalizePhone(body.to)
    if (!to) return json({ ok: false, code: 'bad_number' }, 400)
    const content = 'Test fra Orgpuls: SMS-utsendingen virker. Du trenger ikke gjøre noe med denne meldingen.'
    const res = await brevoSendSms(key, { sender: smsSender, recipient: to, content, unicode: smsLength(content).unicode, tag: 'orgpuls-probe' })
    return json(res.ok ? { ok: true, id: res.id, sender: smsSender, parts: smsLength(content).parts } : res)
  }

  if (probe === 'smsstatus') {
    const id = new URL(req.url).searchParams.get('id') ?? ''
    if (!/^\d{1,30}$/.test(id)) return json({ ok: false, code: 'bad_id' }, 400)
    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/statistics/events?limit=100&days=2&sort=desc', {
      headers: { 'api-key': key, accept: 'application/json' },
    })
    if (!res.ok) return json({ ok: false, code: `http_${res.status}` })
    const events = ((await res.json()) as { events?: Array<{ messageId?: number | string; event?: string; date?: string; reason?: string }> }).events ?? []
    return json({
      ok: true,
      events: events
        .filter((e) => String(e.messageId) === id)
        .map((e) => ({ event: e.event, date: e.date, reason: e.reason ?? null })),
    })
  }

  if (probe === 'webhook') {
    // D-97: make sure Brevo posts delivery events to orgpuls-mail-events. Idempotent: an
    // existing registration for that function is left as it is. Opens and clicks are not
    // asked for. The answer names hosts and events, never the address with its key.
    const eventsSecret = Deno.env.get('ORGPULS_MAIL_EVENTS_SECRET')
    if (!eventsSecret) return json({ ok: false, code: 'no_secret' })
    const target = `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/orgpuls-mail-events`
    const h = { 'api-key': key, accept: 'application/json' }
    const list = await fetch('https://api.brevo.com/v3/webhooks', { headers: h })
    // without a readable list, registering could make a duplicate: stop instead
    if (!list.ok) return json({ ok: false, code: 'list_failed', listStatus: list.status })
    const hooks = ((await list.json()) as { webhooks?: Array<{ id: number; url?: string; type?: string; events?: string[] }> }).webhooks ?? []
    const ours = hooks.find((w) => (w.url ?? '').startsWith(target))
    if (ours) return json({ ok: true, existing: true, id: ours.id, type: ours.type, events: ours.events ?? [] })
    const created = await fetch('https://api.brevo.com/v3/webhooks', {
      method: 'POST',
      headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `${target}?key=${encodeURIComponent(eventsSecret)}`,
        description: 'Orgpuls delivery events (no opens, no clicks)',
        type: 'transactional',
        events: ['delivered', 'hardBounce', 'softBounce', 'blocked', 'spam', 'invalid', 'deferred', 'unsubscribed'],
      }),
    })
    const out = (await created.json().catch(() => ({}))) as { id?: number; code?: string }
    return json({ ok: created.ok, status: created.status, id: out.id ?? null, code: created.ok ? null : out.code ?? null, listStatus: list.status })
  }

  if (probe === 'tracking') {
    // D-97: is Brevo counting opens and clicks on what we send? Aggregate counts for 30 days,
    // and the hosts that clicked links went through. Never a link itself: an invitation's
    // link carries the respondent's token, so only its host is read, and never an address.
    const h = { 'api-key': key, accept: 'application/json' }
    const [agg, clicks, hooks] = await Promise.all([
      fetch('https://api.brevo.com/v3/smtp/statistics/aggregatedReport?days=30', { headers: h }),
      fetch('https://api.brevo.com/v3/smtp/statistics/events?limit=100&days=30&event=clicks', { headers: h }),
      fetch('https://api.brevo.com/v3/webhooks', { headers: h }),
    ])
    const a = agg.ok ? ((await agg.json()) as Record<string, number>) : {}
    const events = clicks.ok ? ((await clicks.json()) as { events?: Array<{ link?: string; tag?: string }> }).events ?? [] : []
    const hostOf = (u?: string) => {
      try {
        return u ? new URL(u).host : null
      } catch {
        return null
      }
    }
    const byTag: Record<string, number> = {}
    for (const e of events) byTag[e.tag ?? 'none'] = (byTag[e.tag ?? 'none'] ?? 0) + 1
    const hookList = hooks.ok ? ((await hooks.json()) as { webhooks?: Array<{ url?: string; events?: string[] }> }).webhooks ?? [] : []
    return json({
      window_days: 30,
      counts: {
        requests: a.requests ?? null, delivered: a.delivered ?? null, opens: a.opens ?? null, uniqueOpens: a.uniqueOpens ?? null,
        clicks: a.clicks ?? null, uniqueClicks: a.uniqueClicks ?? null, hardBounces: a.hardBounces ?? null, softBounces: a.softBounces ?? null,
        blocked: a.blocked ?? null, invalid: a.invalid ?? null, spamReports: a.spamReports ?? null, unsubscribed: a.unsubscribed ?? null,
      },
      clickEvents: events.length,
      clicksByTag: byTag,
      clickedLinkHosts: [...new Set(events.map((e) => hostOf(e.link)).filter(Boolean))],
      webhooks: hookList.map((w) => ({ host: hostOf(w.url), events: w.events ?? [] })),
      status: { aggregated: agg.status, events: clicks.status, webhooks: hooks.status },
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

  // replies to support tickets (0051, D-92), answered to the support inbox
  const replyTo = { email: Deno.env.get('ORGPULS_SUPPORT_MAIL') ?? 'hjelp@orgpuls.no', name: 'Orgpuls' }
  const tickets = { sent: 0, retry: 0, failed: 0 }
  while (Date.now() - started < BUDGET_MS) {
    const { data, error } = await svc.rpc('ticket_mail_claim', { p_batch: BATCH })
    if (error) {
      console.error(`[dispatch] ticket claim failed: ${error.code ?? ''} ${error.message}`)
      break
    }
    const jobs = (data ?? []) as TicketJob[]
    if (jobs.length === 0) break
    for (const job of jobs) {
      let outcome: SendResult
      try {
        const r = renderTicketReply(cat, job)
        outcome = await brevoSend(key, {
          sender,
          to: [{ email: job.to_email, name: job.to_name }],
          subject: r.subject,
          html: r.html,
          text: r.text,
          tag: 'orgpuls-ticket',
          replyTo,
        })
      } catch (e) {
        console.error(`[dispatch] ticket ${job.id}: render failed: ${(e as Error).message}`)
        outcome = { ok: false, retryable: true, auth: false, code: 'render' }
      }
      await svc.rpc('ticket_mail_done', {
        p_id: job.id,
        p_ok: outcome.ok,
        p_provider_id: outcome.ok ? outcome.id || null : null,
        p_error: outcome.ok ? null : outcome.code,
        p_permanent: !outcome.ok && !outcome.retryable,
      })
      if (outcome.ok) tickets.sent++
      else if (outcome.retryable) tickets.retry++
      else tickets.failed++
      if (!outcome.ok) console.error(`[dispatch] ticket ${job.id}: ${outcome.code}`)
      if (!outcome.ok && outcome.auth) return json({ error: 'provider_unauthorised', ...tally, tickets }, 502)
    }
    if (jobs.length < BATCH) break
  }
  if (tickets.sent + tickets.retry + tickets.failed) console.log(`[dispatch] ticket replies: sent ${tickets.sent}, retry ${tickets.retry}, failed ${tickets.failed}`)
  return json({ ...tally, tickets })
})
