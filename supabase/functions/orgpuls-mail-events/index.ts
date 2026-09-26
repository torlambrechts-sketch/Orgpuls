/**
 * orgpuls-mail-events — what happened to a mail after Brevo accepted it. D-97.
 *
 * Brevo posts one delivery event, or a list of them, to this function: delivered, bounces,
 * blocks, spam complaints, deferrals, unsubscribes. The webhook is registered with a secret in
 * its address (`?key=`), which is compared in constant time; `verify_jwt` is off because Brevo
 * sends no JWT.
 *
 * Each event goes to `record_mail_event` (0053) as its kind, the provider's message id, its
 * time and the provider's reason. The recipient's address in the payload is never passed on,
 * stored or logged. Opens and clicks of the product's own mail are dropped: an open or a click
 * is a per-person timestamp of engaging with a survey link, and none is kept.
 *
 * Marketing mail (0055, D-101) is the exception. Every event is first offered to
 * `record_crm_event`, which matches only the CRM's own sends: delivery, bounces that
 * suppress the address, and the opens and clicks a campaign's report counts. An event it
 * does not match goes on to `record_mail_event` as before, and an unmatched open or click
 * goes nowhere. Apple's proxy opens are not counted as opens. A click carries its link, of
 * which the database keeps the path and utm_content, for the campaign's click map (D-103).
 *
 * SMS reports (D-98) come from a second webhook whose address ends `&channel=sms`. They carry
 * `msg_status`, `messageId` and `description` instead; the number, and any reply text, are
 * dropped here, and a number quoted in the description is masked before it is passed on.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const KINDS: Record<string, string> = {
  delivered: 'delivered',
  hard_bounce: 'hard_bounce',
  hardBounce: 'hard_bounce',
  soft_bounce: 'soft_bounce',
  softBounce: 'soft_bounce',
  blocked: 'blocked',
  spam: 'spam',
  invalid_email: 'invalid',
  invalid: 'invalid',
  deferred: 'deferred',
  unsubscribed: 'unsubscribed',
  error: 'error',
}

// opens and clicks, for CRM sends only
const ENGAGEMENT: Record<string, string> = {
  opened: 'opened',
  unique_opened: 'opened',
  uniqueOpened: 'opened',
  click: 'click',
}

// Brevo's SMS statuses, in the spellings its reports and its webhook settings use
const SMS_KINDS: Record<string, string> = {
  delivered: 'delivered',
  soft_bounce: 'soft_bounce',
  softBounce: 'soft_bounce',
  hard_bounce: 'hard_bounce',
  hardBounce: 'hard_bounce',
  unsubscribed: 'unsubscribed',
  unsubscribe: 'unsubscribed',
  bl: 'blocked',
  blacklisted: 'blocked',
  rej: 'blocked',
  rejected: 'blocked',
  skip: 'error',
}

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]
  return d === 0
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type BrevoEvent = {
  event?: string
  'message-id'?: string
  msg_status?: string
  messageId?: string | number
  description?: string
  bounce_type?: string
  ts_event?: number
  ts_epoch?: number
  ts?: number
  date?: string
  reason?: string
  link?: string
}

type Normalised = { kind?: string; id?: string; at: string | null; reason: string | null; link?: string }

function timeOf(e: BrevoEvent): string | null {
  if (typeof e.ts_epoch === 'number') return new Date(e.ts_epoch).toISOString()
  if (typeof e.ts_event === 'number') return new Date(e.ts_event * 1000).toISOString()
  if (typeof e.ts === 'number') return new Date(e.ts * 1000).toISOString()
  if (typeof e.date === 'string') {
    const t = Date.parse(e.date.includes('T') ? e.date : `${e.date.replace(' ', 'T')}Z`)
    if (!Number.isNaN(t)) return new Date(t).toISOString()
  }
  return null
}

const maskNumbers = (s: string) => s.replace(/\+?\d[\d\s-]{5,}\d/g, '[number]')

function normalise(e: BrevoEvent, sms: boolean): Normalised {
  const at = timeOf(e)
  if (sms || e.msg_status) {
    const status = e.msg_status ?? e.event
    const why = [e.bounce_type, e.description].filter((x): x is string => typeof x === 'string' && x.length > 0).join(': ')
    return {
      kind: status ? SMS_KINDS[status] : undefined,
      id: e.messageId != null ? String(e.messageId) : undefined,
      at,
      reason: why ? maskNumbers(why).slice(0, 300) : null,
    }
  }
  return {
    kind: e.event ? KINDS[e.event] ?? ENGAGEMENT[e.event] : undefined,
    id: e['message-id'],
    at,
    reason: e.reason ?? null,
    link: typeof e.link === 'string' ? e.link.slice(0, 2000) : undefined,
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const secret = Deno.env.get('ORGPULS_MAIL_EVENTS_SECRET') ?? ''
  const params = new URL(req.url).searchParams
  if (!secret || !same(params.get('key') ?? '', secret)) return json({ error: 'unauthorised' }, 403)
  const sms = params.get('channel') === 'sms'

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body' }, 400)
  }
  const events = (Array.isArray(body) ? body : [body]) as BrevoEvent[]
  const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })

  const tally = { recorded: 0, ignored: 0, failed: 0 }
  for (const e of events.slice(0, 500)) {
    const { kind, id, at, reason, link } = normalise(e, sms)
    if (!kind || !at || !id) {
      tally.ignored++
      continue
    }
    if (!sms) {
      // the clicked link: record_crm_event keeps its path and utm_content, never its query (0056)
      const crm = await svc.rpc('record_crm_event', { p_event: kind, p_message_id: id, p_at: at, p_link: kind === 'click' ? link ?? null : null })
      if (crm.error) {
        tally.failed++
        console.error(`[mail-events] crm record failed: ${crm.error.code ?? ''}`)
        continue
      }
      if ((crm.data as { matched?: boolean } | null)?.matched) {
        tally.recorded++
        continue
      }
    }
    if (kind === 'opened' || kind === 'click') {
      tally.ignored++
      continue
    }
    const { error } = await svc.rpc('record_mail_event', {
      p_event: kind,
      p_message_id: id,
      p_at: at,
      p_reason: reason,
    })
    if (error) {
      tally.failed++
      console.error(`[mail-events] record failed: ${error.code ?? ''}`)
    } else tally.recorded++
  }
  // a failure is answered 500 so Brevo retries; anything else is taken
  return json(tally, tally.failed ? 500 : 200)
})
