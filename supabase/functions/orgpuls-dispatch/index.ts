/**
 * orgpuls-dispatch — empties app.outbox through Brevo. D-65.
 *
 * Called every five minutes by pg_cron through pg_net (migration 0032), with a secret of
 * its own in `x-dispatch-secret`. Not the service-role key: this caller needs to be able to
 * start a drain, nothing else, and a leaked drain trigger is a nuisance where a leaked
 * service key is the database. `verify_jwt` is off because pg_net sends no JWT.
 *
 * After the notices, the trial's service mail (0060, D-105) is drained the same way, on the
 * product's sender with the support inbox as Reply-To, since each of those invites an answer.
 *
 * A notice to a role (0134, D-97) goes to each person as a message of its own, recorded with its
 * provider id as it is sent (`dispatch_recipient_sent`), so a delivery event is set on the person
 * it concerns and a retry skips the people it already reached (`dispatch_reached`). A personal
 * message is one person already, and keeps its one id on the outbox row.
 *
 * Marketing mail and support tickets left Orgpuls with the admin (D-230): the platform sends its
 * own, from its own domain. What Orgpuls still sends for its leads is one copy of each – a contact
 * message, a demo request, a template download – to ORGPULS_LEAD_COPY_TO, as a backstop (0209, D-242).
 *
 * The loop: claim a batch (the database mints each respondent link, leases the row and,
 * since 0033, picks the channel), render, send, and report each row as done or failed. An
 * SMS that cannot be sent — no credits, an unregistered sender, a number the operator
 * refuses — falls back to e-mail when the person has an address, so nobody is left out.
 * A Teams message (0176, D-203) does the same: a person who blocked the app, or for whom it is
 * not installed, is recorded as such (teams_dispatch_result) and gets the same link by e-mail
 * in the same run, or by SMS where that may carry it; refused bot credentials stop Teams for the
 * rest of the run, never the run itself. A rejected key stops the run and
 * gives every unsent claim back without spending an attempt, so a bad key cannot exhaust
 * the queue. Log lines carry row ids and HTTP codes — never an address, never a link.
 *
 * Slack (0185, D-205) is a direct message from the organisation's own installation, falling back
 * the same way: whatever Slack refuses, the person gets the same link by e-mail in the same run.
 * Each run first revokes the tokens a disconnect left and matches the workspaces due a sync
 * (_shared/slack.ts), and never logs a token, a member id or a text.
 *
 *   POST                  drain until the queue is empty or 40 s have passed
 *   POST ?probe=1         report the Brevo account's state, send nothing
 *   POST ?probe=send      send one sample invitation in Brevo's sandbox (validated, dropped)
 *   POST ?probe=sms       send one real test SMS to {"to": "<number>"}: proves the sender name
 *                         and credits end to end. The number is used once and never logged.
 *   POST ?probe=tracking  whether Brevo counts opens and clicks: 30-day totals, the hosts clicked
 *                         links went through, the registered webhooks — counts and hosts only (D-97)
 *   POST ?probe=webhook   register Brevo's delivery-event webhook for orgpuls-mail-events, once (D-97)
 *   POST ?probe=teams     whether the Teams bot is configured and Microsoft issues it a token: the
 *                         credential kind and HTTP codes only, never the token (0176, D-203)
 *   POST ?probe=smsstatus&id=<messageId>
 *                         the delivery events Brevo holds for one SMS: event names, dates
 *                         and reasons only — the number is dropped before anything is returned.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { brevoSend, brevoSendSms, type SendResult } from '../_shared/brevo.ts'
import { renderLeadCopy, type LeadEvent } from '../_shared/lead-copy.ts'
import {
  groupsOf,
  inTurns,
  offeredFor,
  orgLangOf,
  pendingSends,
  perRecipient,
  personalLang,
  personalLink,
  type LanguageOffer,
  brandNameOf,
  marketCatalogue,
  renderLifecycle,
  renderNotice,
  renderReplyNotice,
  replyNoticeSms,
  threadLink,
  pick,
  smsLead,
  type LifecycleJob,
  type MailCatalogue,
  type NoticeJob,
  type ReplyNoticeJob,
  withMailOverrides,
} from '../_shared/mail.ts'
import { normalizePhone, smsContent, smsLength } from '../_shared/sms.ts'
import {
  afterTeams,
  botToken,
  credentialKind,
  DEFAULT_SERVICE_URL,
  isServiceUrl,
  pickLead,
  sendTeams,
  teamsActivity,
  teamsRecord,
  teamsTarget,
  type BotCredentials,
  type FetchLike,
  type TeamsOutcome,
} from '../_shared/teams.ts'
import { afterSlack, slackApp, slackRun, type FetchLike as SlackFetch } from '../_shared/slack.ts'
import { MAIL, MAIL_PACKS, RESPONDENT_UI, SIGNED_OFF_FLAGS, SURVEY_ONLY, SURVEY_SOURCE } from '../_shared/messages.gen.ts'
import { complete, nest, type Approved } from '../_shared/survey-texts.ts'

const BATCH = 25

/** A claimed «Send test til meg» (0127): whom to, and the invitation's facts as the preview reads them */
interface TestJob {
  id: string
  round_id: string
  to: string
  name: string | null
  preview: {
    org: string
    lang: string
    k: number
    round: NonNullable<NoticeJob['round']>
    publish_on: string | null
    intro: string | null
    intro_by: string | null
    org_greeting: { text: string; by: string | null } | null
    minutes: number | null
    results_shared: boolean
    since: NoticeJob['since']
    logo: string | null
    results_page: string | null
  } | null
}
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
  // the sender's name is the brand of the organisation's market (X-111); its address stays the product's
  // own until the brand's domain is verified in Brevo
  const senderOf = (market: string | null | undefined) => (brandNameOf(market) === 'Orgpuls' ? sender : { ...sender, name: brandNameOf(market) })
  const smsSender = Deno.env.get('ORGPULS_SMS_SENDER') ?? 'Orgpuls'
  const appUrl = env('ORGPULS_APP_URL')
  // a copy: the survey languages' texts are added per run, from the registry (below)
  const cat: MailCatalogue = { ...(MAIL as unknown as MailCatalogue) }
  // the language flags this function runs with, as the app's: the signed-off ones it was deployed
  // with (lib/flags.signed-off.json) and ORGPULS_FLAGS. None, and no pilot (0085) for the job's
  // organisation, means every personal message stays in the organisation's language (D-127)
  const flagsEnv = (Deno.env.get('ORGPULS_FLAGS') ?? '').trim()
  const named = new Set([...SIGNED_OFF_FLAGS, ...flagsEnv.split(',').map((f) => f.trim()).filter(Boolean)])
  const offer: LanguageOffer | null =
    flagsEnv === '*' ? { flags: '*', hashes: RESPONDENT_UI } : { flags: named, hashes: RESPONDENT_UI }
  // engagement phase 2 (0105): «Siden sist» in an invitation's e-mail, only with its flag on
  const sinceOn = flagsEnv === '*' || named.has('engagement_since_last')
  const probe = new URL(req.url).searchParams.get('probe')
  // Teams (0176, D-203): the bot's own single-tenant registration; a certificate where one is set
  const bot: BotCredentials = {
    appId: (Deno.env.get('TEAMS_BOT_APP_ID') ?? '').trim().toLowerCase(),
    tenantId: (Deno.env.get('TEAMS_BOT_TENANT_ID') ?? '').trim().toLowerCase(),
    secret: Deno.env.get('TEAMS_BOT_SECRET') ?? null,
    certPem: Deno.env.get('TEAMS_BOT_CERT_PEM') ?? null,
    keyPem: Deno.env.get('TEAMS_BOT_CERT_KEY') ?? null,
  }
  const teamsServiceUrl = isServiceUrl(Deno.env.get('TEAMS_SERVICE_URL')) ? (Deno.env.get('TEAMS_SERVICE_URL') as string) : DEFAULT_SERVICE_URL
  const teamsFetch = fetch as unknown as FetchLike
  let botTok: { token: string; expiresAt: number } | null = null
  // set when Microsoft refuses the bot: nothing more goes by Teams in this run
  let teamsDown = credentialKind(bot) === null
  const teamsToken = async (): Promise<string | null> => {
    if (teamsDown) return null
    if (botTok && botTok.expiresAt > Date.now()) return botTok.token
    const t = await botToken(teamsFetch, bot, Date.now(), crypto.randomUUID())
    if (!t.ok) {
      console.error(`[dispatch] teams token: ${t.code}`)
      teamsDown = true
      return null
    }
    botTok = { token: t.token, expiresAt: t.expiresAt }
    return t.token
  }

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

  if (probe === 'teams') {
    const kind = credentialKind(bot)
    if (!kind) return json({ ok: false, code: 'teams_not_configured' })
    const t = await botToken(teamsFetch, bot, Date.now(), crypto.randomUUID())
    return json(t.ok ? { ok: true, credential: kind, serviceUrl: teamsServiceUrl } : { ok: false, credential: kind, code: t.code })
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
    // one webhook per channel (D-98): `?probe=webhook&channel=sms` registers the SMS one
    const channel = new URL(req.url).searchParams.get('channel') === 'sms' ? 'sms' : 'email'
    const ours = hooks.find((w) => (w.url ?? '').startsWith(target) && (w.url ?? '').includes('channel=sms') === (channel === 'sms'))
    const emailEvents = ['delivered', 'hardBounce', 'softBounce', 'blocked', 'spam', 'invalid', 'deferred', 'unsubscribed']
    if (ours && channel === 'email' && emailEvents.some((e) => !(ours.events ?? []).includes(e))) {
      // an event the registration lacks is added; opens and clicks are never asked for (D-230)
      const upd = await fetch(`https://api.brevo.com/v3/webhooks/${ours.id}`, {
        method: 'PUT',
        headers: { ...h, 'content-type': 'application/json' },
        body: JSON.stringify({ events: emailEvents }),
      })
      await upd.body?.cancel()
      return json({ ok: upd.ok, updated: true, id: ours.id, channel, status: upd.status, events: emailEvents })
    }
    if (ours) return json({ ok: true, existing: true, id: ours.id, channel, type: ours.type, events: ours.events ?? [] })
    const created = await fetch('https://api.brevo.com/v3/webhooks', {
      method: 'POST',
      headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({
        // Brevo takes one webhook per address, so the SMS one says so in its own
        url: `${target}?key=${encodeURIComponent(eventsSecret)}${channel === 'sms' ? '&channel=sms' : ''}`,
        description: channel === 'sms' ? 'Orgpuls SMS delivery events' : 'Orgpuls delivery events (no opens, no clicks)',
        type: 'transactional',
        channel,
        events:
          channel === 'sms'
            ? ['delivered', 'softBounce', 'hardBounce', 'unsubscribe', 'rejected', 'skip']
            : emailEvents,
      }),
    })
    const out = (await created.json().catch(() => ({}))) as { id?: number; code?: string; message?: string }
    return json({ ok: created.ok, status: created.status, channel, id: out.id ?? null, code: created.ok ? null : out.code ?? null, message: created.ok ? null : out.message ?? null })
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
  // the survey languages' approved mail texts and page strings (0086, D-133): a message goes out in
  // one only when both are approved from the current bokmål, as the survey page offers it only then
  const texts = await svc.rpc('dispatch_language_texts')
  if (texts.error) console.error(`[dispatch] language texts: ${texts.error.code ?? ''} ${texts.error.message}`)
  else {
    const d = (texts.data ?? {}) as { mail?: Record<string, Approved>; ui?: Record<string, Approved> }
    const uiReady: Record<string, boolean> = {}
    for (const l of SURVEY_ONLY) {
      const mail = d.mail?.[l]
      if (mail && complete(SURVEY_SOURCE.mail, mail)) (cat as Record<string, Record<string, unknown>>)[l] = nest(SURVEY_SOURCE.mail, mail)
      uiReady[l] = complete(SURVEY_SOURCE.ui, d.ui?.[l])
    }
    if (offer) offer.uiReady = uiReady
  }
  // bokmål and English mail texts replaced from admin › Translations, once approved (0101, D-152):
  // laid over this run's copy of the catalogue (withMailOverrides)
  for (const lang of ['no', 'en'] as const) {
    const o = await svc.rpc('message_overrides', { p_locale: lang })
    if (o.error) {
      console.error(`[dispatch] overrides ${lang}: ${o.error.code ?? ''} ${o.error.message}`)
      continue
    }
    cat[lang] = await withMailOverrides(cat[lang], (o.data ?? {}) as Record<string, unknown>)
  }
  // Slack (0185): the tokens a disconnect left are revoked, and the workspaces due a match are matched,
  // before anything is claimed, so a workspace connected minutes ago is reached by this run
  const slack = slackRun({
    fetch: fetch as unknown as SlackFetch,
    rpc: async (fn, args) => await svc.rpc(fn, args),
    app: slackApp(Deno.env.get('SLACK_CLIENT_ID'), Deno.env.get('SLACK_CLIENT_SECRET')),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (line) => console.error(line),
  })
  const slackRevoked = await slack.revoke()
  const slackSync = await slack.sync()
  if (slackRevoked || slackSync.synced || slackSync.failed) console.log(`[dispatch] slack: ${slackRevoked} revoked, ${slackSync.synced} matched, ${slackSync.failed} not`)
  const started = Date.now()
  const tally = { claimed: 0, sent: 0, sms: 0, teams: 0, slack: 0, failed: 0, retry: 0, released: 0 }

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
      if (!sinceOn) job.since = null
      let outcome: SendResult = { ok: true, id: '' }
      let channel: 'email' | 'sms' | 'teams' | 'slack' = 'email'
      const offered = offeredFor(cat, job, offer)
      const sendMail = async () => {
        if (perRecipient(job)) return sendEach()
        for (const g of groupsOf(job, offered)) {
          const to = g.to.filter((r) => r.email)
          if (to.length === 0) return { ok: false, retryable: false, auth: false, code: 'no_address' } as SendResult
          const r = renderNotice(marketCatalogue(cat, MAIL_PACKS, job.market), job, g, appUrl)
          const res = await brevoSend(key, { sender: senderOf(job.market), to: to.map((p) => ({ email: p.email as string, name: p.name })), subject: r.subject, html: r.html, text: r.text, tag: `orgpuls-${job.kind}` })
          if (!res.ok) return res
          outcome = res
        }
        return outcome
      }
      // a notice to a role (0134, D-97): one message per person, each recorded with its own id as
      // it goes, so a delivery event finds the person it concerns and a retry skips who got it
      const sendEach = async (): Promise<SendResult> => {
        const got = await svc.rpc('dispatch_reached', { p_id: job.id })
        if (got.error) return { ok: false, retryable: true, auth: false, code: 'reached' }
        const reached = new Set(Array.isArray(got.data) ? (got.data as unknown[]).filter((k): k is string => typeof k === 'string') : [])
        const sends = await pendingSends(job, offered, reached)
        if (sends.length === 0 && reached.size === 0) return { ok: false, retryable: false, auth: false, code: 'no_address' }
        const rendered = new Map<string, ReturnType<typeof renderNotice>>()
        const failed = await inTurns(sends, 4, async (s) => {
          const at = `${s.group.lang}:${s.group.member}`
          const r = rendered.get(at) ?? renderNotice(marketCatalogue(cat, MAIL_PACKS, job.market), job, s.group, appUrl)
          rendered.set(at, r)
          const res = await brevoSend(key, { sender: senderOf(job.market), to: [{ email: s.to.email, name: s.to.name }], subject: r.subject, html: r.html, text: r.text, tag: `orgpuls-${job.kind}` })
          if (res.ok) {
            const rec = await svc.rpc('dispatch_recipient_sent', { p_id: job.id, p_email: s.to.email, p_provider_id: res.id || null })
            const said = rec.data as { ok?: boolean; error?: string } | null
            // by code only: never the address
            if (rec.error || said?.ok === false) console.error(`[dispatch] ${job.id}: a recipient was not recorded: ${rec.error?.code ?? said?.error ?? ''}`)
          }
          return res
        })
        return failed ?? { ok: true, id: '' }
      }
      // one SMS to one person, used by the SMS channel and as Teams' second fallback
      const sendSms = async (person: NonNullable<(typeof job.recipients)[number]>): Promise<SendResult> => {
        const lang = personalLang(job, person, offered)
        const content = smsContent(smsLead(cat, job, lang), personalLink(appUrl, job.token as string))
        return brevoSendSms(key, { sender: smsSender, recipient: person.phone as string, content, unicode: smsLength(content).unicode, tag: `orgpuls-${job.kind}` })
      }
      try {
        const person = job.recipients[0]
        if (job.channel === 'teams' && person && job.token) {
          // 0176: one card, the SMS's lead and one button to the link (supabase/functions/_shared/teams.ts)
          const target = teamsTarget(job)
          let res: TeamsOutcome
          if (!target) res = { ok: false, kind: 'other', code: 'teams_no_target' }
          else if (teamsDown) res = { ok: false, kind: 'auth', code: 'teams_unavailable' }
          else {
            const lang = personalLang(job, person, offered)
            const lead = pickLead(smsLead(cat, job, lang), smsLead(cat, { ...job, sms_text: null }, lang))
            const activity = teamsActivity(lead, pick(cat[lang], 'invitasjon.cta'), personalLink(appUrl, job.token))
            res = await sendTeams(
              { fetch: teamsFetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), token: teamsToken, appId: bot.appId, defaultServiceUrl: teamsServiceUrl },
              target,
              activity,
            )
          }
          // what Teams said about the person is a register fact; a new conversation is kept
          const record = teamsRecord(res)
          if (record) {
            const kept = await svc.rpc('teams_dispatch_result', { p_outbox: job.id, ...record })
            if (kept.error) console.error(`[dispatch] ${job.id}: teams result not recorded: ${kept.error.code ?? ''}`)
          }
          if (!res.ok && res.kind === 'auth') teamsDown = true
          const via = afterTeams(res, person)
          if (!res.ok) console.error(`[dispatch] ${job.id}: ${res.code}${via === 'none' ? '' : `, falling back to ${via}`}`)
          if (via === 'teams') {
            channel = 'teams'
            outcome = { ok: true, id: '' }
          } else if (via === 'email') {
            // the same link, by the channel that works
            channel = 'email'
            job.channel = 'email'
            outcome = await sendMail()
          } else if (via === 'sms') {
            channel = 'sms'
            outcome = await sendSms(person)
          } else {
            outcome = { ok: false, retryable: !res.ok && (res.kind === 'retry' || res.kind === 'auth'), auth: false, code: res.ok ? 'teams' : res.code }
          }
        } else if (job.channel === 'slack' && person && job.token) {
          // 0185: the SMS's lead and the plain link, as a direct message; refused, the same link by e-mail
          const res = await slack.send(job, smsLead(cat, job, personalLang(job, person, offered)), personalLink(appUrl, job.token))
          const via = afterSlack(res, person)
          if (!res.ok) console.error(`[dispatch] ${job.id}: ${res.code}${via === 'email' ? ', falling back to e-mail' : ''}`)
          channel = via === 'slack' ? 'slack' : 'email'
          if (via === 'email') job.channel = 'email'
          outcome = via === 'slack' ? { ok: true, id: '' } : via === 'email' ? await sendMail() : { ok: false, retryable: true, auth: false, code: res.ok ? 'slack' : res.code }
        } else if (job.channel === 'sms' && person?.phone && job.token) {
          outcome = await sendSms(person)
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
        const done = await svc.rpc('dispatch_done', { p_id: job.id, p_ok: true, p_provider_id: outcome.id || null, p_channel: channel })
        if (done.error) console.error(`[dispatch] ${job.id}: done not recorded: ${done.error.code ?? ''}`)
        tally.sent++
        if (channel === 'sms') tally.sms++
        if (channel === 'teams') tally.teams++
        if (channel === 'slack') tally.slack++
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

  if (tally.claimed) console.log(`[dispatch] claimed ${tally.claimed}, sent ${tally.sent} (${tally.sms} by SMS, ${tally.teams} by Teams, ${tally.slack} by Slack), retry ${tally.retry}, failed ${tally.failed}`)

  // «Send test til meg» (0127, D-171): the invitation as it will read, to the daglig leder's own
  // address, with the preview's link instead of a personal one
  const tests = { sent: 0, failed: 0 }
  {
    const { data, error } = await svc.rpc('dispatch_test_claim', { p_batch: BATCH })
    if (error) console.error(`[dispatch] test claim failed: ${error.code ?? ''} ${error.message}`)
    for (const t of (data ?? []) as TestJob[]) {
      let outcome: SendResult
      try {
        if (!t.preview) throw new Error('round gone')
        const p = t.preview
        // the organisation's language as notices read it: a Swedish one's test is in English (D-255)
        const lang = orgLangOf(p.lang)
        const job: NoticeJob = {
          id: t.id,
          kind: 'invitasjon',
          audience: null,
          channel: 'email',
          sms_text: null,
          lang,
          org: p.org,
          k: p.k,
          round: p.round,
          recipients: [{ email: t.to, phone: null, name: t.name, lang, member: true }],
          token: null,
          minutes: p.minutes,
          results_shared: p.results_shared,
          publish_on: p.publish_on,
          greeting: p.intro ? { text: p.intro, by: p.intro_by } : p.org_greeting,
          since: sinceOn ? p.since : null,
          logo: p.logo,
          results_page: p.results_page,
          test_round: t.round_id,
        }
        const r = renderNotice(cat, job, { lang, member: true, name: t.name }, appUrl)
        outcome = await brevoSend(key, { sender, to: [{ email: t.to, name: t.name }], subject: r.subject, html: r.html, text: r.text, tag: 'orgpuls-test' })
      } catch (e) {
        console.error(`[dispatch] test ${t.id}: render failed: ${(e as Error).message}`)
        outcome = { ok: false, retryable: false, auth: false, code: 'render' }
      }
      await svc.rpc('dispatch_test_done', { p_id: t.id, p_ok: outcome.ok, p_error: outcome.ok ? null : outcome.code })
      if (outcome.ok) tests.sent++
      else tests.failed++
      if (!outcome.ok) console.error(`[dispatch] test ${t.id}: ${outcome.code}`)
      if (!outcome.ok && outcome.auth) return json({ error: 'provider_unauthorised', ...tally, tests }, 502)
    }
  }

  // a person who asked to be told when management answers their comment (0204, X-103). The claim
  // opens the seal and hands over the address and the conversation's key; neither is logged here,
  // and a failure is reported by its code only
  const notices = { sent: 0, retry: 0, failed: 0 }
  while (Date.now() - started < BUDGET_MS) {
    const { data, error } = await svc.rpc('reply_notice_claim', { p_batch: BATCH })
    if (error) {
      console.error(`[dispatch] reply notice claim failed: ${error.code ?? ''} ${error.message}`)
      break
    }
    const jobs = (data ?? []) as ReplyNoticeJob[]
    if (jobs.length === 0) break
    for (const job of jobs) {
      let outcome: SendResult
      try {
        if (job.channel === 'sms' && job.phone) {
          const content = smsContent(replyNoticeSms(cat, job), threadLink(appUrl, job.key))
          outcome = await brevoSendSms(key, { sender: smsSender, recipient: job.phone, content, unicode: smsLength(content).unicode, tag: 'orgpuls-svarvarsel' })
        } else if (job.email) {
          const r = renderReplyNotice(cat, job, appUrl)
          outcome = await brevoSend(key, { sender, to: [{ email: job.email, name: '' }], subject: r.subject, html: r.html, text: r.text, tag: 'orgpuls-svarvarsel' })
        } else {
          outcome = { ok: false, retryable: false, auth: false, code: 'unreachable' }
        }
      } catch (e) {
        console.error(`[dispatch] reply notice ${job.id}: render failed: ${(e as Error).message}`)
        outcome = { ok: false, retryable: false, auth: false, code: 'render' }
      }
      await svc.rpc('reply_notice_done', {
        p_id: job.id,
        p_ok: outcome.ok,
        p_error: outcome.ok ? null : outcome.code,
        p_permanent: !outcome.ok && !outcome.retryable,
      })
      if (outcome.ok) notices.sent++
      else if (outcome.retryable) notices.retry++
      else notices.failed++
      if (!outcome.ok) console.error(`[dispatch] reply notice ${job.id}: ${outcome.code}`)
      if (!outcome.ok && outcome.auth) return json({ error: 'provider_unauthorised', ...tally, notices }, 502)
    }
    if (jobs.length < BATCH) break
  }
  if (notices.sent + notices.retry + notices.failed) console.log(`[dispatch] reply notices: sent ${notices.sent}, retry ${notices.retry}, failed ${notices.failed}`)

  // events to the platform (0205, X-104): one signed POST per run while an installation is enabled.
  // The body is what app.platform_emit allowed, nothing more; a failure is reported by status only.
  const platform = { sent: 0, failed: 0 }
  {
    const { data, error } = await svc.rpc('platform_events_claim', { p_batch: 50 })
    if (error) console.error(`[dispatch] platform claim failed: ${error.code ?? ''} ${error.message}`)
    const claim = (data ?? {}) as { url?: string | null; secret?: string; events?: { id: number }[] }
    const events = claim.events ?? []
    if (claim.url && claim.secret && events.length) {
      const body = JSON.stringify({ events })
      const ts = Math.floor(Date.now() / 1000).toString()
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(claim.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`)))
      const signature = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
      let ok = false
      let problem: string | null = null
      try {
        const res = await fetch(claim.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-orgpuls-timestamp': ts, 'x-orgpuls-signature': `sha256=${signature}` },
          body,
          signal: AbortSignal.timeout(10_000),
        })
        ok = res.ok
        if (!ok) problem = `http ${res.status}`
      } catch (e) {
        problem = (e as Error).name
      }
      await svc.rpc('platform_events_done', { p_ids: events.map((e) => e.id), p_ok: ok, p_error: problem })
      if (ok) platform.sent += events.length
      else {
        platform.failed += events.length
        console.error(`[dispatch] platform delivery failed: ${problem}`)
      }
    }
  }
  if (platform.sent + platform.failed) console.log(`[dispatch] platform events: sent ${platform.sent}, failed ${platform.failed}`)

  // a copy of every lead by e-mail (0209, D-242): to ORGPULS_LEAD_COPY_TO, once per event, whatever the
  // platform delivery did. A copy Brevo refuses is given back for the next run; a rejected key stops the
  // copies and gives every unsent one back. No address is logged.
  const copyTo = (Deno.env.get('ORGPULS_LEAD_COPY_TO') ?? '').trim()
  if (copyTo) {
    const copies = { sent: 0, failed: 0 }
    const { data, error } = await svc.rpc('lead_copies_claim', { p_batch: 20 })
    if (error) console.error(`[dispatch] lead copy claim failed: ${error.code ?? ''}`)
    const leads = (Array.isArray(data) ? data : []) as LeadEvent[]
    const back: number[] = []
    let stop = false
    for (const lead of leads) {
      if (stop) {
        back.push(lead.id)
        continue
      }
      const m = renderLeadCopy(lead)
      const res = await brevoSend(key, { sender, to: [{ email: copyTo }], subject: m.subject, html: m.html, text: m.text, tag: 'orgpuls-lead-copy', replyTo: m.replyTo })
      if (res.ok) copies.sent++
      else {
        copies.failed++
        back.push(lead.id)
        console.error(`[dispatch] lead copy ${lead.id}: ${res.code}`)
        if (res.auth) stop = true
      }
    }
    if (back.length) await svc.rpc('lead_copies_release', { p_ids: back })
    if (copies.sent + copies.failed) console.log(`[dispatch] lead copies: sent ${copies.sent}, failed ${copies.failed}`)
  }

  // the trial's mail is answered to the support inbox
  const replyTo = { email: Deno.env.get('ORGPULS_SUPPORT_MAIL') ?? 'hjelp@orgpuls.no', name: 'Orgpuls' }

  // the trial's mail (0060, D-105): service mail on the product's sender, answered to support
  const life = { sent: 0, retry: 0, failed: 0 }
  while (Date.now() - started < BUDGET_MS) {
    const { data, error } = await svc.rpc('lifecycle_mail_claim', { p_batch: BATCH })
    if (error) {
      console.error(`[dispatch] lifecycle claim failed: ${error.code ?? ''} ${error.message}`)
      break
    }
    const jobs = (data ?? []) as LifecycleJob[]
    if (jobs.length === 0) break
    for (const job of jobs) {
      let outcome: SendResult
      try {
        // the law a notice states is the organisation's market's (0219, D-257)
        const r = renderLifecycle(marketCatalogue(cat, MAIL_PACKS, job.market), job, appUrl)
        outcome = await brevoSend(key, {
          sender: senderOf(job.market),
          to: [{ email: job.to_email, name: job.name ?? undefined }],
          subject: r.subject,
          html: r.html,
          text: r.text,
          tag: `orgpuls-life-${job.step}`,
          replyTo,
        })
      } catch (e) {
        console.error(`[dispatch] lifecycle ${job.id}: render failed: ${(e as Error).message}`)
        outcome = { ok: false, retryable: false, auth: false, code: 'render' }
      }
      await svc.rpc('lifecycle_mail_done', {
        p_id: job.id,
        p_ok: outcome.ok,
        p_provider_id: outcome.ok ? outcome.id || null : null,
        p_error: outcome.ok ? null : outcome.code,
        p_permanent: !outcome.ok && !outcome.retryable,
      })
      if (outcome.ok) life.sent++
      else if (outcome.retryable) life.retry++
      else life.failed++
      if (!outcome.ok) console.error(`[dispatch] lifecycle ${job.id}: ${outcome.code}`)
      if (!outcome.ok && outcome.auth) return json({ error: 'provider_unauthorised', ...tally, life }, 502)
    }
    if (jobs.length < BATCH) break
  }
  if (life.sent + life.retry + life.failed) console.log(`[dispatch] trial mail: sent ${life.sent}, retry ${life.retry}, failed ${life.failed}`)

  return json({ ...tally, tests, life })
})
