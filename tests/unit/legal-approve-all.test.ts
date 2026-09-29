import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * «Mark reviewed» on one legal document (X-096, 0122): the document as the registry has it now,
 * stored with its text under the hash shown — and nothing when the text changed since the page was
 * opened, or the document is broken or gone. (This file once tested the line-by-line «Approve all».)
 */
const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({ data: { ok: true }, error: null }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: () => {} }))
vi.mock('@/lib/legal/inputs', () => ({ legalInputs: async () => ({}) }))
const unit = (key: string, text: string, missing?: string[]) => ({ key, lines: [{ path: 'x', text }], hash: 'h', title: { key: 't' }, section: key.startsWith('industry') ? 'industries' : 'documents', lang: 'no', where: { key: 'w' }, live: true, source: 's', ...(missing ? { missing } : {}) })
vi.mock('@/lib/legal/registry', () => ({
  canonical: (lines: { path: string; text: string }[]) => lines.map((l) => `${l.path}\n${l.text}`).join('\n\n'),
  legalUnits: () => [unit('industry:bygg:no:law:a', 'A'), unit('industry:bygg:no:claims', 'B'), unit('msg:no:broken', 'C', ['y'])],
}))

const { legalReview } = await import('@/lib/admin/actions')
const { legalDocuments } = await import('@/lib/legal/documents')
const docs = legalDocuments(((await import('@/lib/legal/registry')).legalUnits as unknown as () => never)())
const post = (key: string, hash: string) => {
  const fd = new FormData()
  fd.set('key', key)
  fd.set('hash', hash)
  return legalReview(null, fd)
}

describe('mark a legal document reviewed', () => {
  beforeEach(() => rpc.mockClear())

  it('groups an industry page into one document, and stores its text under its hash', async () => {
    const d = docs.find((x) => x.key === 'industry:bygg:no')!
    expect(d.units).toHaveLength(2)
    expect(await post(d.key, d.hash)).toEqual({ ok: true })
    expect(rpc.mock.calls[0]).toEqual(['admin_legal_review', { p_key: 'industry:bygg:no', p_hash: d.hash, p_text: d.text }])
  })

  it('refuses a text changed since the page was opened, a broken document and one that is gone', async () => {
    expect(await post('industry:bygg:no', 'a'.repeat(64))).toEqual({ ok: false, problem: 'stale' })
    const broken = docs.find((x) => x.key === 'msg:no:broken')!
    expect(await post(broken.key, broken.hash)).toEqual({ ok: false, problem: 'not_found' })
    expect(await post('msg:no:gone', 'a'.repeat(64))).toEqual({ ok: false, problem: 'not_found' })
    expect(await post('x', 'nothex')).toEqual({ ok: false, problem: 'invalid' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
