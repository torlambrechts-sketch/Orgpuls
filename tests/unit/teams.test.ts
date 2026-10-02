import { constants, createHash, createPublicKey, generateKeyPairSync, sign as nodeSign, verify as nodeVerify } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { personalLink, pick, smsLead, type MailCatalogue, type NoticeJob } from '@/supabase/functions/_shared/mail'
import {
  afterTeams,
  b64urlDecode,
  b64urlEncode,
  backoff,
  BOT_ISSUER,
  BOT_SCOPE,
  botToken,
  classify,
  credentialKind,
  handleBotCall,
  isServiceUrl,
  pickLead,
  readActivity,
  sendTeams,
  teamsActivity,
  teamsRecord,
  teamsTarget,
  tokenEndpoint,
  verifyBotJwt,
  type BotJwk,
  type FetchLike,
  type SendDeps,
  type TeamsTarget,
} from '@/supabase/functions/_shared/teams'

/**
 * Teams as a channel (0176, D-203): the card, the hand-over from the claim, sending with retries
 * and the fallback, the bot's token, and the bot endpoint's checks — against the module the edge
 * functions run.
 */

const APP = 'https://app.orgpuls.com'
const TOKEN = 'k3Xw9QpL2vRt7YbN4mZc8A'
const APP_ID = '11111111-2222-4333-8444-555555555555'
const TENANT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OBJECT = '99999999-8888-4777-8666-555555555555'
const SVC = 'https://smba.trafficmanager.net/emea/'

// a survey language as the registry would hand it over (D-133): its own approved texts
const pl = {
  ...(no.mail as Record<string, unknown>),
  sms: { default: 'Cześć! {org} pyta, jak Ci się pracuje. Odpowiedz anonimowo:', reminder: 'Przypomnienie od {org}: odpowiedz do {date}. Nowy link, anonimowo:', link: 'Link od {org}. Odpowiedz anonimowo:', lastReminder: 'Ostatnie przypomnienie od {org}: zamyka się {date}. Nowy link:' },
  invitasjon: { ...(no.mail.invitasjon as Record<string, unknown>), cta: 'Odpowiedz teraz' },
}
const cat = { no: no.mail, en: en.mail, pl } as unknown as MailCatalogue

const job = (over: Partial<NoticeJob> = {}): NoticeJob => ({
  id: 'x',
  kind: 'invitasjon',
  audience: null,
  channel: 'teams',
  sms_text: null,
  lang: 'no',
  org: 'Nordvik Anlegg AS',
  k: 5,
  round: { kind: 'grunnlinje', year: 2026, pulse: null, opens_at: '2026-10-06T07:00:00Z', closes_at: '2026-10-13T07:00:00Z' },
  recipients: [
    {
      email: 'ola@firma.no',
      phone: null,
      name: 'Ola',
      lang: null,
      member: false,
      teams: { object_id: OBJECT, tenant_id: TENANT, conversation_id: null, service_url: null },
    },
  ],
  token: TOKEN,
  ...over,
})

const card = (j: NoticeJob, lang: 'no' | 'en' | 'pl') =>
  teamsActivity(pickLead(smsLead(cat, j, lang), smsLead(cat, { ...j, sms_text: null }, lang)), pick(cat[lang], 'invitasjon.cta'), personalLink(APP, TOKEN))

describe('the card', () => {
  for (const lang of ['no', 'en', 'pl'] as const) {
    for (const kind of ['invitasjon', 'paminnelse', 'siste_paminnelse'] as const) {
      it(`${lang} ${kind}: the translated lead and one button to the link, no URL in the text`, () => {
        const a = card(job({ kind }), lang)
        const c = a.attachments[0]!.content
        expect(a.attachments).toHaveLength(1)
        expect(a.attachments[0]!.contentType).toBe('application/vnd.microsoft.card.adaptive')
        expect(c.body).toHaveLength(1)
        expect(c.body[0]!.text).toBe(smsLead(cat, job({ kind }), lang))
        expect(c.body[0]!.text).not.toMatch(/https?:|www\.|\/s\//)
        expect(a.summary).toBe(c.body[0]!.text)
        expect(c.actions).toEqual([{ type: 'Action.OpenUrl', title: pick(cat[lang], 'invitasjon.cta'), url: `${APP}/s/${TOKEN}` }])
        const all = JSON.stringify(a)
        expect(all).not.toMatch(/Action\.Submit|Action\.Execute|Action\.ShowCard|ToggleVisibility|msteams|readReceipt/i)
        // the link appears once: in the button, nowhere else
        expect(all.split(TOKEN)).toHaveLength(2)
      })
    }
  }

  it('uses the organisation\'s own SMS text, but never one with a link in it', () => {
    const own = card(job({ sms_text: 'Hei fra oss! Svar gjerne:' }), 'no')
    expect(own.attachments[0]!.content.body[0]!.text).toBe('Hei fra oss! Svar gjerne:')
    const linked = card(job({ sms_text: 'Les mer på https://firma.no og svar:' }), 'no')
    expect(linked.attachments[0]!.content.body[0]!.text).toBe('Hei! Nordvik Anlegg AS spør hvordan du har det på jobb. Svar anonymt:')
  })

  it('refuses a lead with a link, a missing label or a link that is not https', () => {
    expect(() => teamsActivity('Svar på www.example.com', 'Svar nå', `${APP}/s/${TOKEN}`)).toThrow()
    expect(() => teamsActivity('Svar her', ' ', `${APP}/s/${TOKEN}`)).toThrow()
    expect(() => teamsActivity('Svar her', 'Svar nå', `http://app.orgpuls.com/s/${TOKEN}`)).toThrow()
  })
})

describe('the hand-over from the claim', () => {
  it('addresses a person only when the claim chose Teams and handed over a well-formed identity', () => {
    expect(teamsTarget(job())).toEqual({ object_id: OBJECT, tenant_id: TENANT, conversation_id: null, service_url: null })
    expect(teamsTarget(job({ channel: 'email' }))).toBeNull()
    expect(teamsTarget(job({ token: null }))).toBeNull()
    const bad = job()
    bad.recipients[0]!.teams = { object_id: 'not-a-guid', tenant_id: TENANT, conversation_id: null, service_url: null }
    expect(teamsTarget(bad)).toBeNull()
    const none = job()
    none.recipients[0]!.teams = null
    expect(teamsTarget(none)).toBeNull()
  })

  it('keeps a conversation only together with a service URL on Microsoft\'s host', () => {
    const j = job()
    j.recipients[0]!.teams = { object_id: OBJECT, tenant_id: TENANT, conversation_id: 'a:1abc', service_url: 'https://evil.example/' }
    expect(teamsTarget(j)).toMatchObject({ conversation_id: null, service_url: null })
    j.recipients[0]!.teams = { object_id: OBJECT, tenant_id: TENANT, conversation_id: 'a:1abc', service_url: SVC }
    expect(teamsTarget(j)).toMatchObject({ conversation_id: 'a:1abc', service_url: SVC })
  })

  it('sends a bot token only to the Bot Connector', () => {
    expect(isServiceUrl(SVC)).toBe(true)
    expect(isServiceUrl('https://smba.trafficmanager.net/amer/' + TENANT + '/')).toBe(true)
    for (const u of ['http://smba.trafficmanager.net/emea/', 'https://smba.trafficmanager.net.evil.example/', 'https://x@smba.trafficmanager.net/', 'https://smba.trafficmanager.net:8443/', 'https://smba.trafficmanager.net/emea/?x=1', 'https://evil.example/', '', null]) {
      expect(isServiceUrl(u)).toBe(false)
    }
  })
})

// ------------------------------------------------------------------------- sending

type Call = { url: string; method?: string; headers?: Record<string, string>; body?: string }
function fakeFetch(replies: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = []
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, ...init })
    const r = replies.shift() ?? { status: 500 }
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null },
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})),
    }
  }
  return { fn, calls }
}
const deps = (f: FetchLike, sleep = vi.fn(async () => {})): SendDeps & { sleep: typeof sleep } => ({
  fetch: f,
  sleep,
  token: async () => 'bot-token',
  appId: APP_ID,
  defaultServiceUrl: SVC,
})
const target: TeamsTarget = { object_id: OBJECT, tenant_id: TENANT, conversation_id: null, service_url: null }
const activity = teamsActivity('Hei! Svar anonymt:', 'Svar nå', `${APP}/s/${TOKEN}`)

describe('sending', () => {
  it('creates the 1:1 conversation by object id and tenant, then sends the card, and hands back the conversation to keep', async () => {
    const { fn, calls } = fakeFetch([{ status: 201, body: { id: 'a:1conv' } }, { status: 201, body: { id: 'act1' } }])
    const r = await sendTeams(deps(fn), target, activity)
    expect(r).toEqual({ ok: true, conversation: { id: 'a:1conv', serviceUrl: SVC } })
    expect(calls[0]!.url).toBe(`${SVC}v3/conversations`)
    expect(JSON.parse(calls[0]!.body!)).toEqual({
      isGroup: false,
      bot: { id: `28:${APP_ID}` },
      members: [{ id: OBJECT }],
      tenantId: TENANT,
      channelData: { tenant: { id: TENANT } },
    })
    expect(calls[0]!.headers!.authorization).toBe('Bearer bot-token')
    expect(calls[1]!.url).toBe(`${SVC}v3/conversations/a%3A1conv/activities`)
    expect(JSON.parse(calls[1]!.body!)).toEqual(activity)
  })

  it('uses a kept conversation without creating one, and keeps nothing new', async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { id: 'act' } }])
    const r = await sendTeams(deps(fn), { ...target, conversation_id: 'a:kept', service_url: 'https://smba.trafficmanager.net/amer/' }, activity)
    expect(r).toEqual({ ok: true, conversation: null })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://smba.trafficmanager.net/amer/v3/conversations/a%3Akept/activities')
  })

  it('makes a new conversation once when Teams no longer knows the kept one', async () => {
    const { fn, calls } = fakeFetch([{ status: 404 }, { status: 201, body: { id: 'a:new' } }, { status: 201 }])
    const r = await sendTeams(deps(fn), { ...target, conversation_id: 'a:old', service_url: SVC }, activity)
    expect(r).toEqual({ ok: true, conversation: { id: 'a:new', serviceUrl: SVC } })
    expect(calls.map((c) => c.url)).toEqual([`${SVC}v3/conversations/a%3Aold/activities`, `${SVC}v3/conversations`, `${SVC}v3/conversations/a%3Anew/activities`])
  })

  it('reads 403 MessageWritesBlocked as blocked, another 403 or a 404 as unreachable, 401 as the bot refused', async () => {
    const blocked = '{"errorCode":209,"message":"{\\n  \\"subCode\\": \\"MessageWritesBlocked\\",\\n  \\"details\\": \\"Thread is blocked from message writes.\\"}"}'
    expect(await sendTeams(deps(fakeFetch([{ status: 403, body: blocked }]).fn), target, activity)).toEqual({ ok: false, kind: 'blocked', code: 'teams_blocked' })
    expect(await sendTeams(deps(fakeFetch([{ status: 403, body: '{"error":{"code":"ForbiddenOperationException"}}' }]).fn), target, activity)).toEqual({ ok: false, kind: 'invalid', code: 'teams_403' })
    expect(await sendTeams(deps(fakeFetch([{ status: 404 }]).fn), target, activity)).toEqual({ ok: false, kind: 'invalid', code: 'teams_404' })
    expect(await sendTeams(deps(fakeFetch([{ status: 401 }]).fn), target, activity)).toEqual({ ok: false, kind: 'auth', code: 'teams_401' })
    expect(classify(400, '')).toEqual({ ok: false, kind: 'other', code: 'teams_400' })
  })

  it('retries 429, 412, 502 and 504 with backoff, honouring Retry-After', async () => {
    const sleep = vi.fn(async () => {})
    const { fn, calls } = fakeFetch([
      { status: 201, body: { id: 'a:c' } },
      { status: 429, headers: { 'retry-after': '3' } },
      { status: 412 },
      { status: 502 },
      { status: 201 },
    ])
    const r = await sendTeams(deps(fn, sleep), target, activity)
    expect(r.ok).toBe(true)
    expect(calls).toHaveLength(5)
    expect(sleep.mock.calls.map((c) => (c as unknown as [number])[0])).toEqual([3000, 2000, 4000])
    expect(backoff(1, '120')).toBe(8000)
  })

  it('gives up after four attempts at a gateway error, as a retry for later', async () => {
    const sleep = vi.fn(async () => {})
    const { fn, calls } = fakeFetch([{ status: 504 }, { status: 504 }, { status: 504 }, { status: 504 }])
    expect(await sendTeams(deps(fn, sleep), target, activity)).toEqual({ ok: false, kind: 'retry', code: 'teams_504' })
    expect(calls).toHaveLength(4)
    expect(sleep).toHaveBeenCalledTimes(3)
  })

  it('never sends to a service URL off Microsoft\'s host', async () => {
    const { fn, calls } = fakeFetch([])
    const r = await sendTeams({ ...deps(fn), defaultServiceUrl: 'https://evil.example/' }, target, activity)
    expect(r).toEqual({ ok: false, kind: 'other', code: 'teams_bad_service_url' })
    expect(calls).toHaveLength(0)
  })
})

describe('the fallback', () => {
  const person = { email: 'ola@firma.no', phone: '+4791234567' }
  it('falls back to e-mail when Teams refuses, and to SMS without an address', () => {
    for (const kind of ['blocked', 'invalid', 'auth', 'retry', 'other'] as const) {
      expect(afterTeams({ ok: false, kind, code: 'x' }, person)).toBe('email')
      expect(afterTeams({ ok: false, kind, code: 'x' }, { email: null, phone: person.phone })).toBe('sms')
      expect(afterTeams({ ok: false, kind, code: 'x' }, { email: null, phone: null })).toBe('none')
    }
    expect(afterTeams({ ok: true, conversation: null }, person)).toBe('teams')
  })

  it('records blocked and unreachable as register facts, a new conversation to keep, and nothing else', () => {
    expect(teamsRecord({ ok: false, kind: 'blocked', code: 'teams_blocked' })).toEqual({ p_problem: 'blocked' })
    expect(teamsRecord({ ok: false, kind: 'invalid', code: 'teams_403' })).toEqual({ p_problem: 'invalid' })
    expect(teamsRecord({ ok: false, kind: 'retry', code: 'teams_429' })).toBeNull()
    expect(teamsRecord({ ok: false, kind: 'auth', code: 'teams_401' })).toBeNull()
    expect(teamsRecord({ ok: true, conversation: { id: 'a:1', serviceUrl: SVC } })).toEqual({ p_conversation: 'a:1', p_service_url: SVC })
    expect(teamsRecord({ ok: true, conversation: null })).toBeNull()
  })
})

// ------------------------------------------------------------------------- the bot's token

describe('the bot\'s token', () => {
  it('asks the bot\'s own tenant with the secret when no certificate is set', async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { access_token: 'tok', expires_in: 3599 } }])
    const r = await botToken(fn, { appId: APP_ID, tenantId: TENANT, secret: 's3cret' }, 1_000_000, 'jti')
    expect(r).toMatchObject({ ok: true, token: 'tok' })
    expect(calls[0]!.url).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`)
    const form = new URLSearchParams(calls[0]!.body)
    expect(Object.fromEntries(form)).toEqual({ grant_type: 'client_credentials', client_id: APP_ID, scope: BOT_SCOPE, client_secret: 's3cret' })
  })

  it('prefers a certificate: a PS256 assertion with the SHA-256 thumbprint, no secret sent', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const der = Buffer.from('a certificate\'s DER bytes')
    const certPem = `-----BEGIN CERTIFICATE-----\n${der.toString('base64')}\n-----END CERTIFICATE-----`
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
    const { fn, calls } = fakeFetch([{ status: 200, body: { access_token: 'tok', expires_in: 3600 } }])
    const r = await botToken(fn, { appId: APP_ID, tenantId: TENANT, secret: 'unused', certPem, keyPem }, 1_700_000_000_000, 'the-jti')
    expect(r.ok).toBe(true)
    const form = new URLSearchParams(calls[0]!.body)
    expect(form.get('client_secret')).toBeNull()
    expect(form.get('client_assertion_type')).toBe('urn:ietf:params:oauth:client-assertion-type:jwt-bearer')
    const [h, p, s] = form.get('client_assertion')!.split('.') as [string, string, string]
    const header = JSON.parse(Buffer.from(b64urlDecode(h)).toString())
    const claims = JSON.parse(Buffer.from(b64urlDecode(p)).toString())
    expect(header).toEqual({ alg: 'PS256', typ: 'JWT', 'x5t#S256': b64urlEncode(createHash('sha256').update(der).digest()) })
    expect(claims).toEqual({ aud: tokenEndpoint(TENANT), iss: APP_ID, sub: APP_ID, jti: 'the-jti', nbf: 1_700_000_000, iat: 1_700_000_000, exp: 1_700_000_300 })
    const ok = nodeVerify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(b64urlDecode(s)))
    expect(ok).toBe(true)
  })

  it('is not configured without app id, tenant and a credential, and says so by code', async () => {
    expect(credentialKind({ appId: APP_ID, tenantId: TENANT })).toBeNull()
    expect(credentialKind({ appId: 'x', tenantId: TENANT, secret: 's' })).toBeNull()
    expect(await botToken(fakeFetch([]).fn, { appId: '', tenantId: '' }, 0, 'j')).toEqual({ ok: false, code: 'teams_not_configured', status: 0 })
    expect(await botToken(fakeFetch([{ status: 401 }]).fn, { appId: APP_ID, tenantId: TENANT, secret: 's' }, 0, 'j')).toEqual({ ok: false, code: 'token_http_401', status: 401 })
  })
})

// ------------------------------------------------------------------------- the bot endpoint

const { privateKey: signer, publicKey: signerPub } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwkOf = (pub: ReturnType<typeof createPublicKey>, kid: string, endorsements = ['msteams', 'skype']): BotJwk => {
  const j = pub.export({ format: 'jwk' }) as { n: string; e: string }
  return { kty: 'RSA', kid, n: j.n, e: j.e, endorsements }
}
const KEYS: Record<string, BotJwk> = {
  k1: jwkOf(signerPub, 'k1'),
  k2: jwkOf(signerPub, 'k2', ['webchat']),
}
const keys = async (kid: string) => KEYS[kid] ?? null
const NOW = 1_800_000_000_000
const sign = (claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT', kid: 'k1' }) => {
  const input = `${b64urlEncode(Buffer.from(JSON.stringify(header)))}.${b64urlEncode(Buffer.from(JSON.stringify(claims)))}`
  const sig = nodeSign('sha256', Buffer.from(input), signer)
  return `${input}.${b64urlEncode(sig)}`
}
const good = (over: Record<string, unknown> = {}) => ({
  iss: BOT_ISSUER,
  aud: APP_ID,
  serviceurl: SVC,
  nbf: NOW / 1000 - 60,
  exp: NOW / 1000 + 3600,
  ...over,
})
const check = (auth: string | null, o: { channelId?: string | null; serviceUrl?: string | null } = {}) =>
  verifyBotJwt(auth, { appId: APP_ID, nowMs: NOW, keys, channelId: 'msteams', serviceUrl: SVC, ...o })

describe('the bot endpoint\'s token check', () => {
  it('accepts a token Microsoft signed for this bot', async () => {
    expect(await check(`Bearer ${sign(good())}`)).toEqual({ ok: true })
  })

  it('refuses the wrong audience, the wrong issuer, an expired or not yet valid token', async () => {
    expect(await check(`Bearer ${sign(good({ aud: '00000000-0000-4000-8000-000000000000' }))}`)).toMatchObject({ ok: false, status: 401, code: 'bad_audience' })
    expect(await check(`Bearer ${sign(good({ iss: 'https://sts.windows.net/' + TENANT + '/' }))}`)).toMatchObject({ ok: false, code: 'bad_issuer' })
    expect(await check(`Bearer ${sign(good({ exp: NOW / 1000 - 301 }))}`)).toMatchObject({ ok: false, code: 'expired' })
    expect(await check(`Bearer ${sign(good({ exp: NOW / 1000 - 299 }))}`)).toEqual({ ok: true })
    expect(await check(`Bearer ${sign(good({ nbf: NOW / 1000 + 400 }))}`)).toMatchObject({ ok: false, code: 'not_yet_valid' })
  })

  it('refuses an unsigned token, a forged signature, an unknown key and no token at all', async () => {
    const unsigned = sign(good(), { alg: 'none', kid: 'k1' })
    expect(await check(`Bearer ${unsigned}`)).toMatchObject({ ok: false, code: 'bad_alg' })
    const [h, p] = sign(good()).split('.')
    expect(await check(`Bearer ${h}.${p}.`)).toMatchObject({ ok: false, code: 'no_bearer' })
    const forged = sign(good()).split('.')
    forged[1] = b64urlEncode(Buffer.from(JSON.stringify(good({ aud: APP_ID, serviceurl: 'https://smba.trafficmanager.net/amer/' }))))
    expect(await check(`Bearer ${forged.join('.')}`, { serviceUrl: 'https://smba.trafficmanager.net/amer/' })).toMatchObject({ ok: false, code: 'bad_signature' })
    const { privateKey: other } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const input = sign(good()).split('.').slice(0, 2).join('.')
    const wrongKey = `${input}.${b64urlEncode(nodeSign('sha256', Buffer.from(input), other))}`
    expect(await check(`Bearer ${wrongKey}`)).toMatchObject({ ok: false, code: 'bad_signature' })
    expect(await check(`Bearer ${sign(good(), { alg: 'RS256', kid: 'nope' })}`)).toMatchObject({ ok: false, code: 'unknown_key' })
    expect(await check(null)).toMatchObject({ ok: false, status: 401, code: 'no_bearer' })
    expect(await check(`Basic ${sign(good())}`)).toMatchObject({ ok: false, code: 'no_bearer' })
  })

  it('refuses a serviceUrl claim that is not the activity\'s, another channel, and a key not endorsed for Teams', async () => {
    expect(await check(`Bearer ${sign(good())}`, { serviceUrl: 'https://smba.trafficmanager.net/amer/' })).toMatchObject({ ok: false, code: 'service_url_mismatch' })
    expect(await check(`Bearer ${sign(good({ serviceurl: undefined }))}`)).toMatchObject({ ok: false, code: 'service_url_mismatch' })
    expect(await check(`Bearer ${sign(good())}`, { channelId: 'webchat' })).toMatchObject({ ok: false, status: 403, code: 'not_teams' })
    expect(await check(`Bearer ${sign(good(), { alg: 'RS256', kid: 'k2' })}`)).toMatchObject({ ok: false, status: 403, code: 'not_endorsed' })
  })
})

const SECRET_TEXT = 'Sjefen min er helt umulig og jeg vurderer å slutte'
const activityOf = (over: Record<string, unknown>) => ({
  channelId: 'msteams',
  serviceUrl: SVC,
  conversation: { id: 'a:1personal', conversationType: 'personal', tenantId: TENANT },
  from: { id: '29:user', aadObjectId: OBJECT },
  recipient: { id: `28:${APP_ID}` },
  channelData: { tenant: { id: TENANT } },
  ...over,
})
const post = (body: unknown, auth: string | null = `Bearer ${sign(good())}`) =>
  new Request('https://x.supabase.co/functions/v1/orgpuls-teams-bot', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  })

function bot() {
  const lines: string[] = []
  const rpc = vi.fn(async () => ({ error: null, data: { ok: true, matched: true } }))
  return { lines, rpc, deps: { appId: APP_ID, keys, now: () => NOW, rpc, log: (l: string) => lines.push(l) } }
}

describe('the bot endpoint', () => {
  it('drops a message unread: 200, nothing stored, nothing of it logged', async () => {
    const b = bot()
    const log = vi.spyOn(console, 'log')
    const err = vi.spyOn(console, 'error')
    const res = await handleBotCall(post(activityOf({ type: 'message', text: SECRET_TEXT })), b.deps)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
    expect(b.rpc).not.toHaveBeenCalled()
    const said = [...b.lines, ...log.mock.calls.flat(), ...err.mock.calls.flat()].map(String).join('\n')
    expect(said).not.toContain('umulig')
    log.mockRestore()
    err.mockRestore()
  })

  it('reads an activity field by field and never returns its text', () => {
    const e = readActivity(activityOf({ type: 'message', text: SECRET_TEXT }))
    expect(e).toEqual({ kind: 'ignored', reason: 'message' })
    expect(JSON.stringify(readActivity(activityOf({ type: 'installationUpdate', action: 'add', text: SECRET_TEXT })))).not.toContain('umulig')
  })

  it('refuses a call without a valid token before acting on it', async () => {
    const b = bot()
    const res = await handleBotCall(post(activityOf({ type: 'installationUpdate', action: 'add' }), null), b.deps)
    expect(res.status).toBe(401)
    expect(b.rpc).not.toHaveBeenCalled()
    const forged = await handleBotCall(post(activityOf({ type: 'installationUpdate', action: 'add' }), `Bearer ${sign(good({ aud: 'someone-else' }))}`), b.deps)
    expect(forged.status).toBe(401)
    expect(b.rpc).not.toHaveBeenCalled()
    expect(b.lines.join('\n')).toBe('[teams-bot] refused: no_bearer\n[teams-bot] refused: bad_audience')
  })

  it('keeps the conversation when the app is installed for a person, and logs no identity', async () => {
    const b = bot()
    const res = await handleBotCall(post(activityOf({ type: 'installationUpdate', action: 'add' })), b.deps)
    expect(res.status).toBe(200)
    expect(b.rpc).toHaveBeenCalledWith('teams_conversation_set', { p_tenant: TENANT, p_object: OBJECT, p_conversation: 'a:1personal', p_service_url: SVC })
    expect(b.lines.join('\n')).toBe('[teams-bot] installed: matched')
    expect(b.lines.join('\n')).not.toMatch(new RegExp(`${TENANT}|${OBJECT}|a:1personal`))
  })

  it('also learns the conversation from the bot being added to a 1:1 chat, and forgets it on removal', async () => {
    const b = bot()
    await handleBotCall(post(activityOf({ type: 'conversationUpdate', membersAdded: [{ id: `28:${APP_ID}` }] })), b.deps)
    await handleBotCall(post(activityOf({ type: 'installationUpdate', action: 'remove' })), b.deps)
    await handleBotCall(post(activityOf({ type: 'conversationUpdate', membersRemoved: [{ id: `28:${APP_ID}` }] })), b.deps)
    expect(b.rpc.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(['teams_conversation_set', 'teams_conversation_clear', 'teams_conversation_clear'])
  })

  it('ignores a team or group chat, another channel, and a conversation update that is not about the bot', async () => {
    const b = bot()
    await handleBotCall(post(activityOf({ type: 'installationUpdate', action: 'add', conversation: { id: '19:x', conversationType: 'channel', tenantId: TENANT } })), b.deps)
    await handleBotCall(post(activityOf({ type: 'conversationUpdate', membersAdded: [{ id: '29:someone' }] })), b.deps)
    expect(b.rpc).not.toHaveBeenCalled()
    expect(readActivity({ ...activityOf({ type: 'installationUpdate', action: 'add' }), channelId: 'webchat' })).toEqual({ kind: 'ignored', reason: 'channel' })
  })

  it('refuses a body past the limit and answers only POST', async () => {
    const b = bot()
    const big = new Request('https://x/functions/v1/orgpuls-teams-bot', { method: 'POST', body: 'x'.repeat(300 * 1024) })
    expect((await handleBotCall(big, b.deps)).status).toBe(413)
    expect((await handleBotCall(new Request('https://x/', { method: 'GET' }), b.deps)).status).toBe(405)
  })
})
