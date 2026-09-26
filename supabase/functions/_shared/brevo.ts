/**
 * Brevo's transactional e-mail API, reduced to one call. D-65.
 *
 * Nothing from a response body is passed on: Brevo's error messages can quote the address
 * that was refused, and an address does not belong in a log line or in the outbox's
 * `last_error`. What the caller gets is the HTTP status as a code and two decisions made
 * from it — may this be tried again, and is the fault the key rather than the message.
 */

export interface BrevoMessage {
  sender: { email: string; name: string }
  to: Array<{ email: string; name?: string | null }>
  subject: string
  html: string
  text: string
  tag: string
  /** where the recipient's answer goes; a ticket reply is answered to the support inbox */
  replyTo?: { email: string; name?: string }
  /** extra headers; a marketing mail's List-Unsubscribe and List-Unsubscribe-Post (D-101) */
  headers?: Record<string, string>
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; retryable: boolean; auth: boolean; code: string }

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

export async function brevoSend(key: string, m: BrevoMessage, opts: { sandbox?: boolean } = {}): Promise<SendResult> {
  const person = (r: { email: string; name?: string | null }) => (r.name ? { email: r.email, name: r.name } : { email: r.email })
  const body: Record<string, unknown> = {
    sender: m.sender,
    subject: m.subject,
    htmlContent: m.html,
    textContent: m.text,
    tags: [m.tag],
  }
  if (m.replyTo) body.replyTo = m.replyTo
  // one version per person: nobody sees anybody else's address
  if (m.to.length === 1) body.to = [person(m.to[0])]
  else body.messageVersions = m.to.map((r) => ({ to: [person(r)] }))
  // Brevo validates and then drops the message: proves the key, the sender and the payload
  const headers = { ...(m.headers ?? {}), ...(opts.sandbox ? { 'X-Sib-Sandbox': 'drop' } : {}) }
  if (Object.keys(headers).length) body.headers = headers

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    return { ok: false, retryable: true, auth: false, code: 'network' }
  }

  if (res.ok) {
    const json = (await res.json().catch(() => ({}))) as { messageId?: string; messageIds?: string[] }
    return { ok: true, id: json.messageId ?? json.messageIds?.[0] ?? '' }
  }
  await res.body?.cancel()
  const code = `http_${res.status}`
  if (res.status === 401 || res.status === 403) return { ok: false, retryable: true, auth: true, code }
  if (res.status === 429 || res.status >= 500) return { ok: false, retryable: true, auth: false, code }
  return { ok: false, retryable: false, auth: false, code }
}

// ---------------------------------------------------------------------------------------
// SMS (D-66). The same reduction: a status, a decision, and never the number in a log.
// ---------------------------------------------------------------------------------------

export interface BrevoSms {
  /** registered with the operators; at most 11 characters */
  sender: string
  /** E.164, "+4791234567" */
  recipient: string
  content: string
  unicode: boolean
  tag: string
}

const SMS_ENDPOINT = 'https://api.brevo.com/v3/transactionalSMS/send'

export async function brevoSendSms(key: string, m: BrevoSms): Promise<SendResult> {
  let res: Response
  try {
    res = await fetch(SMS_ENDPOINT, {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: m.sender,
        recipient: m.recipient.replace(/^\+/, ''),
        content: m.content,
        type: 'transactional',
        tag: m.tag,
        unicodeEnabled: m.unicode,
      }),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    return { ok: false, retryable: true, auth: false, code: 'sms_network' }
  }

  if (res.ok) {
    const json = (await res.json().catch(() => ({}))) as { messageId?: number | string; reference?: string }
    return { ok: true, id: String(json.messageId ?? json.reference ?? '') }
  }
  // the error code only; Brevo's message can quote the number
  const body = (await res.json().catch(() => ({}))) as { code?: string }
  const code = `sms_http_${res.status}${body.code ? `_${String(body.code).slice(0, 40)}` : ''}`
  if (res.status === 401 || res.status === 403) return { ok: false, retryable: true, auth: true, code }
  // no credits is a state the account can leave: worth trying again later
  if (res.status === 402 || body.code === 'not_enough_credits') return { ok: false, retryable: true, auth: false, code }
  if (res.status === 429 || res.status >= 500) return { ok: false, retryable: true, auth: false, code }
  return { ok: false, retryable: false, auth: false, code }
}
