/**
 * Slack as a channel for one person's survey link (0185, D-205).
 *
 * Pure like mail.ts, sms.ts and teams.ts: no imports, no Deno or Node globals beyond Web Crypto
 * and `fetch`-shaped functions both runtimes have. The dispatcher sends, matches and revokes with
 * it, the app's OAuth callback exchanges the code with it, and tests/unit/slack.test.ts proves all
 * of it against this very code.
 *
 * Plain Web API calls, no SDK:
 *   * a bot token from the organisation's own installation (OAuth v2, token rotation: a token lives
 *     twelve hours and is refreshed with a refresh token that works once);
 *   * matching, once at setup and on each sync, never per message: users.list, the workspace's own
 *     people only (no bots, deactivated accounts, guests, invited-but-not-joined or external Slack
 *     Connect people), by work e-mail — sent to the database as SHA-256 digests;
 *   * one direct message: conversations.open with the member id, then chat.postMessage with the
 *     short text and the link as a plain link, `unfurl_links: false, unfurl_media: false`. No
 *     blocks, no attachments, no buttons, no metadata — nothing that reports back. Nothing is
 *     kept per message, so the message is never edited or deleted, and the app has no Events API
 *     subscription or interactivity URL, so nothing a person writes to it is ever received;
 *   * auth.revoke when an organisation disconnects.
 *
 * What may be logged: codes and HTTP statuses. Never a token, a link, a text, a member id, an address.
 * No function here puts a token into an error, a thrown message or a return value it did not get it from.
 */

export const SLACK_API = 'https://slack.com/api/'
/** The bot scopes Orgpuls asks for, and all it asks for */
export const SLACK_SCOPES = ['chat:write', 'im:write', 'users:read', 'users:read.email'] as const
export const SLACK_AUTHORIZE = 'https://slack.com/oauth/v2/authorize'

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
}>

const MEMBER_ID = /^[UW][A-Z0-9]{2,20}$/
const TEAM_ID = /^T[A-Z0-9]{2,20}$/

// ---------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------

/** The fields of a users.list member this reads, and nothing else */
export interface SlackMember {
  id?: unknown
  team_id?: unknown
  deleted?: unknown
  is_bot?: unknown
  is_app_user?: unknown
  is_workflow_bot?: unknown
  is_restricted?: unknown
  is_ultra_restricted?: unknown
  is_stranger?: unknown
  is_invited_user?: unknown
  enterprise_user?: { enterprise_id?: unknown } | null
  profile?: { email?: unknown } | null
}

export interface Workspace {
  team_id: string
  enterprise_id: string | null
}

/** Why a member is not matched; null when they may be */
export type SkipReason = 'no_id' | 'bot' | 'deleted' | 'guest' | 'invited' | 'stranger' | 'other_team' | 'no_email'

/**
 * Whether a member of the workspace may be matched to the register: a person of this workspace —
 * or, in an Enterprise Grid, of the same enterprise — with an e-mail address. Bots, Slackbot,
 * deactivated accounts, multi- and single-channel guests, people invited who never joined and
 * external people from a Slack Connect channel never are.
 */
export function skipReason(m: SlackMember, ws: Workspace): SkipReason | null {
  if (typeof m.id !== 'string' || !MEMBER_ID.test(m.id)) return 'no_id'
  if (m.id === 'USLACKBOT' || m.is_bot === true || m.is_app_user === true || m.is_workflow_bot === true) return 'bot'
  if (m.deleted === true) return 'deleted'
  if (m.is_restricted === true || m.is_ultra_restricted === true) return 'guest'
  if (m.is_invited_user === true) return 'invited'
  if (m.is_stranger === true) return 'stranger'
  const sameTeam = m.team_id === ws.team_id
  const sameGrid = ws.enterprise_id !== null && m.enterprise_user?.enterprise_id === ws.enterprise_id
  if (!sameTeam && !sameGrid) return 'other_team'
  const email = typeof m.profile?.email === 'string' ? m.profile.email.trim() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'no_email'
  return null
}

/** The digest the database matches on: SHA-256 of the lower-cased, trimmed address, in hex */
export async function emailDigest(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase())
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The members to hand slack_sync_apply: id and digest only; an id met twice counts once */
export async function eligibleMembers(members: SlackMember[], ws: Workspace): Promise<Array<{ id: string; email_sha256: string }>> {
  const out = new Map<string, string>()
  for (const m of members) {
    if (skipReason(m, ws) !== null) continue
    out.set(m.id as string, await emailDigest((m.profile as { email: string }).email))
  }
  return [...out].map(([id, email_sha256]) => ({ id, email_sha256 }))
}

// ---------------------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------------------

/** Slack's three control characters in message text (formatting reference: "escaping text") */
export const escapeSlack = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface SlackMessage {
  channel: string
  text: string
  unfurl_links: false
  unfurl_media: false
}

/**
 * One direct message: the lead, then the link, as `<url>` — Slack's own link syntax, which shows
 * the address itself, not a label in front of it. Text only: no blocks, attachments or metadata,
 * and both kinds of unfurling off, so Slack fetches nothing from the link and draws no preview.
 */
export function slackMessage(channel: string, lead: string, link: string): SlackMessage {
  if (!/^D[A-Z0-9]{2,20}$/.test(channel)) throw new Error('a Slack message needs a direct-message channel')
  const text = lead.trim()
  if (!text) throw new Error('a Slack message needs its text')
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/[A-Za-z0-9/_\-.~]*$/.test(link)) throw new Error('a Slack link must be a plain https address')
  return { channel, text: `${escapeSlack(text)}\n<${link}>`, unfurl_links: false, unfurl_media: false }
}

// ---------------------------------------------------------------------------------------
// Calling Slack
// ---------------------------------------------------------------------------------------

export type CallResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string; status: number; retryAfter: number | null }

/**
 * One Web API call. Errors come back as Slack's own code (`error`), or `http_<status>`; the token is
 * in the Authorization header only and never in what is returned. A 429 is retried once after
 * Retry-After (at most 8 s), as Slack asks.
 */
export async function callSlack(
  fetchFn: FetchLike,
  method: string,
  token: string | null,
  args: Record<string, unknown>,
  opts: { form?: boolean; sleep?: (ms: number) => Promise<void>; basic?: string } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (opts.basic) headers.authorization = `Basic ${opts.basic}`
  let body: string
  if (opts.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(Object.entries(args).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])).toString()
  } else {
    headers['content-type'] = 'application/json; charset=utf-8'
    body = JSON.stringify(args)
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res: Awaited<ReturnType<FetchLike>>
    try {
      res = await fetchFn(`${SLACK_API}${method}`, { method: 'POST', headers, body })
    } catch {
      return { ok: false, error: 'network', status: 0, retryAfter: null }
    }
    const text = await res.text()
    if (res.status === 429) {
      const ra = res.headers.get('retry-after')
      const wait = ra && /^\d{1,4}$/.test(ra.trim()) ? Number(ra.trim()) : 1
      if (attempt === 1 && wait <= 8 && opts.sleep) {
        await opts.sleep(wait * 1000)
        continue
      }
      return { ok: false, error: 'ratelimited', status: 429, retryAfter: wait }
    }
    if (!res.ok) return { ok: false, error: `http_${res.status}`, status: res.status, retryAfter: null }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return { ok: false, error: 'bad_json', status: res.status, retryAfter: null }
    }
    const o = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
    if (o.ok === true) return { ok: true, body: o }
    const code = typeof o.error === 'string' && /^[a-z0-9_.]{1,60}$/.test(o.error) ? o.error : 'slack_error'
    return { ok: false, error: code, status: res.status, retryAfter: null }
  }
  return { ok: false, error: 'ratelimited', status: 429, retryAfter: null }
}

/**
 * What a refusal means, for the dispatcher:
 *   person   this member cannot get a message (gone, deactivated, cannot be written to): the match
 *            is forgotten and the link goes by e-mail;
 *   install  the installation itself no longer works (app removed, token revoked, workspace gone,
 *            scope withdrawn, Messages tab off): it is marked broken, Slack stops for the
 *            organisation until a daglig leder connects again, and the link goes by e-mail;
 *   expired  the access token expired: refreshed once, then as install;
 *   retry    throttled or Slack's own fault: the link goes by e-mail this time;
 *   other    anything else: by e-mail.
 */
export type SlackKind = 'person' | 'install' | 'expired' | 'retry' | 'other'

const PERSON = new Set(['user_not_found', 'user_disabled', 'users_not_found', 'cannot_dm_bot', 'channel_not_found', 'is_archived', 'user_not_visible', 'not_in_channel'])
const INSTALL = new Set([
  'invalid_auth', 'not_authed', 'token_revoked', 'account_inactive', 'missing_scope', 'no_permission',
  'team_access_not_granted', 'app_access_restricted', 'org_login_required', 'ekm_access_denied',
  'messages_tab_disabled', 'not_allowed_token_type', 'team_not_found', 'enterprise_is_restricted',
])
const RETRY = new Set(['ratelimited', 'rate_limited', 'internal_error', 'fatal_error', 'service_unavailable', 'request_timeout', 'network', 'http_500', 'http_502', 'http_503', 'http_504'])

export function classifySlack(error: string): SlackKind {
  if (PERSON.has(error)) return 'person'
  if (error === 'token_expired') return 'expired'
  if (INSTALL.has(error)) return 'install'
  if (RETRY.has(error)) return 'retry'
  return 'other'
}

/** The register's word for a person Slack refused (slack_dispatch_result) */
export function personProblem(error: string): 'user_not_found' | 'user_disabled' | 'cannot_dm' {
  if (error === 'user_disabled') return 'user_disabled'
  if (error === 'user_not_found' || error === 'users_not_found' || error === 'user_not_visible') return 'user_not_found'
  return 'cannot_dm'
}

export type SlackOutcome = { ok: true } | { ok: false; kind: SlackKind; code: string }

/** Open the direct message with one member and post one message into it */
export async function sendSlack(
  deps: { fetch: FetchLike; sleep?: (ms: number) => Promise<void> },
  token: string,
  userId: string,
  lead: string,
  link: string,
): Promise<SlackOutcome> {
  if (!MEMBER_ID.test(userId)) return { ok: false, kind: 'other', code: 'slack_bad_member' }
  const open = await callSlack(deps.fetch, 'conversations.open', token, { users: userId, return_im: false }, { sleep: deps.sleep })
  if (!open.ok) return { ok: false, kind: classifySlack(open.error), code: `slack_${open.error}` }
  const channel = (open.body.channel as { id?: unknown } | undefined)?.id
  if (typeof channel !== 'string' || !/^D[A-Z0-9]{2,20}$/.test(channel)) return { ok: false, kind: 'other', code: 'slack_no_channel' }
  let message: SlackMessage
  try {
    message = slackMessage(channel, lead, link)
  } catch {
    return { ok: false, kind: 'other', code: 'slack_bad_message' }
  }
  const post = await callSlack(deps.fetch, 'chat.postMessage', token, message as unknown as Record<string, unknown>, { sleep: deps.sleep })
  if (!post.ok) return { ok: false, kind: classifySlack(post.error), code: `slack_${post.error}` }
  return { ok: true }
}

/**
 * After a Slack attempt: which channel carries the link now — exactly as SMS falls back. Slack when
 * it took the message; else, whatever Slack said, the same link by e-mail where the person has an
 * address (everyone matched in Slack was matched by one), and otherwise nothing in this run: the
 * row is then retried or given up as any failed send is.
 */
export function afterSlack(outcome: SlackOutcome, person: { email: string | null }): 'slack' | 'email' | 'none' {
  if (outcome.ok) return 'slack'
  if (person.email) return 'email'
  return 'none'
}

// ---------------------------------------------------------------------------------------
// OAuth: the code, the refresh, the revocation
// ---------------------------------------------------------------------------------------

export interface SlackApp {
  clientId: string
  clientSecret: string
}

/** The client id and secret, when both are set and look like Slack's */
export function slackApp(clientId: string | null | undefined, clientSecret: string | null | undefined): SlackApp | null {
  const id = (clientId ?? '').trim()
  const secret = (clientSecret ?? '').trim()
  if (!/^\d{6,20}\.\d{6,20}$/.test(id) || !/^[0-9a-f]{20,64}$/.test(secret)) return null
  return { clientId: id, clientSecret: secret }
}

const basicOf = (app: SlackApp) => btoa(`${app.clientId}:${app.clientSecret}`)

/** The authorisation request a daglig leder is sent to */
export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, scope: SLACK_SCOPES.join(','), redirect_uri: redirectUri, state })
  return `${SLACK_AUTHORIZE}?${q.toString()}`
}

/**
 * What oauth.v2.access answered, as slack_connect_complete takes it: the named fields only.
 * Never logged; the tokens in it go to the database and nowhere else.
 */
export interface Installation {
  token_type: string
  is_enterprise_install: boolean
  team_id: string
  team_name: string | null
  enterprise_id: string | null
  bot_user_id: string
  access_token: string
  refresh_token: string | null
  expires_in: number | null
  scope: string
}

export function readInstallation(body: Record<string, unknown>): Installation | null {
  const team = (body.team ?? null) as { id?: unknown; name?: unknown } | null
  const ent = (body.enterprise ?? null) as { id?: unknown } | null
  const s = (v: unknown) => (typeof v === 'string' ? v : null)
  const inst: Installation = {
    token_type: s(body.token_type) ?? '',
    is_enterprise_install: body.is_enterprise_install === true,
    team_id: s(team?.id) ?? '',
    team_name: s(team?.name),
    enterprise_id: s(ent?.id),
    bot_user_id: s(body.bot_user_id) ?? '',
    access_token: s(body.access_token) ?? '',
    refresh_token: s(body.refresh_token),
    expires_in: typeof body.expires_in === 'number' && Number.isInteger(body.expires_in) ? body.expires_in : null,
    scope: s(body.scope) ?? '',
  }
  if (!inst.is_enterprise_install && !TEAM_ID.test(inst.team_id)) return null
  if (!inst.access_token) return null
  return inst
}

/** The authorisation code for an installation (oauth.v2.access) */
export async function exchangeCode(fetchFn: FetchLike, app: SlackApp, code: string, redirectUri: string): Promise<
  { ok: true; installation: Installation } | { ok: false; code: string }
> {
  if (!/^[A-Za-z0-9.\-_]{10,300}$/.test(code)) return { ok: false, code: 'bad_code' }
  const res = await callSlack(fetchFn, 'oauth.v2.access', null, { code, redirect_uri: redirectUri }, { form: true, basic: basicOf(app) })
  if (!res.ok) return { ok: false, code: res.error }
  const installation = readInstallation(res.body)
  return installation ? { ok: true, installation } : { ok: false, code: 'bad_installation' }
}

export type RefreshResult = { ok: true; access: string; refresh: string; expiresIn: number } | { ok: false; kind: 'install' | 'retry'; code: string }

/** A new access token for the refresh token, which stops working the moment this succeeds */
export async function refreshToken(fetchFn: FetchLike, app: SlackApp, refresh: string): Promise<RefreshResult> {
  const res = await callSlack(fetchFn, 'oauth.v2.access', null, { grant_type: 'refresh_token', refresh_token: refresh }, { form: true, basic: basicOf(app) })
  if (!res.ok) {
    const retry = RETRY.has(res.error) || res.error.startsWith('http_5')
    return { ok: false, kind: retry ? 'retry' : 'install', code: res.error }
  }
  const b = res.body
  if (typeof b.access_token !== 'string' || typeof b.refresh_token !== 'string' || typeof b.expires_in !== 'number') {
    return { ok: false, kind: 'install', code: 'bad_refresh' }
  }
  return { ok: true, access: b.access_token, refresh: b.refresh_token, expiresIn: Math.floor(b.expires_in) }
}

/** auth.revoke: an already dead token counts as revoked */
export async function revokeToken(fetchFn: FetchLike, token: string): Promise<{ ok: true } | { ok: false; kind: 'expired' | 'retry' | 'other'; code: string }> {
  const res = await callSlack(fetchFn, 'auth.revoke', token, {}, { form: true })
  if (res.ok) return { ok: true }
  if (['invalid_auth', 'token_revoked', 'account_inactive', 'not_authed'].includes(res.error)) return { ok: true }
  if (res.error === 'token_expired') return { ok: false, kind: 'expired', code: res.error }
  if (RETRY.has(res.error)) return { ok: false, kind: 'retry', code: res.error }
  return { ok: false, kind: 'other', code: res.error }
}

/**
 * Every member of the workspace, page by page (users.list, 200 a page, at most 100 pages). The
 * token's own workspace is checked first (auth.test): a token for another workspace, or another
 * bot, is a broken installation, not a list to match.
 */
export async function listMembers(
  deps: { fetch: FetchLike; sleep?: (ms: number) => Promise<void> },
  token: string,
  ws: Workspace & { bot_user_id: string },
): Promise<{ ok: true; members: SlackMember[] } | { ok: false; code: string; kind: SlackKind }> {
  const who = await callSlack(deps.fetch, 'auth.test', token, {}, { form: true, sleep: deps.sleep })
  if (!who.ok) return { ok: false, code: who.error, kind: classifySlack(who.error) }
  if (who.body.team_id !== ws.team_id || who.body.user_id !== ws.bot_user_id) return { ok: false, code: 'workspace_mismatch', kind: 'install' }
  const members: SlackMember[] = []
  let cursor: string | undefined
  for (let page = 0; page < 100; page++) {
    const res = await callSlack(deps.fetch, 'users.list', token, { limit: 200, cursor }, { form: true, sleep: deps.sleep })
    if (!res.ok) return { ok: false, code: res.error, kind: classifySlack(res.error) }
    const got = res.body.members
    if (Array.isArray(got)) members.push(...(got as SlackMember[]))
    const next = (res.body.response_metadata as { next_cursor?: unknown } | undefined)?.next_cursor
    if (typeof next !== 'string' || next === '') return { ok: true, members }
    cursor = next
  }
  return { ok: false, code: 'too_many_pages', kind: 'other' }
}

// ---------------------------------------------------------------------------------------
// The dispatcher's run: tokens, sending, matching, revoking
// ---------------------------------------------------------------------------------------

export type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>

export interface RunDeps {
  fetch: FetchLike
  rpc: Rpc
  /** null when SLACK_CLIENT_ID / SLACK_CLIENT_SECRET are not set: tokens are then used until they expire */
  app: SlackApp | null
  sleep?: (ms: number) => Promise<void>
  log: (line: string) => void
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** One claimed job's Slack hand-over (0185 dispatch_claim): whom, in which organisation */
export function slackTarget(job: { channel: string; token: string | null; recipients: Array<{ slack?: unknown }> }): { user_id: string; org: string } | null {
  if (job.channel !== 'slack' || !job.token || job.recipients.length !== 1) return null
  const s = job.recipients[0]?.slack as { user_id?: unknown; org?: unknown } | null | undefined
  if (!s || typeof s.user_id !== 'string' || !MEMBER_ID.test(s.user_id)) return null
  if (typeof s.org !== 'string' || !UUID.test(s.org)) return null
  return { user_id: s.user_id, org: s.org }
}

/** A code as the database keeps it: lower-case letters, digits and underscores, at most 60 */
const asCode = (s: string) => s.toLowerCase().replace(/[^a-z_]/g, '_').slice(0, 60)

/**
 * The Slack half of one dispatcher run. Tokens are read once per organisation and kept in memory
 * for the run only; an organisation whose installation Slack refused is skipped for the rest of
 * it. Every log line is a code.
 */
export function slackRun(deps: RunDeps) {
  const tokens = new Map<string, string | null>()

  const broken = async (org: string, reason: string | null) => {
    const r = await deps.rpc('slack_install_broken', { p_org: org, p_reason: reason === null ? null : asCode(reason) })
    if (r.error) deps.log(`[slack] broken not recorded: ${r.error.code ?? ''}`)
    if (reason) tokens.set(org, null)
  }

  /** The organisation's token, refreshed first when it is about to expire and this run holds the lease */
  const token = async (org: string, force = false): Promise<string | null> => {
    if (!force && tokens.has(org)) return tokens.get(org) ?? null
    const got = await deps.rpc('slack_token', { p_org: org })
    const d = (got.data ?? {}) as { ok?: boolean; token?: unknown; refresh_token?: unknown }
    if (got.error || d.ok !== true || typeof d.token !== 'string') {
      if (got.error) deps.log(`[slack] token not read: ${got.error.code ?? ''}`)
      tokens.set(org, null)
      return null
    }
    let current: string = d.token
    if (typeof d.refresh_token === 'string') {
      if (!deps.app) {
        // nothing to refresh with: release the lease and use what there is until it expires
        await broken(org, null)
      } else {
        const fresh = await refreshToken(deps.fetch, deps.app, d.refresh_token)
        if (fresh.ok) {
          const kept = await deps.rpc('slack_token_store', { p_org: org, p_access: fresh.access, p_refresh: fresh.refresh, p_expires_in: fresh.expiresIn })
          const k = (kept.data ?? {}) as { ok?: boolean }
          if (kept.error || k.ok !== true) {
            // the old refresh token is spent: without the new pair stored there is nothing to go on
            deps.log(`[slack] refreshed pair not stored: ${kept.error?.code ?? 'refused'}`)
            await broken(org, 'refresh_not_stored')
            return null
          }
          current = fresh.access
        } else if (fresh.kind === 'install') {
          deps.log(`[slack] refresh refused: ${fresh.code}`)
          await broken(org, `refresh_${fresh.code}`)
          return null
        } else {
          deps.log(`[slack] refresh failed: ${fresh.code}`)
          await broken(org, null)
        }
      }
    }
    tokens.set(org, current)
    return current
  }

  /** One message; the caller falls back by afterSlack on anything but ok */
  const send = async (
    job: { id: string; channel: string; token: string | null; recipients: Array<{ slack?: unknown }> },
    lead: string,
    link: string,
  ): Promise<SlackOutcome> => {
    const target = slackTarget(job)
    if (!target) return { ok: false, kind: 'other', code: 'slack_no_target' }
    let tok = await token(target.org)
    if (!tok) return { ok: false, kind: 'install', code: 'slack_unavailable' }
    let res = await sendSlack(deps, tok, target.user_id, lead, link)
    if (!res.ok && res.kind === 'expired') {
      tok = await token(target.org, true)
      res = tok ? await sendSlack(deps, tok, target.user_id, lead, link) : { ok: false, kind: 'install', code: 'slack_unavailable' }
    }
    if (!res.ok && (res.kind === 'install' || res.kind === 'expired') && res.code !== 'slack_unavailable') {
      await broken(target.org, res.code.replace(/^slack_/, ''))
    }
    if (!res.ok && res.kind === 'person') {
      const r = await deps.rpc('slack_dispatch_result', { p_outbox: job.id, p_problem: personProblem(res.code.replace(/^slack_/, '')) })
      if (r.error) deps.log(`[slack] ${job.id}: result not recorded: ${r.error.code ?? ''}`)
    }
    return res
  }

  /** Match the workspaces due for it: asked for, or not matched for 20 hours */
  const sync = async (): Promise<{ synced: number; failed: number }> => {
    const tally = { synced: 0, failed: 0 }
    const due = await deps.rpc('slack_sync_due', { p_limit: 5 })
    if (due.error) {
      deps.log(`[slack] sync claim failed: ${due.error.code ?? ''}`)
      return tally
    }
    const list = (Array.isArray(due.data) ? due.data : []) as Array<{ org: string; team_id: string; enterprise_id: string | null; bot_user_id: string }>
    for (const w of list) {
      const tok = await token(w.org)
      const listed = tok ? await listMembers(deps, tok, w) : ({ ok: false, code: 'unavailable', kind: 'install' } as const)
      if (!listed.ok) {
        tally.failed++
        deps.log(`[slack] sync: ${listed.code}`)
        if (listed.kind === 'install' && tok) await broken(w.org, listed.code)
        const f = await deps.rpc('slack_sync_failed', { p_org: w.org, p_code: asCode(listed.code) })
        if (f.error) deps.log(`[slack] sync failure not recorded: ${f.error.code ?? ''}`)
        continue
      }
      const members = await eligibleMembers(listed.members, w)
      const applied = await deps.rpc('slack_sync_apply', { p_org: w.org, p_members: members, p_seen: members.length })
      const a = (applied.data ?? {}) as { ok?: boolean }
      if (applied.error || a.ok !== true) {
        tally.failed++
        deps.log(`[slack] sync not applied: ${applied.error?.code ?? 'refused'}`)
      } else tally.synced++
    }
    return tally
  }

  /** auth.revoke for every token a disconnect or a deleted organisation left; then the secrets go */
  const revoke = async (): Promise<number> => {
    const due = await deps.rpc('slack_revoke_claim', { p_limit: 10 })
    if (due.error) {
      deps.log(`[slack] revoke claim failed: ${due.error.code ?? ''}`)
      return 0
    }
    let done = 0
    for (const r of (Array.isArray(due.data) ? due.data : []) as Array<{ id: number; token: string | null; refresh_token: string | null }>) {
      let res: Awaited<ReturnType<typeof revokeToken>> = r.token ? await revokeToken(deps.fetch, r.token) : { ok: true }
      if (!res.ok && res.kind === 'expired' && r.refresh_token && deps.app) {
        const fresh = await refreshToken(deps.fetch, deps.app, r.refresh_token)
        res = fresh.ok ? await revokeToken(deps.fetch, fresh.access) : { ok: true }
      }
      if (!res.ok && res.kind === 'retry') {
        deps.log(`[slack] revoke ${r.id}: ${res.code}, will retry`)
        continue
      }
      if (!res.ok) deps.log(`[slack] revoke ${r.id}: ${res.code}, secrets deleted anyway`)
      const fin = await deps.rpc('slack_revoke_done', { p_id: r.id })
      if (fin.error) deps.log(`[slack] revoke ${r.id}: not recorded: ${fin.error.code ?? ''}`)
      else done++
    }
    return done
  }

  return { token, send, sync, revoke }
}
