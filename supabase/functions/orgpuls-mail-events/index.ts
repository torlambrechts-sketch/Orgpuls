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
 * stored or logged. Opens and clicks are ignored even if they arrive: an open or a click is a
 * per-person timestamp of engaging with a survey link, and none is kept.
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
  ts_event?: number
  ts_epoch?: number
  ts?: number
  date?: string
  reason?: string
}

function timeOf(e: BrevoEvent): string | null {
  if (typeof e.ts_epoch === 'number') return new Date(e.ts_epoch).toISOString()
  if (typeof e.ts_event === 'number') return new Date(e.ts_event * 1000).toISOString()
  if (typeof e.ts === 'number') return new Date(e.ts * 1000).toISOString()
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const secret = Deno.env.get('ORGPULS_MAIL_EVENTS_SECRET') ?? ''
  if (!secret || !same(new URL(req.url).searchParams.get('key') ?? '', secret)) return json({ error: 'unauthorised' }, 403)

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
    const kind = e.event ? KINDS[e.event] : undefined
    const at = timeOf(e)
    const id = e['message-id']
    if (!kind || !at || !id) {
      tally.ignored++
      continue
    }
    const { error } = await svc.rpc('record_mail_event', {
      p_event: kind,
      p_message_id: id,
      p_at: at,
      p_reason: e.reason ?? null,
    })
    if (error) {
      tally.failed++
      console.error(`[mail-events] record failed: ${error.code ?? ''}`)
    } else tally.recorded++
  }
  // a failure is answered 500 so Brevo retries; anything else is taken
  return json(tally, tally.failed ? 500 : 200)
})
