import { beforeAll, describe, expect, it } from 'vitest'
import { handleRequest, runOrg, type HandlerDeps, type RunDeps } from '@/supabase/functions/_shared/entra'
import { normalizePhone } from '@/supabase/functions/_shared/sms'

/**
 * orgpuls-entra-sync with Microsoft's token endpoint and Graph mocked (D-202): the run end to end —
 * begin, token by certificate assertion, full and delta reads, paging, 410, throttling, nested
 * groups, apply — and the request handling. Every log line is checked for what must never be in
 * one: a name, an address, a number, a token or a Graph payload.
 */

const TENANT = '5555555f-0000-4000-8000-000000000001'
const ORG = '3333333c-0000-4000-8000-000000000001'
const RUN = '4444444d-0000-4000-8000-000000000001'
const G1 = '0000000a-0000-4000-8000-000000000001'
const DRIFT = '1111111a-0000-4000-8000-000000000001'
const oid = (n: number) => `0000000b-0000-4000-8000-${String(n).padStart(12, '0')}`
const GRAPH = 'https://graph.microsoft.com/v1.0'
const SECRETS = ['Kari Nordmann', 'kari@firma.no', 'Ola Hansen', 'ola@firma.no', '+4791234567', '912 34 567', 'TOKEN-abc', 'PRIVATE KEY']

let pem = ''
let publicKey: CryptoKey
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  publicKey = pair.publicKey
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  let bin = ''
  for (const b of der) bin += String.fromCharCode(b)
  pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`
})

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const kari = { id: oid(1), displayName: 'Kari Nordmann', mail: 'kari@firma.no', userPrincipalName: 'kari@firma.no', accountEnabled: true, userType: 'Member', mobilePhone: '912 34 567' }
const ola = { id: oid(2), displayName: 'Ola Hansen', mail: 'ola@firma.no', userPrincipalName: 'ola@firma.no', accountEnabled: true, userType: 'Member', preferredLanguage: 'nb-NO' }

interface Harness {
  deps: RunDeps
  calls: { url: string; headers: Record<string, string>; body?: string }[]
  rpcs: { fn: string; args: Record<string, unknown> }[]
  logs: string[]
  sleeps: number[]
}

function harness(opts: {
  begin?: Record<string, unknown>
  graph: (url: string, n: number) => Response | undefined
  credentials?: boolean
  token?: () => Response
}): Harness {
  const calls: Harness['calls'] = []
  const rpcs: Harness['rpcs'] = []
  const logs: string[] = []
  const sleeps: number[] = []
  const seen = new Map<string, number>()
  const deps: RunDeps = {
    fetch: async (url, init) => {
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]))
      calls.push({ url, headers, body: typeof init?.body === 'string' ? init.body : undefined })
      if (url === `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`) return opts.token?.() ?? json({ access_token: 'TOKEN-abc', expires_in: 3599 })
      const n = (seen.get(url) ?? 0) + 1
      seen.set(url, n)
      const r = opts.graph(url, n)
      if (!r) throw new Error(`unexpected request ${url}`)
      return r
    },
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    left: () => 100_000,
    rpc: async (fn, args) => {
      rpcs.push({ fn, args })
      if (fn === 'entra_sync_begin')
        return {
          data: {
            ok: true,
            org_id: ORG,
            run_id: RUN,
            tenant_id: TENANT,
            include_phone: true,
            round_open: false,
            full: true,
            users_link: null,
            group_links: [],
            mappings: [{ entra_group_id: G1, group_id: DRIFT, priority: 0, nested: false, entra_name: 'Drift' }],
            members: [],
            employees: [],
            deferred: [],
            ...opts.begin,
          },
          error: null,
        }
      if (fn === 'entra_sync_apply') return { data: { ok: true, counts: { added: 2, deactivated: 0 } }, error: null }
      return { data: { ok: true }, error: null }
    },
    credentials: opts.credentials === false ? null : { clientId: '6666666a-0000-4000-8000-000000000001', privateKeyPem: pem, thumbprint: 'AB'.repeat(20) },
    phoneOf: normalizePhone,
    now: () => Date.parse('2026-10-02T03:40:00Z'),
    uuid: () => '7777777b-0000-4000-8000-000000000001',
    log: (line) => logs.push(JSON.stringify(line)),
  }
  return { deps, calls, rpcs, logs, sleeps }
}

/** a full read: latest links, the group, its users over two pages, the nested check */
function fullGraph(url: string): Response | undefined {
  if (url.startsWith(`${GRAPH}/users/delta?`) && url.endsWith('$deltatoken=latest'))
    return json({ value: [], '@odata.deltaLink': `${GRAPH}/users/delta?$deltatoken=U1` })
  if (url.startsWith(`${GRAPH}/groups/delta?`) && url.endsWith('$deltatoken=latest'))
    return json({ value: [], '@odata.deltaLink': `${GRAPH}/groups/delta?$deltatoken=G1` })
  if (url === `${GRAPH}/groups/${G1}?$select=id,displayName`) return json({ id: G1, displayName: 'Drift' })
  if (url === `${GRAPH}/groups/${G1}/transitiveMembers/microsoft.graph.user?$skiptoken=p2`) return json({ value: [ola] })
  if (url.startsWith(`${GRAPH}/groups/${G1}/transitiveMembers/microsoft.graph.user?$select=`))
    return json({ value: [kari], '@odata.nextLink': `${GRAPH}/groups/${G1}/transitiveMembers/microsoft.graph.user?$skiptoken=p2` })
  if (url === `${GRAPH}/groups/${G1}/members/microsoft.graph.group/$count`) return json('0')
  return undefined
}

const noSecrets = (logs: string[]) => {
  for (const l of logs) for (const s of SECRETS) expect(l).not.toContain(s)
  for (const l of logs) expect(l).not.toMatch(/@|graph\.microsoft|deltatoken|Bearer/i)
}

const planOf = (h: Harness) => (h.rpcs.find((r) => r.fn === 'entra_sync_apply')!.args.p_plan as Record<string, unknown>)

describe('a run', () => {
  it('reads everything on the first run, following every page, and applies one plan', async () => {
    const h = harness({ graph: fullGraph })
    const r = await runOrg(ORG, h.deps)
    expect(r).toEqual({ org: ORG, ok: true, error: null, mode: 'full', counts: { added: 2, deactivated: 0 } })
    const p = planOf(h)
    expect((p.people as { objectId: string; phone?: string; language?: string }[]).map((w) => [w.objectId, w.phone, w.language])).toEqual([
      [oid(1), '+4791234567', undefined],
      [oid(2), undefined, 'no'],
    ])
    expect(p.links).toEqual({ users: `${GRAPH}/users/delta?$deltatoken=U1`, groups: [`${GRAPH}/groups/delta?$deltatoken=G1`], full: true })
    expect(p.groups).toEqual([{ id: G1, nested: false }])
    // the links are taken before the listing, so a change made meanwhile is replayed next run
    const order = h.calls.map((c) => c.url)
    expect(order.findIndex((u) => u.includes('users/delta'))).toBeLessThan(order.findIndex((u) => u.includes('transitiveMembers')))
    // the advanced query header where the cast and $select need it; the token on every Graph call
    expect(h.calls.find((c) => c.url.includes('transitiveMembers'))!.headers.consistencylevel).toBe('eventual')
    for (const c of h.calls.filter((c) => c.url.startsWith(GRAPH))) expect(c.headers.authorization).toBe('Bearer TOKEN-abc')
    noSecrets(h.logs)
  })

  it("signs the client assertion with the certificate: RS256, x5t, for this tenant's token endpoint", async () => {
    const h = harness({ graph: fullGraph })
    await runOrg(ORG, h.deps)
    const form = new URLSearchParams(h.calls[0]!.body)
    expect(form.get('grant_type')).toBe('client_credentials')
    expect(form.get('scope')).toBe('https://graph.microsoft.com/.default')
    expect(form.get('client_assertion_type')).toBe('urn:ietf:params:oauth:client-assertion-type:jwt-bearer')
    expect(form.get('client_secret')).toBeNull()
    const [head, body, sig] = form.get('client_assertion')!.split('.')
    const dec = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    expect(dec(head!)).toEqual({ alg: 'RS256', typ: 'JWT', x5t: Buffer.from('AB'.repeat(20), 'hex').toString('base64url') })
    expect(dec(body!)).toMatchObject({
      aud: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
      iss: '6666666a-0000-4000-8000-000000000001',
      sub: '6666666a-0000-4000-8000-000000000001',
      exp: dec(body!).nbf + 300,
    })
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, Buffer.from(sig!, 'base64url'), new TextEncoder().encode(`${head}.${body}`))
    expect(ok).toBe(true)
  })

  it('a delta run that meets 410 Gone starts over with a full read', async () => {
    const h = harness({
      begin: { full: false, users_link: `${GRAPH}/users/delta?$deltatoken=OLD`, group_links: [`${GRAPH}/groups/delta?$deltatoken=OLDG`] },
      graph: (url) => (url === `${GRAPH}/users/delta?$deltatoken=OLD` ? json({ error: { code: 'syncStateNotFound' } }, 410) : fullGraph(url)),
    })
    const r = await runOrg(ORG, h.deps)
    expect(r.mode).toBe('full')
    expect(planOf(h).links).toMatchObject({ users: `${GRAPH}/users/delta?$deltatoken=U1`, full: true })
    noSecrets(h.logs)
  })

  it('a delta run follows nextLink to the deltaLink, and reads a person who joined', async () => {
    const h = harness({
      begin: {
        full: false,
        users_link: `${GRAPH}/users/delta?$deltatoken=D1`,
        group_links: [`${GRAPH}/groups/delta?$deltatoken=DG`],
        members: [[G1, oid(1)]],
        employees: [{ id: '2222222e-0000-4000-8000-000000000001', object_id: oid(1), email: 'kari@firma.no', full_name: 'Kari Nordmann', group_id: DRIFT, active: true, pinned: false }],
      },
      graph: (url) => {
        if (url === `${GRAPH}/users/delta?$deltatoken=D1`)
          return json({ value: [{ id: oid(9), displayName: 'Utenfor Gruppene', mail: 'x@firma.no' }], '@odata.nextLink': `${GRAPH}/users/delta?$skiptoken=s2` })
        if (url === `${GRAPH}/users/delta?$skiptoken=s2`)
          return json({ value: [{ id: oid(1), '@removed': { reason: 'changed' } }], '@odata.deltaLink': `${GRAPH}/users/delta?$deltatoken=D2` })
        if (url === `${GRAPH}/groups/delta?$deltatoken=DG`)
          return json({ value: [{ id: G1, displayName: 'Drift', 'members@delta': [{ '@odata.type': '#microsoft.graph.user', id: oid(2) }] }], '@odata.deltaLink': `${GRAPH}/groups/delta?$deltatoken=DG2` })
        if (url.startsWith(`${GRAPH}/users/${oid(2)}?$select=`)) return json(ola)
        return undefined
      },
    })
    const r = await runOrg(ORG, h.deps)
    expect(r.mode).toBe('delta')
    const p = planOf(h) as { people: { objectId: string; op: string }[]; deactivate: unknown[]; links: unknown }
    expect(p.people).toEqual([expect.objectContaining({ objectId: oid(2), op: 'add' })])
    expect(p.deactivate).toEqual([{ objectId: oid(1), reason: 'removed' }])
    expect(p.links).toEqual({ users: `${GRAPH}/users/delta?$deltatoken=D2`, groups: [`${GRAPH}/groups/delta?$deltatoken=DG2`], full: false })
    // someone outside the selected groups is neither imported nor counted
    expect(JSON.stringify(p)).not.toContain(oid(9))
    noSecrets(h.logs)
  })

  it('a group that gets a group as member is read whole, transitively, from then on', async () => {
    const h = harness({
      begin: { full: false, users_link: `${GRAPH}/users/delta?$deltatoken=D1`, group_links: [`${GRAPH}/groups/delta?$deltatoken=DG`] },
      graph: (url) => {
        if (url === `${GRAPH}/users/delta?$deltatoken=D1`) return json({ value: [], '@odata.deltaLink': `${GRAPH}/users/delta?$deltatoken=D2` })
        if (url === `${GRAPH}/groups/delta?$deltatoken=DG`)
          return json({
            value: [{ id: G1, 'members@delta': [{ '@odata.type': '#microsoft.graph.group', id: '0000000a-0000-4000-8000-000000000099' }] }],
            '@odata.deltaLink': `${GRAPH}/groups/delta?$deltatoken=DG2`,
          })
        if (url === `${GRAPH}/groups/${G1}/members/microsoft.graph.group/$count`) return json('1')
        return fullGraph(url)
      },
    })
    await runOrg(ORG, h.deps)
    const p = planOf(h) as { groups: unknown[]; members: { replace: Record<string, string[]> } }
    expect(p.members.replace).toEqual({ [G1]: [oid(1), oid(2)] })
    expect(p.groups).toEqual([{ id: G1, nested: true }])
  })

  it('waits as Graph asks on 429, then goes on', async () => {
    const h = harness({
      graph: (url, n) => (url.includes('transitiveMembers') && !url.includes('skiptoken') && n === 1 ? json({}, 429, { 'retry-after': '2' }) : fullGraph(url)),
    })
    const r = await runOrg(ORG, h.deps)
    expect(r.ok).toBe(true)
    expect(h.sleeps).toEqual([2000])
  })

  it('without the app credentials the run ends as not_configured, and Graph is never called', async () => {
    const h = harness({ graph: fullGraph, credentials: false })
    const r = await runOrg(ORG, h.deps)
    expect(r).toMatchObject({ ok: false, error: 'not_configured' })
    expect(h.calls).toEqual([])
    expect(h.rpcs.map((x) => x.fn)).toEqual(['entra_sync_begin', 'entra_sync_fail'])
    expect(h.rpcs[1]!.args).toEqual({ p_org: ORG, p_run: RUN, p_error: 'not_configured' })
  })

  it('a tenant that has not consented ends as consent_missing; a missing permission as permission_missing', async () => {
    const h = harness({ graph: fullGraph, token: () => json({ error: 'unauthorized_client', error_codes: [700016], error_description: 'Kari Nordmann tenant' }, 400) })
    expect((await runOrg(ORG, h.deps)).error).toBe('consent_missing')
    noSecrets(h.logs)
    const h2 = harness({ graph: (url) => (url.includes('transitiveMembers') ? json({ error: { code: 'Authorization_RequestDenied' } }, 403) : fullGraph(url)) })
    expect((await runOrg(ORG, h2.deps)).error).toBe('permission_missing')
  })
})

describe('the request handling', () => {
  const handler = (h: Harness, over: Partial<HandlerDeps> = {}): HandlerDeps => ({
    ...h.deps,
    secret: 's3cret',
    budgetMs: 110_000,
    userRpc: async () => ({ data: { ok: true, tenant_id: TENANT }, error: null }),
    rpc: async (fn, args) => (fn === 'entra_sync_due' ? { data: { ok: true, orgs: [ORG] }, error: null } : h.deps.rpc(fn, args)),
    ...over,
  })

  it("refuses a run without the dispatcher's secret", async () => {
    const h = harness({ graph: fullGraph })
    const res = await handleRequest(new Request('https://fn.example/', { method: 'POST', headers: { 'x-dispatch-secret': 'wrong' } }), handler(h))
    expect(res.status).toBe(403)
    expect(h.calls).toEqual([])
  })

  it('runs the due organisations with the secret', async () => {
    const h = harness({ graph: fullGraph })
    const res = await handleRequest(
      new Request('https://fn.example/', { method: 'POST', headers: { 'x-dispatch-secret': 's3cret' }, body: JSON.stringify({ org_id: ORG }) }),
      handler(h),
    )
    expect(await res.json()).toEqual({ ok: true, due: 1, ran: 1, results: [{ org: ORG, ok: true, error: null, mode: 'full' }] })
    noSecrets(h.logs)
  })

  it('the group picker answers a daglig leder with ids and names only, and refuses anyone else', async () => {
    const h = harness({
      graph: (url) =>
        url.startsWith(`${GRAPH}/groups?$select=id,displayName&$top=999`)
          ? json({ value: [{ id: G1, displayName: 'Drift', mail: 'drift@firma.no', description: 'hemmelig' }, { id: 'not-a-guid', displayName: 'x' }] })
          : undefined,
    })
    const req = () => new Request(`https://fn.example/?op=groups&org=${ORG}&q=dr`, { method: 'POST', headers: { authorization: 'Bearer user-jwt' } })
    const ok = await handleRequest(req(), handler(h))
    expect(await ok.json()).toEqual({ ok: true, groups: [{ id: G1, name: 'Drift' }], more: false })
    expect(h.calls.at(-1)!.headers.consistencylevel).toBe('eventual')
    expect(decodeURIComponent(h.calls.at(-1)!.url)).toContain('$search="displayName:dr"')
    const no = await handleRequest(req(), handler(h, { userRpc: async () => ({ data: { ok: false, error: 'not_allowed' }, error: null }) }))
    expect(no.status).toBe(403)
    const anon = await handleRequest(new Request(`https://fn.example/?op=groups&org=${ORG}`, { method: 'POST' }), handler(h))
    expect(anon.status).toBe(403)
    noSecrets(h.logs)
  })
})
