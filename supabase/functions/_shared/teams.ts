/**
 * Microsoft Teams as a channel for one person's survey link (0176, D-203).
 *
 * Pure like mail.ts and sms.ts: no imports, no Deno or Node globals beyond the Web Crypto,
 * `fetch`-shaped functions and base64 helpers both runtimes have. The dispatcher sends with it,
 * the bot endpoint (orgpuls-teams-bot) validates Microsoft's calls with it, and
 * tests/unit/teams.test.ts proves both against this very code.
 *
 * Plain REST against the Bot Connector, no Bot Framework SDK (retired):
 *   * a token for the bot by client credentials from the bot's own (single-tenant) app
 *     registration — a certificate assertion where one is configured, else the secret —
 *     scope https://api.botframework.com/.default;
 *   * the 1:1 conversation, created once with the person's Entra object id and tenant id
 *     (POST {serviceUrl}/v3/conversations) and kept;
 *   * one message activity (POST …/v3/conversations/{id}/activities) holding one Adaptive Card:
 *     the short lead the SMS carries, already translated, and one Action.OpenUrl button to the
 *     person's own link. No URL in the text (no preview), no Action.Submit or Action.Execute
 *     (both post back who pressed them), no read receipt asked for, nothing kept to edit or
 *     delete the card later.
 *
 * What may be logged: codes and HTTP statuses. Never a token, a link, a payload, an object id.
 */

// ---------------------------------------------------------------------------------------
// Constants, from Microsoft's documentation (read 2 October 2026, see D-203)
// ---------------------------------------------------------------------------------------

/** Connector → bot: the OpenID metadata of the Bot Framework token service */
export const BOT_OPENID_URL = 'https://login.botframework.com/v1/.well-known/openidconfiguration'
/** Connector → bot: the only issuer a token from the Bot Connector carries */
export const BOT_ISSUER = 'https://api.botframework.com'
/** Bot → connector: the scope the bot's own token is asked for */
export const BOT_SCOPE = 'https://api.botframework.com/.default'
/** The Bot Connector's public-cloud host; the only one a bot token is ever sent to */
export const SERVICE_HOST = 'smba.trafficmanager.net'
/** EMEA's regional service URL, for a person the bot has no conversation with yet */
export const DEFAULT_SERVICE_URL = 'https://smba.trafficmanager.net/emea/'
/** Five minutes either way, the clock skew the documentation names as industry standard */
export const CLOCK_SKEW_S = 300

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
}>

// ---------------------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------------------

export function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const utf8 = (s: string) => new TextEncoder().encode(s)
/** a plain ArrayBuffer of the bytes, which Web Crypto's typings ask for in both runtimes */
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
const jsonPart = (o: unknown) => b64urlEncode(utf8(JSON.stringify(o)))

/** The DER bytes inside a PEM block of the given label */
export function pemBytes(pem: string, label: string): Uint8Array | null {
  const m = new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`).exec(pem)
  if (!m || !m[1]) return null
  const bin = atob(m[1].replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---------------------------------------------------------------------------------------
// Where a bot token may go
// ---------------------------------------------------------------------------------------

/**
 * A Bot Connector service URL the bot may send its token to: https, Microsoft's public-cloud host,
 * no port, no credentials, no query. Anything else is refused before a request is made, so a value
 * that reached the database some other way can never draw the token out (0176 checks the same).
 */
export function isServiceUrl(u: string | null | undefined): boolean {
  if (!u) return false
  let url: URL
  try {
    url = new URL(u)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    url.hostname === SERVICE_HOST &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    /^\/[A-Za-z0-9._~/-]{0,200}$/.test(url.pathname)
  )
}

/** A service URL with exactly one trailing slash, so paths can be appended */
export const serviceBase = (u: string) => u.replace(/\/+$/, '') + '/'

// ---------------------------------------------------------------------------------------
// Whom a claimed job addresses
// ---------------------------------------------------------------------------------------

export interface TeamsTarget {
  object_id: string
  tenant_id: string
  conversation_id: string | null
  service_url: string | null
}

/**
 * The Teams address of a claimed personal job, or null when the claim did not choose Teams or the
 * address it handed over is not one (then the dispatcher falls back as it would on a refusal).
 * The channel rule itself is the database's (0176 dispatch_claim); this only refuses to act on a
 * malformed hand-over.
 */
export function teamsTarget(job: {
  channel: string
  token: string | null
  recipients: Array<{ teams?: Partial<TeamsTarget> | null }>
}): TeamsTarget | null {
  if (job.channel !== 'teams' || !job.token || job.recipients.length !== 1) return null
  const t = job.recipients[0]?.teams
  if (!t) return null
  const object = (t.object_id ?? '').toLowerCase()
  const tenant = (t.tenant_id ?? '').toLowerCase()
  if (!GUID.test(object) || !GUID.test(tenant)) return null
  const conversation = typeof t.conversation_id === 'string' && /^[!-~]{1,512}$/.test(t.conversation_id) ? t.conversation_id : null
  const service = isServiceUrl(t.service_url) ? (t.service_url as string) : null
  return {
    object_id: object,
    tenant_id: tenant,
    // a conversation is only usable together with the service it lives on
    conversation_id: conversation && service ? conversation : null,
    service_url: conversation && service ? service : null,
  }
}

// ---------------------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------------------

const URLISH = /(https?:\/\/|www\.)/i

/**
 * The card's text: the organisation's own SMS text where it wrote one, unless it holds a link —
 * the card's only link is the button — and then the translated default. `own` and `fallback` are
 * mail.ts smsLead with and without the organisation's text.
 */
export function pickLead(own: string, fallback: string): string {
  return URLISH.test(own) ? fallback : own
}

export interface TeamsActivity {
  type: 'message'
  summary: string
  attachments: Array<{ contentType: 'application/vnd.microsoft.card.adaptive'; content: AdaptiveCard }>
}

export interface AdaptiveCard {
  type: 'AdaptiveCard'
  $schema: string
  version: string
  body: Array<{ type: 'TextBlock'; text: string; wrap: true }>
  actions: Array<{ type: 'Action.OpenUrl'; title: string; url: string }>
}

/**
 * One message: one card with the lead and one button to the link. The text never carries a URL,
 * so Teams draws no preview and no link sits in the chat's text; the only action is OpenUrl,
 * which tells nobody it was pressed. `summary` is what a notification shows.
 */
export function teamsActivity(lead: string, cta: string, link: string): TeamsActivity {
  const text = lead.trim()
  if (!text || URLISH.test(text)) throw new Error('a Teams lead must be text without a link')
  if (!cta.trim()) throw new Error('a Teams button needs a label')
  if (!/^https:\/\/[^\s]+$/.test(link)) throw new Error('a Teams link must be https')
  return {
    type: 'message',
    summary: text,
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          // 1.4: what every Teams client renders, mobile included
          version: '1.4',
          body: [{ type: 'TextBlock', text, wrap: true }],
          actions: [{ type: 'Action.OpenUrl', title: cta.trim(), url: link }],
        },
      },
    ],
  }
}

// ---------------------------------------------------------------------------------------
// The bot's own token
// ---------------------------------------------------------------------------------------

export interface BotCredentials {
  appId: string
  tenantId: string
  /** a client secret, used only when no certificate is configured */
  secret?: string | null
  /** the certificate (PEM) registered on the app, and its PKCS#8 private key (PEM) */
  certPem?: string | null
  keyPem?: string | null
}

/** Which credential the bot will authenticate with, or null when it cannot */
export function credentialKind(c: Partial<BotCredentials>): 'certificate' | 'secret' | null {
  if (!c.appId || !GUID.test(c.appId) || !c.tenantId || !GUID.test(c.tenantId)) return null
  if (c.certPem && c.keyPem) return 'certificate'
  if (c.secret) return 'secret'
  return null
}

/** The token endpoint of the bot's own tenant: a single-tenant registration (see D-203) */
export const tokenEndpoint = (tenantId: string) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

/**
 * A client assertion signed with the certificate's key (Microsoft identity platform, «certificate
 * credentials»): PS256, `x5t#S256` the SHA-256 thumbprint of the certificate's DER, aud the token
 * endpoint, iss = sub = the app id, a fresh jti, valid for five minutes.
 */
export async function clientAssertion(c: BotCredentials, nowS: number, jti: string): Promise<string> {
  const der = pemBytes(c.certPem ?? '', 'CERTIFICATE')
  const pkcs8 = pemBytes(c.keyPem ?? '', 'PRIVATE KEY')
  if (!der || !pkcs8) throw new Error('certificate or key is not PEM')
  const thumb = new Uint8Array(await crypto.subtle.digest('SHA-256', buf(der)))
  const header = { alg: 'PS256', typ: 'JWT', 'x5t#S256': b64urlEncode(thumb) }
  const claims = { aud: tokenEndpoint(c.tenantId), iss: c.appId, sub: c.appId, jti, nbf: nowS, iat: nowS, exp: nowS + 300 }
  const input = `${jsonPart(header)}.${jsonPart(claims)}`
  const key = await crypto.subtle.importKey('pkcs8', buf(pkcs8), { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'RSA-PSS', saltLength: 32 }, key, buf(utf8(input))))
  return `${input}.${b64urlEncode(sig)}`
}

export type TokenResult = { ok: true; token: string; expiresAt: number } | { ok: false; code: string; status: number }

/** The bot's access token for the Bot Connector, by client credentials */
export async function botToken(fetchFn: FetchLike, c: BotCredentials, nowMs: number, jti: string): Promise<TokenResult> {
  const kind = credentialKind(c)
  if (!kind) return { ok: false, code: 'teams_not_configured', status: 0 }
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: c.appId, scope: BOT_SCOPE })
  if (kind === 'certificate') {
    form.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer')
    form.set('client_assertion', await clientAssertion(c, Math.floor(nowMs / 1000), jti))
  } else {
    form.set('client_secret', c.secret as string)
  }
  const res = await fetchFn(tokenEndpoint(c.tenantId), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const body = await res.text()
  if (!res.ok) return { ok: false, code: `token_http_${res.status}`, status: res.status }
  let parsed: { access_token?: unknown; expires_in?: unknown }
  try {
    parsed = JSON.parse(body) as typeof parsed
  } catch {
    return { ok: false, code: 'token_unreadable', status: res.status }
  }
  if (typeof parsed.access_token !== 'string' || !parsed.access_token) return { ok: false, code: 'token_unreadable', status: res.status }
  const ttl = typeof parsed.expires_in === 'number' ? parsed.expires_in : Number(parsed.expires_in ?? 3600)
  return { ok: true, token: parsed.access_token, expiresAt: nowMs + Math.max(60, (Number.isFinite(ttl) ? ttl : 3600) - 120) * 1000 }
}

// ---------------------------------------------------------------------------------------
// Sending, with retries
// ---------------------------------------------------------------------------------------

/** What Teams said, as the dispatcher acts on it */
export type TeamsOutcome =
  | { ok: true; conversation: { id: string; serviceUrl: string } | null }
  | {
      ok: false
      /**
       * blocked: 403 MessageWritesBlocked — the person blocked or removed the app (a register fact);
       * invalid: the bot cannot reach this person (app not installed for them, 403 Forbidden; or 404);
       * auth: the bot's own credentials were refused — nothing more goes by Teams this run;
       * retry: throttled or a gateway error after every retry; other: anything else
       */
      kind: 'blocked' | 'invalid' | 'auth' | 'retry' | 'other'
      code: string
    }

/** The statuses Microsoft asks bots to retry with backoff */
export const RETRYABLE = new Set([412, 429, 502, 504])

export function classify(status: number, body: string): Extract<TeamsOutcome, { ok: false }> {
  if (status === 401) return { ok: false, kind: 'auth', code: 'teams_401' }
  if (status === 403) {
    return /MessageWritesBlocked/.test(body)
      ? { ok: false, kind: 'blocked', code: 'teams_blocked' }
      : { ok: false, kind: 'invalid', code: 'teams_403' }
  }
  if (status === 404) return { ok: false, kind: 'invalid', code: 'teams_404' }
  if (RETRYABLE.has(status)) return { ok: false, kind: 'retry', code: `teams_${status}` }
  return { ok: false, kind: 'other', code: `teams_${status || 'network'}` }
}

export interface SendDeps {
  fetch: FetchLike
  sleep: (ms: number) => Promise<void>
  /** the bot's token; called once per request so an expired one can be renewed between */
  token: () => Promise<string | null>
  appId: string
  /** for a person with no conversation yet */
  defaultServiceUrl?: string
  /** attempts per request, the first included */
  attempts?: number
}

/** The wait before attempt `n` (1-based retry): Retry-After where Teams gave one, else 1, 2, 4 s; never over 8 s */
export function backoff(n: number, retryAfter: string | null): number {
  const s = retryAfter !== null && /^\d{1,4}$/.test(retryAfter.trim()) ? Number(retryAfter.trim()) : 2 ** (n - 1)
  return Math.min(8, Math.max(0, s)) * 1000
}

async function call(
  deps: SendDeps,
  url: string,
  payload: unknown,
): Promise<{ ok: true; body: string } | { ok: false; status: number; body: string }> {
  const attempts = Math.max(1, deps.attempts ?? 4)
  let last: { ok: false; status: number; body: string } = { ok: false, status: 0, body: '' }
  for (let i = 1; i <= attempts; i++) {
    const token = await deps.token()
    if (!token) return { ok: false, status: 401, body: '' }
    let res: Awaited<ReturnType<FetchLike>>
    try {
      res = await deps.fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {
      // a network fault is treated as a gateway error: retried, then given up
      last = { ok: false, status: 502, body: '' }
      if (i < attempts) await deps.sleep(backoff(i, null))
      continue
    }
    const body = await res.text()
    if (res.ok) return { ok: true, body }
    last = { ok: false, status: res.status, body }
    if (!RETRYABLE.has(res.status) || i === attempts) return last
    await deps.sleep(backoff(i, res.headers.get('retry-after')))
  }
  return last
}

/** Create the 1:1 conversation with a person by their Entra object id and tenant */
export async function createConversation(deps: SendDeps, serviceUrl: string, target: TeamsTarget): Promise<
  { ok: true; id: string } | Extract<TeamsOutcome, { ok: false }>
> {
  if (!isServiceUrl(serviceUrl)) return { ok: false, kind: 'other', code: 'teams_bad_service_url' }
  const res = await call(deps, `${serviceBase(serviceUrl)}v3/conversations`, {
    isGroup: false,
    bot: { id: `28:${deps.appId}` },
    // the documented way to address a person by their object id, personal scope only
    members: [{ id: target.object_id }],
    tenantId: target.tenant_id,
    channelData: { tenant: { id: target.tenant_id } },
  })
  if (!res.ok) return classify(res.status, res.body)
  let id: unknown
  try {
    id = (JSON.parse(res.body) as { id?: unknown }).id
  } catch {
    id = null
  }
  return typeof id === 'string' && /^[!-~]{1,512}$/.test(id) ? { ok: true, id } : { ok: false, kind: 'other', code: 'teams_no_conversation' }
}

/**
 * One message to one person. With a stored conversation it is used; a conversation Teams no longer
 * knows (404) is created afresh once. Without one, it is created on the regional service URL.
 * `conversation` in the outcome is set only when a new one was made, for the caller to keep.
 */
export async function sendTeams(deps: SendDeps, target: TeamsTarget, activity: TeamsActivity): Promise<TeamsOutcome> {
  const serviceUrl = target.service_url ?? deps.defaultServiceUrl ?? DEFAULT_SERVICE_URL
  let conversation = target.conversation_id
  let made = false
  for (let round = 0; round < 2; round++) {
    if (!conversation) {
      const c = await createConversation(deps, serviceUrl, target)
      if (!c.ok) return c
      conversation = c.id
      made = true
    }
    if (!isServiceUrl(serviceUrl)) return { ok: false, kind: 'other', code: 'teams_bad_service_url' }
    const res = await call(deps, `${serviceBase(serviceUrl)}v3/conversations/${encodeURIComponent(conversation)}/activities`, activity)
    if (res.ok) return { ok: true, conversation: made ? { id: conversation, serviceUrl } : null }
    // a kept conversation Teams has forgotten: make a new one, once
    if (res.status === 404 && !made && round === 0) {
      conversation = null
      continue
    }
    return classify(res.status, res.body)
  }
  return { ok: false, kind: 'other', code: 'teams_unreachable' }
}

/**
 * After a Teams attempt: which channel carries the link now. Teams when it took the message; else
 * the same link by e-mail where the person has an address, by SMS where that may carry it (the
 * claim hands over a number only then), and otherwise nothing in this run.
 */
export function afterTeams(outcome: TeamsOutcome, person: { email: string | null; phone: string | null }): 'teams' | 'email' | 'sms' | 'none' {
  if (outcome.ok) return 'teams'
  if (person.email) return 'email'
  if (person.phone) return 'sms'
  return 'none'
}

/** What the register keeps from a Teams attempt: a new conversation, or what Teams said about the person */
export function teamsRecord(
  outcome: TeamsOutcome,
): { p_conversation: string; p_service_url: string } | { p_problem: 'blocked' | 'invalid' } | null {
  if (outcome.ok) return outcome.conversation ? { p_conversation: outcome.conversation.id, p_service_url: outcome.conversation.serviceUrl } : null
  return outcome.kind === 'blocked' || outcome.kind === 'invalid' ? { p_problem: outcome.kind } : null
}

// ---------------------------------------------------------------------------------------
// The bot endpoint: validating a call from the Bot Connector
// ---------------------------------------------------------------------------------------

export interface BotJwk {
  kty: string
  kid?: string
  n?: string
  e?: string
  endorsements?: string[]
}

export type KeyLookup = (kid: string) => Promise<BotJwk | null>

export type JwtVerdict = { ok: true } | { ok: false; status: 401 | 403; code: string }

/**
 * A request from the Bot Connector, checked as «Authenticate requests with the Bot Connector API»
 * requires, every step of it: a Bearer token; RS256; a key from the OpenID keys document by its
 * kid, with a valid signature; issuer https://api.botframework.com; audience the bot's app id;
 * within its validity with five minutes' skew; a serviceUrl claim equal to the activity's; and the
 * key endorsed for the activity's channel, which must be msteams (403 when it is not).
 */
export async function verifyBotJwt(
  authorization: string | null,
  o: { appId: string; nowMs: number; keys: KeyLookup; channelId: string | null; serviceUrl: string | null },
): Promise<JwtVerdict> {
  const m = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(authorization ?? '')
  if (!m) return { ok: false, status: 401, code: 'no_bearer' }
  const [, h, p, s] = m as unknown as [string, string, string, string]
  let header: { alg?: unknown; kid?: unknown }
  let claims: { iss?: unknown; aud?: unknown; exp?: unknown; nbf?: unknown; serviceurl?: unknown; serviceUrl?: unknown }
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(h))) as typeof header
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p))) as typeof claims
  } catch {
    return { ok: false, status: 401, code: 'unreadable' }
  }
  if (header.alg !== 'RS256') return { ok: false, status: 401, code: 'bad_alg' }
  if (typeof header.kid !== 'string' || !header.kid) return { ok: false, status: 401, code: 'no_kid' }
  const jwk = await o.keys(header.kid)
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) return { ok: false, status: 401, code: 'unknown_key' }
  let valid = false
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, buf(b64urlDecode(s)), buf(utf8(`${h}.${p}`)))
  } catch {
    valid = false
  }
  if (!valid) return { ok: false, status: 401, code: 'bad_signature' }
  if (claims.iss !== BOT_ISSUER) return { ok: false, status: 401, code: 'bad_issuer' }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!o.appId || !aud.some((a) => typeof a === 'string' && a.toLowerCase() === o.appId.toLowerCase())) {
    return { ok: false, status: 401, code: 'bad_audience' }
  }
  const now = Math.floor(o.nowMs / 1000)
  if (typeof claims.exp !== 'number' || now > claims.exp + CLOCK_SKEW_S) return { ok: false, status: 401, code: 'expired' }
  if (typeof claims.nbf === 'number' && now < claims.nbf - CLOCK_SKEW_S) return { ok: false, status: 401, code: 'not_yet_valid' }
  const claimed = typeof claims.serviceurl === 'string' ? claims.serviceurl : typeof claims.serviceUrl === 'string' ? claims.serviceUrl : null
  if (!claimed || !o.serviceUrl || serviceBase(claimed) !== serviceBase(o.serviceUrl)) return { ok: false, status: 401, code: 'service_url_mismatch' }
  if (o.channelId !== 'msteams') return { ok: false, status: 403, code: 'not_teams' }
  if (!Array.isArray(jwk.endorsements) || !jwk.endorsements.includes('msteams')) return { ok: false, status: 403, code: 'not_endorsed' }
  return { ok: true }
}

/**
 * The Bot Connector's signing keys, from its OpenID metadata, kept for a day as Microsoft asks and
 * fetched again (at most every five minutes) when a token names a key not yet seen.
 */
export function openIdKeys(fetchFn: FetchLike, clock: () => number = Date.now): KeyLookup {
  let keys: BotJwk[] = []
  let fetchedAt = -Infinity
  const load = async () => {
    const meta = await fetchFn(BOT_OPENID_URL)
    if (!meta.ok) throw new Error(`openid ${meta.status}`)
    const jwksUri = (JSON.parse(await meta.text()) as { jwks_uri?: unknown }).jwks_uri
    // the keys document must be Microsoft's own, on the Bot Framework's login host
    if (typeof jwksUri !== 'string' || !/^https:\/\/login\.botframework\.com\//.test(jwksUri)) throw new Error('openid jwks_uri')
    const res = await fetchFn(jwksUri)
    if (!res.ok) throw new Error(`jwks ${res.status}`)
    const doc = JSON.parse(await res.text()) as { keys?: BotJwk[] }
    keys = Array.isArray(doc.keys) ? doc.keys : []
    fetchedAt = clock()
  }
  return async (kid: string) => {
    const age = clock() - fetchedAt
    if (age > 24 * 3600_000) await load()
    let k = keys.find((x) => x.kid === kid) ?? null
    if (!k && age > 5 * 60_000) {
      await load()
      k = keys.find((x) => x.kid === kid) ?? null
    }
    return k
  }
}

// ---------------------------------------------------------------------------------------
// The bot endpoint: what an activity means, read field by field
// ---------------------------------------------------------------------------------------

export type BotEvent =
  | { kind: 'installed'; tenantId: string; objectId: string; conversationId: string; serviceUrl: string }
  | { kind: 'removed'; tenantId: string; objectId: string }
  | { kind: 'ignored'; reason: string }

/** The two values the token check compares against, and nothing else */
export function activityHints(raw: unknown): { channelId: string | null; serviceUrl: string | null } {
  const a = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    channelId: typeof a.channelId === 'string' ? a.channelId : null,
    serviceUrl: typeof a.serviceUrl === 'string' ? a.serviceUrl : null,
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/**
 * What an activity from Teams means for the register. Only installation and membership events in a
 * personal (1:1) conversation matter: the app installed for a person, or removed. A message is
 * ignored without its text being read — this bot is notification-only and takes no input — and so
 * is everything else. Reads named fields only: type, action, conversation, from, recipient, the
 * members added or removed, the tenant and the service URL.
 */
export function readActivity(raw: unknown): BotEvent {
  const a = obj(raw)
  const type = str(a.type)
  if (type === 'message' || type === 'messageReaction' || type === 'invoke') return { kind: 'ignored', reason: type }
  if (type !== 'installationUpdate' && type !== 'conversationUpdate') return { kind: 'ignored', reason: 'type' }
  if (str(a.channelId) !== 'msteams') return { kind: 'ignored', reason: 'channel' }
  const conversation = obj(a.conversation)
  if (str(conversation.conversationType) !== 'personal') return { kind: 'ignored', reason: 'scope' }
  const tenantId = (str(conversation.tenantId) ?? str(obj(obj(a.channelData).tenant).id) ?? '').toLowerCase()
  const objectId = (str(obj(a.from).aadObjectId) ?? '').toLowerCase()
  if (!GUID.test(tenantId) || !GUID.test(objectId)) return { kind: 'ignored', reason: 'identity' }
  const botId = str(obj(a.recipient).id)
  const has = (list: unknown) => Array.isArray(list) && botId !== null && list.some((m) => str(obj(m).id) === botId)

  let installed = false
  let removed = false
  if (type === 'installationUpdate') {
    const action = str(a.action)
    installed = action === 'add' || action === 'add-upgrade'
    removed = action === 'remove'
  } else {
    installed = has(a.membersAdded)
    removed = has(a.membersRemoved)
  }
  if (removed) return { kind: 'removed', tenantId, objectId }
  if (!installed) return { kind: 'ignored', reason: 'action' }
  const conversationId = str(conversation.id)
  const serviceUrl = str(a.serviceUrl)
  if (!conversationId || !/^[!-~]{1,512}$/.test(conversationId) || !isServiceUrl(serviceUrl)) return { kind: 'ignored', reason: 'address' }
  return { kind: 'installed', tenantId, objectId, conversationId, serviceUrl: serviceUrl as string }
}

// ---------------------------------------------------------------------------------------
// The bot endpoint itself, runtime-free so the tests run the very handler Deno serves
// ---------------------------------------------------------------------------------------

export const MAX_BOT_BODY = 256 * 1024

/** The body as text, or null past the limit; read in chunks so a large one is never held whole */
export async function readLimited(req: Request, max = MAX_BOT_BODY): Promise<string | null> {
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > max) return null
  const reader = req.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(all)
}

export interface BotDeps {
  appId: string
  keys: KeyLookup
  now: () => number
  /** the service-role RPC: teams_conversation_set or teams_conversation_clear */
  rpc: (
    fn: 'teams_conversation_set' | 'teams_conversation_clear',
    args: Record<string, string>,
  ) => Promise<{ error: { code?: string } | null; data: unknown }>
  /** where a line goes; only codes and the event's kind are ever passed to it */
  log: (line: string) => void
}

/**
 * One call from the Bot Connector. Nothing is acted on unless the token is valid; then an install
 * or a removal is recorded and everything else dropped. Answers with an empty body.
 */
export async function handleBotCall(req: Request, deps: BotDeps): Promise<Response> {
  const empty = (status: number) => new Response(null, { status })
  if (req.method !== 'POST') return empty(405)
  if (!deps.appId) {
    deps.log('[teams-bot] TEAMS_BOT_APP_ID is not set')
    return empty(503)
  }
  const raw = await readLimited(req)
  if (raw === null) return empty(413)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return empty(400)
  }
  let verdict: JwtVerdict
  try {
    verdict = await verifyBotJwt(req.headers.get('authorization'), {
      appId: deps.appId,
      nowMs: deps.now(),
      keys: deps.keys,
      ...activityHints(body),
    })
  } catch {
    // the keys could not be fetched: refuse, and let the connector retry
    deps.log('[teams-bot] keys unavailable')
    return empty(503)
  }
  if (!verdict.ok) {
    deps.log(`[teams-bot] refused: ${verdict.code}`)
    return empty(verdict.status)
  }
  const event = readActivity(body)
  body = null
  if (event.kind === 'ignored') return empty(200)
  const res =
    event.kind === 'installed'
      ? await deps.rpc('teams_conversation_set', {
          p_tenant: event.tenantId,
          p_object: event.objectId,
          p_conversation: event.conversationId,
          p_service_url: event.serviceUrl,
        })
      : await deps.rpc('teams_conversation_clear', { p_tenant: event.tenantId, p_object: event.objectId })
  if (res.error) {
    deps.log(`[teams-bot] ${event.kind}: ${res.error.code ?? 'error'}`)
    return empty(500)
  }
  const said = (res.data ?? {}) as { ok?: boolean; matched?: boolean; error?: string }
  deps.log(`[teams-bot] ${event.kind}: ${said.ok === false ? said.error ?? 'refused' : said.matched ? 'matched' : 'unmatched'}`)
  return empty(200)
}
