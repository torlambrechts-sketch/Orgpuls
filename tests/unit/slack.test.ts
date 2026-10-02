import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  afterSlack,
  authorizeUrl,
  classifySlack,
  eligibleMembers,
  emailDigest,
  escapeSlack,
  exchangeCode,
  listMembers,
  readInstallation,
  sendSlack,
  skipReason,
  slackApp,
  slackMessage,
  slackRun,
  slackTarget,
  SLACK_SCOPES,
  type FetchLike,
  type Rpc,
  type SlackMember,
} from '@/supabase/functions/_shared/slack'

/**
 * Slack as a channel (0185, D-205), against the code the dispatcher runs.
 *
 * A fake Slack answers each Web API method from a table, and records every request, so the tests
 * can read exactly what would have been sent — and prove what never is: blocks, buttons, unfurling,
 * a token anywhere but the Authorization header.
 */

// test tokens are assembled, so no token-shaped literal sits in the repository (secret scanning)
const TOKEN = ['xox', 'e.xox', 'b-1-SECRETACCESSTOKENVALUE0001'].join('')
const REFRESH = ['xox', 'e-1-SECRETREFRESHTOKENVALUE0001'].join('')
const NEW_TOKEN = ['xox', 'e.xox', 'b-1-SECRETACCESSTOKENVALUE0002'].join('')
const NEW_REFRESH = ['xox', 'e-1-SECRETREFRESHTOKENVALUE0002'].join('')
const ORG = '00000000-0000-4000-8000-0000005a0c01'
const LINK = 'https://www.orgpuls.com/s/k3Xw9QpL2vRt7YbN4mZc8A'
const APP = { clientId: '1234567890.1234567890123', clientSecret: '0123456789abcdef0123456789abcdef' }

type Answer = { status?: number; body?: unknown; headers?: Record<string, string> }
type Sent = { method: string; headers: Record<string, string>; body: string }

function fakeSlack(answers: Record<string, Answer | Answer[]>) {
  const sent: Sent[] = []
  const fetchFn: FetchLike = async (url, init) => {
    const method = url.replace('https://slack.com/api/', '')
    sent.push({ method, headers: init?.headers ?? {}, body: init?.body ?? '' })
    const a = answers[method]
    const answer = Array.isArray(a) ? (a.shift() ?? { body: { ok: false, error: 'exhausted' } }) : (a ?? { body: { ok: false, error: 'unknown_method' } })
    const status = answer.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (n: string) => answer.headers?.[n.toLowerCase()] ?? null },
      text: async () => (typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {})),
    }
  }
  return { fetchFn, sent }
}

function fakeDb(token: Record<string, unknown> = { ok: true, token: TOKEN, expires_at: null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args })
    if (fn === 'slack_token') return { data: token, error: null }
    return { data: { ok: true }, error: null }
  }
  return { rpc, calls }
}

const job = (over: Partial<{ channel: string; token: string | null; slack: unknown }> = {}) => ({
  id: '00000000-0000-4000-8000-00000000a001',
  channel: over.channel ?? 'slack',
  token: over.token === undefined ? 'k3Xw9QpL2vRt7YbN4mZc8A' : over.token,
  recipients: [{ email: 'ada@firma.no', slack: over.slack === undefined ? { user_id: 'U0ADA0001', org: ORG } : over.slack }],
})

const opened = { body: { ok: true, channel: { id: 'D0DM00001' } } }
const posted = { body: { ok: true, channel: 'D0DM00001', ts: '1.2' } }

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------------------
describe('matching: only the workspace’s own people, by work e-mail', () => {
  const ws = { team_id: 'T0FIRMA01', enterprise_id: null }
  const person = (over: Partial<SlackMember> = {}): SlackMember => ({
    id: 'U0ADA0001',
    team_id: 'T0FIRMA01',
    profile: { email: 'ada@firma.no' },
    ...over,
  })

  it('takes a full member of the workspace with an address', () => {
    expect(skipReason(person(), ws)).toBeNull()
  })

  it('skips bots, Slackbot, apps and workflow bots', () => {
    expect(skipReason(person({ is_bot: true }), ws)).toBe('bot')
    expect(skipReason(person({ id: 'USLACKBOT' }), ws)).toBe('bot')
    expect(skipReason(person({ is_app_user: true }), ws)).toBe('bot')
    expect(skipReason(person({ is_workflow_bot: true }), ws)).toBe('bot')
  })

  it('skips deactivated accounts', () => {
    expect(skipReason(person({ deleted: true }), ws)).toBe('deleted')
  })

  it('skips multi- and single-channel guests', () => {
    expect(skipReason(person({ is_restricted: true }), ws)).toBe('guest')
    expect(skipReason(person({ is_ultra_restricted: true }), ws)).toBe('guest')
  })

  it('skips people invited who never joined', () => {
    expect(skipReason(person({ is_invited_user: true }), ws)).toBe('invited')
  })

  it('skips external Slack Connect people, by is_stranger and by another team', () => {
    expect(skipReason(person({ is_stranger: true }), ws)).toBe('stranger')
    expect(skipReason(person({ team_id: 'T0ANNEN01' }), ws)).toBe('other_team')
    expect(skipReason(person({ team_id: undefined }), ws)).toBe('other_team')
  })

  it('in an Enterprise Grid, takes a colleague of the same enterprise and no other', () => {
    const grid = { team_id: 'T0FIRMA01', enterprise_id: 'E0KONSERN' }
    expect(skipReason(person({ team_id: 'T0SOSTER1', enterprise_user: { enterprise_id: 'E0KONSERN' } }), grid)).toBeNull()
    expect(skipReason(person({ team_id: 'T0SOSTER1', enterprise_user: { enterprise_id: 'E0FREMMED' } }), grid)).toBe('other_team')
    // a workspace outside a Grid never accepts on an enterprise id
    expect(skipReason(person({ team_id: 'T0SOSTER1', enterprise_user: { enterprise_id: 'E0KONSERN' } }), ws)).toBe('other_team')
  })

  it('skips a member without a usable address or id', () => {
    expect(skipReason(person({ profile: {} }), ws)).toBe('no_email')
    expect(skipReason(person({ profile: { email: 'ikke en adresse' } }), ws)).toBe('no_email')
    expect(skipReason(person({ id: 'not-an-id' }), ws)).toBe('no_id')
  })

  it('hands the database digests of the lower-cased, trimmed address, never the address', async () => {
    const out = await eligibleMembers(
      [person({ profile: { email: '  Ada@Firma.NO ' } }), person({ id: 'U0BOT0001', is_bot: true }), person({ id: 'U0ADA0001' })],
      ws,
    )
    expect(out).toEqual([{ id: 'U0ADA0001', email_sha256: await emailDigest('ada@firma.no') }])
    expect(JSON.stringify(out)).not.toContain('@')
    // the same digest as the database computes: encode(digest(lower(btrim(email)), 'sha256'), 'hex')
    expect(await emailDigest('ada@firma.no')).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ---------------------------------------------------------------------------------------
describe('the message: short text, a plain link, nothing that reports back', () => {
  it('is text and a plain link, unfurling off, no blocks, attachments or metadata', () => {
    const m = slackMessage('D0DM00001', 'Hei! Firma AS spør hvordan du har det på jobb. Svar anonymt:', LINK)
    expect(m).toEqual({
      channel: 'D0DM00001',
      text: `Hei! Firma AS spør hvordan du har det på jobb. Svar anonymt:\n<${LINK}>`,
      unfurl_links: false,
      unfurl_media: false,
    })
    expect(Object.keys(m).sort()).toEqual(['channel', 'text', 'unfurl_links', 'unfurl_media'])
  })

  it('escapes Slack’s control characters in the text, so a name cannot make a link', () => {
    expect(escapeSlack('A & B <https://evil.example|klikk>')).toBe('A &amp; B &lt;https://evil.example|klikk&gt;')
    expect(slackMessage('D0DM00001', 'Fra <A&B>', LINK).text).toBe(`Fra &lt;A&amp;B&gt;\n<${LINK}>`)
  })

  it('refuses a link that is not a plain https address, and a channel that is not a DM', () => {
    for (const bad of ['http://www.orgpuls.com/s/x', `${LINK}|Svar her`, `${LINK}>`, 'javascript:alert(1)', `${LINK}?utm_source=slack`]) {
      expect(() => slackMessage('D0DM00001', 'Hei', bad), bad).toThrow()
    }
    expect(() => slackMessage('C0CHANNEL', 'Hei', LINK)).toThrow()
  })

  it('sends exactly that: conversations.open, then chat.postMessage, with the token only in the header', async () => {
    const { fetchFn, sent } = fakeSlack({ 'conversations.open': opened, 'chat.postMessage': posted })
    const res = await sendSlack({ fetch: fetchFn }, TOKEN, 'U0ADA0001', 'Hei! Svar anonymt:', LINK)
    expect(res).toEqual({ ok: true })
    expect(sent.map((s) => s.method)).toEqual(['conversations.open', 'chat.postMessage'])
    expect(JSON.parse(sent[0]!.body)).toEqual({ users: 'U0ADA0001', return_im: false })
    const post = JSON.parse(sent[1]!.body)
    expect(post).toEqual({ channel: 'D0DM00001', text: `Hei! Svar anonymt:\n<${LINK}>`, unfurl_links: false, unfurl_media: false })
    for (const k of ['blocks', 'attachments', 'metadata', 'reply_broadcast', 'thread_ts']) expect(post).not.toHaveProperty(k)
    for (const s of sent) {
      expect(s.headers.authorization).toBe(`Bearer ${TOKEN}`)
      expect(s.body).not.toContain(TOKEN)
    }
  })

  it('asks for exactly the four bot scopes', () => {
    expect([...SLACK_SCOPES]).toEqual(['chat:write', 'im:write', 'users:read', 'users:read.email'])
    const u = new URL(authorizeUrl(APP.clientId, 'https://www.orgpuls.com/integrasjoner/slack/callback', 'a'.repeat(64)))
    expect(u.origin + u.pathname).toBe('https://slack.com/oauth/v2/authorize')
    expect(u.searchParams.get('scope')).toBe('chat:write,im:write,users:read,users:read.email')
    expect(u.searchParams.get('user_scope')).toBeNull()
    expect(u.searchParams.get('state')).toBe('a'.repeat(64))
  })
})

// ---------------------------------------------------------------------------------------
describe('fallback: whatever Slack refuses, the same link goes by e-mail', () => {
  const codes: Array<[string, 'person' | 'install' | 'expired' | 'retry' | 'other']> = [
    ['user_not_found', 'person'],
    ['users_not_found', 'person'],
    ['user_disabled', 'person'],
    ['cannot_dm_bot', 'person'],
    ['channel_not_found', 'person'],
    ['invalid_auth', 'install'],
    ['not_authed', 'install'],
    ['token_revoked', 'install'],
    ['account_inactive', 'install'],
    ['missing_scope', 'install'],
    ['messages_tab_disabled', 'install'],
    ['team_access_not_granted', 'install'],
    ['ratelimited', 'retry'],
    ['internal_error', 'retry'],
    ['service_unavailable', 'retry'],
    ['something_new', 'other'],
  ]

  for (const [code, kind] of codes) {
    for (const at of ['conversations.open', 'chat.postMessage'] as const) {
      it(`${code} at ${at}: ${kind}, and e-mail carries the link`, async () => {
        const { fetchFn } = fakeSlack({
          'conversations.open': at === 'conversations.open' ? { body: { ok: false, error: code } } : opened,
          'chat.postMessage': { body: { ok: false, error: code } },
        })
        const db = fakeDb()
        const run = slackRun({ fetch: fetchFn, rpc: db.rpc, app: APP, log: () => {} })
        const res = await run.send(job(), 'Hei', LINK)
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.kind).toBe(kind)
        expect(classifySlack(code)).toBe(kind)
        expect(afterSlack(res, { email: 'ada@firma.no' })).toBe('email')
        // the register learns what Slack said: a person unmatched, an installation broken
        const fns = db.calls.map((c) => c.fn)
        expect(fns.includes('slack_dispatch_result')).toBe(kind === 'person')
        expect(fns.includes('slack_install_broken')).toBe(kind === 'install')
      })
    }
  }

  it('an expired token is refreshed once and the message sent with the new one', async () => {
    const { fetchFn, sent } = fakeSlack({
      'conversations.open': [{ body: { ok: false, error: 'token_expired' } }, opened],
      'chat.postMessage': posted,
      'oauth.v2.access': { body: { ok: true, access_token: NEW_TOKEN, refresh_token: NEW_REFRESH, expires_in: 43200 } },
    })
    let first = true
    const calls: string[] = []
    const rpc: Rpc = async (fn) => {
      calls.push(fn)
      if (fn === 'slack_token') {
        const d = first ? { ok: true, token: TOKEN } : { ok: true, token: TOKEN, refresh_token: REFRESH }
        first = false
        return { data: d, error: null }
      }
      return { data: { ok: true }, error: null }
    }
    const res = await slackRun({ fetch: fetchFn, rpc, app: APP, log: () => {} }).send(job(), 'Hei', LINK)
    expect(res).toEqual({ ok: true })
    expect(calls).toContain('slack_token_store')
    expect(sent.at(-1)!.headers.authorization).toBe(`Bearer ${NEW_TOKEN}`)
  })

  it('an HTTP failure or a network fault falls back too', async () => {
    for (const answer of [{ status: 500, body: 'oops' }, { status: 429, headers: { 'retry-after': '30' } }]) {
      const { fetchFn } = fakeSlack({ 'conversations.open': answer })
      const res = await slackRun({ fetch: fetchFn, rpc: fakeDb().rpc, app: APP, log: () => {} }).send(job(), 'Hei', LINK)
      expect(afterSlack(res, { email: 'ada@firma.no' })).toBe('email')
    }
    const down: FetchLike = async () => {
      throw new Error(`connect failed with ${TOKEN}`)
    }
    const res = await slackRun({ fetch: down, rpc: fakeDb().rpc, app: APP, log: () => {} }).send(job(), 'Hei', LINK)
    expect(res).toEqual({ ok: false, kind: 'retry', code: 'slack_network' })
  })

  it('no installation, a broken one or a malformed hand-over: e-mail, and Slack is not called', async () => {
    const { fetchFn, sent } = fakeSlack({})
    const broken = slackRun({ fetch: fetchFn, rpc: fakeDb({ ok: false, error: 'broken' }).rpc, app: APP, log: () => {} })
    expect(afterSlack(await broken.send(job(), 'Hei', LINK), { email: 'a@b.no' })).toBe('email')
    const run = slackRun({ fetch: fetchFn, rpc: fakeDb().rpc, app: APP, log: () => {} })
    for (const j of [job({ slack: null }), job({ slack: { user_id: 'x', org: ORG } }), job({ token: null }), job({ channel: 'email' })]) {
      expect(afterSlack(await run.send(j, 'Hei', LINK), { email: 'a@b.no' })).toBe('email')
    }
    expect(sent).toEqual([])
  })

  it('without an address there is nothing to fall back to', () => {
    expect(afterSlack({ ok: false, kind: 'person', code: 'slack_user_not_found' }, { email: null })).toBe('none')
    expect(afterSlack({ ok: true }, { email: null })).toBe('slack')
  })

  it('reads the hand-over the claim makes, and nothing malformed', () => {
    expect(slackTarget(job())).toEqual({ user_id: 'U0ADA0001', org: ORG })
    expect(slackTarget(job({ slack: { user_id: 'U0ADA0001', org: 'not-a-uuid' } }))).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------
describe('a token is never in a log line, an error, an outcome or a database code', () => {
  it('across sending, refusing, refreshing, matching and revoking', async () => {
    const logs: string[] = []
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { fetchFn } = fakeSlack({
      'conversations.open': [{ body: { ok: false, error: 'token_revoked' } }],
      'oauth.v2.access': [{ body: { ok: false, error: 'invalid_refresh_token' } }, { status: 503, body: '' }],
      'auth.test': { body: { ok: true, team_id: 'T0FIRMA01', user_id: 'U0BOT0001' } },
      'users.list': { body: { ok: false, error: 'missing_scope' } },
      'auth.revoke': [{ body: { ok: false, error: 'internal_error' } }, { body: { ok: true, revoked: true } }],
    })
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const rpc: Rpc = async (fn, args) => {
      calls.push({ fn, args })
      if (fn === 'slack_token') return { data: { ok: true, token: TOKEN, refresh_token: REFRESH }, error: null }
      if (fn === 'slack_sync_due') return { data: [{ org: ORG, team_id: 'T0FIRMA01', enterprise_id: null, bot_user_id: 'U0BOT0001' }], error: null }
      if (fn === 'slack_revoke_claim') return { data: [{ id: 1, token: TOKEN, refresh_token: REFRESH }, { id: 2, token: TOKEN, refresh_token: null }], error: null }
      return { data: { ok: true }, error: null }
    }
    const run = slackRun({ fetch: fetchFn, rpc, app: APP, log: (l) => logs.push(l) })
    const outcomes: unknown[] = []
    outcomes.push(await run.send(job(), 'Hei', LINK))
    const run2 = slackRun({ fetch: fetchFn, rpc, app: APP, log: (l) => logs.push(l) })
    outcomes.push(await run2.sync())
    outcomes.push(await run2.revoke())
    const exchange = await exchangeCode(fakeSlack({ 'oauth.v2.access': { body: { ok: false, error: 'invalid_code' } } }).fetchFn, APP, 'code-1234567890', 'https://x.no/cb')
    outcomes.push(exchange)

    const everything = JSON.stringify({
      logs,
      outcomes,
      // what goes to the database besides the token store itself (which is where tokens belong)
      calls: calls.filter((c) => c.fn !== 'slack_token_store'),
      console: [...consoleSpy.mock.calls, ...consoleLog.mock.calls],
    })
    for (const secret of [TOKEN, REFRESH, 'SECRETACCESSTOKENVALUE', 'SECRETREFRESHTOKENVALUE', APP.clientSecret]) {
      expect(everything).not.toContain(secret)
    }
    // and none of it carries the link or a member id
    expect(logs.join('\n')).not.toContain(LINK)
    expect(logs.join('\n')).not.toContain('U0ADA0001')
    // what was reported is codes
    for (const c of calls.filter((x) => x.fn === 'slack_install_broken' || x.fn === 'slack_sync_failed')) {
      const v = ('p_reason' in c.args ? c.args.p_reason : c.args.p_code) as string | null
      if (v !== null) expect(v).toMatch(/^[a-z0-9_]{1,60}$/)
    }
  })

  it('an error thrown while building a message names no token, link or text', () => {
    try {
      slackMessage('D0DM00001', 'Hei', `${LINK}|${TOKEN}`)
      expect.unreachable()
    } catch (e) {
      expect(String(e)).not.toContain(TOKEN)
      expect(String(e)).not.toContain(LINK)
    }
  })
})

// ---------------------------------------------------------------------------------------
describe('tokens: rotation and revocation', () => {
  it('a token about to expire is refreshed first, and the new pair stored', async () => {
    const { fetchFn, sent } = fakeSlack({
      'oauth.v2.access': { body: { ok: true, access_token: NEW_TOKEN, refresh_token: NEW_REFRESH, expires_in: 43200 } },
      'conversations.open': opened,
      'chat.postMessage': posted,
    })
    const db = fakeDb({ ok: true, token: TOKEN, refresh_token: REFRESH })
    const res = await slackRun({ fetch: fetchFn, rpc: db.rpc, app: APP, log: () => {} }).send(job(), 'Hei', LINK)
    expect(res).toEqual({ ok: true })
    const refresh = sent.find((s) => s.method === 'oauth.v2.access')!
    expect(new URLSearchParams(refresh.body).get('grant_type')).toBe('refresh_token')
    expect(refresh.headers.authorization).toBe(`Basic ${btoa(`${APP.clientId}:${APP.clientSecret}`)}`)
    expect(db.calls.find((c) => c.fn === 'slack_token_store')?.args).toEqual({ p_org: ORG, p_access: NEW_TOKEN, p_refresh: NEW_REFRESH, p_expires_in: 43200 })
    expect(sent.filter((s) => s.method !== 'oauth.v2.access').every((s) => s.headers.authorization === `Bearer ${NEW_TOKEN}`)).toBe(true)
  })

  it('a refused refresh breaks the installation; a failed one releases the lease and keeps the old token', async () => {
    const refused = fakeDb({ ok: true, token: TOKEN, refresh_token: REFRESH })
    await slackRun({ fetch: fakeSlack({ 'oauth.v2.access': { body: { ok: false, error: 'invalid_refresh_token' } } }).fetchFn, rpc: refused.rpc, app: APP, log: () => {} }).token(ORG)
    expect(refused.calls.find((c) => c.fn === 'slack_install_broken')?.args).toEqual({ p_org: ORG, p_reason: 'refresh_invalid_refresh_token' })

    const flaky = fakeDb({ ok: true, token: TOKEN, refresh_token: REFRESH })
    const tok = await slackRun({ fetch: fakeSlack({ 'oauth.v2.access': { status: 503, body: '' } }).fetchFn, rpc: flaky.rpc, app: APP, log: () => {} }).token(ORG)
    expect(tok).toBe(TOKEN)
    expect(flaky.calls.find((c) => c.fn === 'slack_install_broken')?.args).toEqual({ p_org: ORG, p_reason: null })
  })

  it('revocation calls auth.revoke, keeps a transient failure for later, and counts a dead token as revoked', async () => {
    const { fetchFn, sent } = fakeSlack({
      'auth.revoke': [{ body: { ok: true, revoked: true } }, { body: { ok: false, error: 'internal_error' } }, { body: { ok: false, error: 'invalid_auth' } }],
    })
    const done: unknown[] = []
    const rpc: Rpc = async (fn, args) => {
      if (fn === 'slack_revoke_claim') return { data: [1, 2, 3].map((id) => ({ id, token: TOKEN, refresh_token: null })), error: null }
      if (fn === 'slack_revoke_done') done.push(args.p_id)
      return { data: { ok: true }, error: null }
    }
    expect(await slackRun({ fetch: fetchFn, rpc, app: APP, log: () => {} }).revoke()).toBe(2)
    expect(done).toEqual([1, 3])
    expect(sent.every((s) => s.method === 'auth.revoke' && s.headers.authorization === `Bearer ${TOKEN}`)).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------
describe('the sync', () => {
  it('checks the token is this workspace’s own bot before matching anyone', async () => {
    const { fetchFn } = fakeSlack({ 'auth.test': { body: { ok: true, team_id: 'T0ANNEN01', user_id: 'U0BOT0001' } } })
    const res = await listMembers({ fetch: fetchFn }, TOKEN, { team_id: 'T0FIRMA01', enterprise_id: null, bot_user_id: 'U0BOT0001' })
    expect(res).toEqual({ ok: false, code: 'workspace_mismatch', kind: 'install' })
  })

  it('reads every page, then hands over the eligible members as digests', async () => {
    const page = (ids: string[], next: string) => ({
      body: { ok: true, members: ids.map((id) => ({ id, team_id: 'T0FIRMA01', profile: { email: `${id.toLowerCase()}@firma.no` } })), response_metadata: { next_cursor: next } },
    })
    const { fetchFn, sent } = fakeSlack({
      'auth.test': { body: { ok: true, team_id: 'T0FIRMA01', user_id: 'U0BOT0001' } },
      'users.list': [page(['U0A000001', 'U0A000002'], 'c2'), page(['U0A000003'], '')],
    })
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const rpc: Rpc = async (fn, args) => {
      calls.push({ fn, args })
      if (fn === 'slack_token') return { data: { ok: true, token: TOKEN }, error: null }
      if (fn === 'slack_sync_due') return { data: [{ org: ORG, team_id: 'T0FIRMA01', enterprise_id: null, bot_user_id: 'U0BOT0001' }], error: null }
      return { data: { ok: true }, error: null }
    }
    expect(await slackRun({ fetch: fetchFn, rpc, app: APP, log: () => {} }).sync()).toEqual({ synced: 1, failed: 0 })
    expect(new URLSearchParams(sent[2]!.body).get('cursor')).toBe('c2')
    const apply = calls.find((c) => c.fn === 'slack_sync_apply')!
    expect(apply.args.p_seen).toBe(3)
    expect(JSON.stringify(apply.args.p_members)).not.toContain('@')
  })
})

// ---------------------------------------------------------------------------------------
describe('the installation Slack hands back', () => {
  const answer = {
    ok: true,
    access_token: TOKEN,
    token_type: 'bot',
    scope: 'chat:write,im:write,users:read,users:read.email',
    bot_user_id: 'U0BOT0001',
    app_id: 'A0APP0001',
    team: { name: 'Firma', id: 'T0FIRMA01' },
    enterprise: null,
    authed_user: { id: 'U0LEDER01' },
    is_enterprise_install: false,
    refresh_token: REFRESH,
    expires_in: 43200,
  }

  it('is read field by field, the person who installed left out', () => {
    const inst = readInstallation(answer)
    expect(inst).toEqual({
      token_type: 'bot', is_enterprise_install: false, team_id: 'T0FIRMA01', team_name: 'Firma', enterprise_id: null,
      bot_user_id: 'U0BOT0001', access_token: TOKEN, refresh_token: REFRESH, expires_in: 43200,
      scope: 'chat:write,im:write,users:read,users:read.email',
    })
    expect(JSON.stringify(inst)).not.toContain('U0LEDER01')
  })

  it('exchanges the code with the app’s credentials in the header, never in the body', async () => {
    const { fetchFn, sent } = fakeSlack({ 'oauth.v2.access': { body: answer } })
    const res = await exchangeCode(fetchFn, APP, '1234.5678.abcdef', 'https://www.orgpuls.com/integrasjoner/slack/callback')
    expect(res.ok).toBe(true)
    expect(sent[0]!.body).not.toContain(APP.clientSecret)
    expect(new URLSearchParams(sent[0]!.body).get('redirect_uri')).toBe('https://www.orgpuls.com/integrasjoner/slack/callback')
  })

  it('only a client id and secret shaped like Slack’s configure the app', () => {
    expect(slackApp(APP.clientId, APP.clientSecret)).toEqual(APP)
    expect(slackApp('', APP.clientSecret)).toBeNull()
    expect(slackApp(APP.clientId, undefined)).toBeNull()
    expect(slackApp('abc', 'def')).toBeNull()
  })
})
