import { describe, expect, it, vi } from 'vitest'
import { SKEW_DELAYS_MS, withIssuedAtRetry } from '@/lib/supabase/skew'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const future = () => json(401, { code: 'PGRST303', message: 'JWT issued at future' })
const ok = () => json(200, [{ id: 'a' }])
const noSleep = () => Promise.resolve()

function scripted(...responses: Array<() => Response>) {
  const calls: Array<RequestInit | undefined> = []
  const inner = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init)
    const next = responses.shift()
    if (!next) throw new Error('no more scripted responses')
    return next()
  })
  return { inner: inner as unknown as typeof fetch, calls, spy: inner }
}

describe('withIssuedAtRetry', () => {
  it('passes a success straight through, once', async () => {
    const s = scripted(ok)
    const res = await withIssuedAtRetry(s.inner, noSleep)('http://x/rest/v1/a')
    expect(res.status).toBe(200)
    expect(s.spy).toHaveBeenCalledTimes(1)
  })

  it('retries PGRST303 and returns the success that follows', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = scripted(future, ok)
    const res = await withIssuedAtRetry(s.inner, noSleep)('http://x/rest/v1/rpc/viewer_role', {
      method: 'POST',
      body: '{}',
    })
    expect(res.status).toBe(200)
    expect(s.spy).toHaveBeenCalledTimes(2)
    expect(s.calls[1]?.body).toBe('{}')
  })

  it('gives up after the last delay and returns the refusal for the caller to report', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = scripted(future, future, future, future)
    const res = await withIssuedAtRetry(s.inner, noSleep)('http://x/rest/v1/a')
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'PGRST303' })
    expect(s.spy).toHaveBeenCalledTimes(SKEW_DELAYS_MS.length + 1)
  })

  it('does not retry any other 401 — an expired or forged token is a real refusal', async () => {
    const s = scripted(() => json(401, { code: 'PGRST301', message: 'JWT expired' }))
    const res = await withIssuedAtRetry(s.inner, noSleep)('http://x/rest/v1/a')
    expect(res.status).toBe(401)
    expect(s.spy).toHaveBeenCalledTimes(1)
  })

  it('does not retry a PGRST303 code on another status', async () => {
    const s = scripted(() => json(400, { code: 'PGRST303' }))
    await withIssuedAtRetry(s.inner, noSleep)('http://x/rest/v1/a')
    expect(s.spy).toHaveBeenCalledTimes(1)
  })

  it('does not retry a 401 whose body is not JSON', async () => {
    const s = scripted(() => new Response('nope', { status: 401 }))
    await withIssuedAtRetry(s.inner, noSleep)('http://x/rest/v1/a')
    expect(s.spy).toHaveBeenCalledTimes(1)
  })

  it('does not retry a request whose body cannot be sent twice', async () => {
    const s = scripted(future)
    const stream = new ReadableStream()
    await withIssuedAtRetry(s.inner, noSleep)('http://x/rest/v1/a', { method: 'POST', body: stream })
    expect(s.spy).toHaveBeenCalledTimes(1)
  })

  it('leaves the returned body readable for the caller', async () => {
    const s = scripted(ok)
    const res = await withIssuedAtRetry(s.inner, noSleep)('http://x/rest/v1/a')
    expect(await res.json()).toEqual([{ id: 'a' }])
  })

  it('waits the stated delays between attempts', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const waits: number[] = []
    const s = scripted(future, future, ok)
    await withIssuedAtRetry(s.inner, async (ms) => {
      waits.push(ms)
    })('http://x/rest/v1/a')
    expect(waits).toHaveLength(2)
    expect(waits[0]).toBeGreaterThanOrEqual(SKEW_DELAYS_MS[0])
    expect(waits[1]).toBeGreaterThanOrEqual(SKEW_DELAYS_MS[1])
  })
})
