import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contract: no response payload carries a language (I6; multilingual-gap-analysis, contract
 * test). The respondent's language lives in the survey's address and nowhere else, so a
 * submission that arrives with `lang` or `locale` — forged, or added by a future client — must
 * reach rpc.submit_response without it, at every level: the top, each answer, each extra
 * answer and the module's answers.
 *
 * The Payload schema is private to app/s/[token]/actions.ts, so this drives the server action
 * itself with the Supabase client replaced, and inspects exactly what it hands the RPC.
 */
const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const { submitResponse } = await import('@/app/s/[token]/actions')

const ITEM = '3f1c1d9e-8a8b-4c33-9a57-2b1f8d7f0a11'
const forged = {
  token: 'qa-lumio-flow-mobile-en',
  lang: 'en',
  locale: 'pl',
  language: 'lt',
  answers: [{ factor: 'ytring', ordinal: 1, value: 4, comment: 'hei', lang: 'en', locale: 'en' }],
  extra: [{ key: 'helhet', option: 2, locale: 'en' }],
  module: {
    lang: 'en',
    answers: [{ item: ITEM, value: 3, locale: 'en' }],
    count: [{ item: ITEM, answer: 'ja', lang: 'en' }],
    segments: [{ item: ITEM, option: 1, locale: 'en' }],
  },
}

function keysOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(keysOf)
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)])
  return []
}

describe('the respondent submit payload carries no language', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: { ok: true, answers: 1, threads: [] }, error: null })
  })

  it('strips lang, locale and language at every level before the RPC', async () => {
    const result = await submitResponse(forged)
    expect(result).toEqual({ ok: true, answers: 1, threads: [] })
    expect(rpc).toHaveBeenCalledTimes(1)
    const [fn, args] = rpc.mock.calls[0]!
    expect(fn).toBe('submit_response')
    expect(Object.keys(args).sort()).toEqual(['p_answers', 'p_extra', 'p_module', 'p_token'])
    expect(keysOf(args).filter((k) => /^(lang|locale|language)$/i.test(k))).toEqual([])
    // and nothing else was lost: the answers themselves go through
    expect(args.p_answers).toEqual([{ factor: 'ytring', ordinal: 1, value: 4, comment: 'hei' }])
    expect(args.p_extra).toEqual([{ key: 'helhet', option: 2 }])
    expect(args.p_module).toEqual({
      answers: [{ item: ITEM, value: 3 }],
      count: [{ item: ITEM, answer: 'ja' }],
      segments: [{ item: ITEM, option: 1 }],
    })
  })

  it('never names a language in the RPC arguments, even with no module', async () => {
    const { module: _module, ...withoutModule } = forged
    void _module
    await submitResponse(withoutModule)
    const [, args] = rpc.mock.calls[0]!
    expect(Object.keys(args).sort()).toEqual(['p_answers', 'p_extra', 'p_token'])
    expect(JSON.stringify(args)).not.toMatch(/"(lang|locale|language)"/i)
  })
})
