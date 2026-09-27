import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * «Approve all» on a section of the legal review (D-130): each text approved by the hash shown,
 * one audited call per text, and nothing at all when any text changed or went since the page loaded.
 */
const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({ data: { ok: true }, error: null }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: () => {} }))
vi.mock('@/lib/legal/inputs', () => ({ legalInputs: async () => ({}) }))
const H = (c: string) => c.repeat(64)
const units = [
  { key: 'page:a', hash: H('a'), lines: [{ path: 'x', text: 'A' }] },
  { key: 'page:b', hash: H('b'), lines: [{ path: 'x', text: 'B' }] },
  { key: 'page:broken', hash: H('c'), lines: [{ path: 'x', text: 'C' }], missing: ['y'] },
]
vi.mock('@/lib/legal/registry', () => ({ legalUnits: () => units }))

const { legalApproveAll } = await import('@/lib/admin/actions')
const post = (list: unknown) => {
  const fd = new FormData()
  fd.set('units', JSON.stringify(list))
  return legalApproveAll(null, fd)
}

describe('approve all in a section', () => {
  beforeEach(() => rpc.mockClear())

  it('approves each text shown, by its hash, one call each', async () => {
    expect(await post([{ key: 'page:a', hash: H('a') }, { key: 'page:b', hash: H('b') }])).toEqual({ ok: true, message: '2' })
    expect(rpc.mock.calls.map((c) => c[1])).toEqual([
      { p_key: 'page:a', p_hash: H('a'), p_approved: true },
      { p_key: 'page:b', p_hash: H('b'), p_approved: true },
    ])
  })

  it('approves nothing when one text changed since the page loaded', async () => {
    expect(await post([{ key: 'page:a', hash: H('a') }, { key: 'page:b', hash: H('d') }])).toEqual({ ok: false, problem: 'stale' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('approves nothing when one text is gone or broken, or the list is not one', async () => {
    expect(await post([{ key: 'page:a', hash: H('a') }, { key: 'page:gone', hash: H('a') }])).toEqual({ ok: false, problem: 'not_found' })
    expect(await post([{ key: 'page:broken', hash: H('c') }])).toEqual({ ok: false, problem: 'not_found' })
    expect(await post([])).toEqual({ ok: false, problem: 'invalid' })
    const fd = new FormData()
    fd.set('units', 'not json')
    expect(await legalApproveAll(null, fd)).toEqual({ ok: false, problem: 'invalid' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
