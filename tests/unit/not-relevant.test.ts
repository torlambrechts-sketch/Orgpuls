import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NOT_RELEVANT_FLAG, notRelevantShare, rateAgainst, type ResultaterModel, type RoundRef } from '@/lib/results/resultater'

/**
 * «Ikke relevant for meg» (0087, D-134) and the response rate against earlier rounds (D-135).
 *
 *   - the payload: `na` in place of a value reaches the RPC, core and module; beside a value it
 *     never does
 *   - the share and the flag: at or above 30 % of those given the statement
 *   - the round a rate is measured against: the grunnlinje compared with or the one before; for
 *     a puls, the puls before it; none when either rate is unknown
 */
const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
const { submitResponse } = await import('@/app/s/[token]/actions')

const ITEM = '3f1c1d9e-8a8b-4c33-9a57-2b1f8d7f0a11'

describe('the payload carries «ikke relevant» in place of a value', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: { ok: true, answers: 0, threads: [] }, error: null })
  })

  it('passes na on a core and a module statement to the RPC', async () => {
    const r = await submitResponse({
      token: 'qa-lumio-flow-mobile-no',
      answers: [{ factor: 'kontakt', ordinal: 2, na: true }],
      extra: [],
      module: { answers: [{ item: ITEM, na: true }], count: [], segments: [] },
    })
    expect(r).toEqual({ ok: true, answers: 0, threads: [] })
    const [, args] = rpc.mock.calls[0]!
    expect(args.p_answers).toEqual([{ factor: 'kontakt', ordinal: 2, na: true }])
    expect(args.p_module.answers).toEqual([{ item: ITEM, na: true }])
  })

  it('refuses na beside a value on a core statement, before any RPC', async () => {
    const r = await submitResponse({
      token: 'qa-lumio-flow-mobile-no',
      answers: [{ factor: 'kontakt', ordinal: 2, value: 3, na: true }],
      extra: [],
    })
    expect(r).toEqual({ ok: false, error: 'invalid_payload' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never sends na: false or anything but true', async () => {
    const r = await submitResponse({
      token: 'qa-lumio-flow-mobile-no',
      answers: [{ factor: 'kontakt', ordinal: 2, na: false }],
      extra: [],
    })
    expect(r).toEqual({ ok: false, error: 'invalid_payload' })
  })
})

describe('the not-relevant share', () => {
  it('is the marks over those given an answer or a mark', () => {
    expect(notRelevantShare({ n: 14, na: 6 })).toBeCloseTo(0.3)
    expect(notRelevantShare({ n: 0, na: 0 })).toBe(0)
  })
  it('flags at 30 % and above', () => {
    expect(notRelevantShare({ n: 14, na: 6 }) >= NOT_RELEVANT_FLAG).toBe(true)
    expect(notRelevantShare({ n: 15, na: 5 }) >= NOT_RELEVANT_FLAG).toBe(false)
  })
})

describe('the round a response rate is measured against', () => {
  const ref = (id: string, kind: 'grunnlinje' | 'puls', closesAt: string): RoundRef => ({
    id,
    kind,
    label: id,
    title: id,
    month: id,
    year: Number(closesAt.slice(0, 4)),
    closesAt,
    planned: false,
    open: false,
  })
  const g25 = ref('g25', 'grunnlinje', '2025-09-20')
  const g26 = ref('g26', 'grunnlinje', '2026-09-20')
  const p1 = ref('p1', 'puls', '2026-03-10')
  const p2 = ref('p2', 'puls', '2026-05-10')
  const model = (round: RoundRef, extra: Partial<ResultaterModel> = {}) =>
    ({ round, compare: null, previous: null, rates: { g25: 77, g26: 82, p1: 79, p2: 70 }, ...extra }) as unknown as ResultaterModel

  it('a grunnlinje: the one before it, or the one compared with', () => {
    expect(rateAgainst(model(g26, { previous: g25 }), [p1, p2])?.id).toBe('g25')
    expect(rateAgainst(model(g26, { previous: g25, compare: g25 }), [])?.id).toBe('g25')
  })
  it('a puls: the puls before it, not the grunnlinje', () => {
    expect(rateAgainst(model(p2, { previous: g25 }), [p1, p2])?.id).toBe('p1')
    expect(rateAgainst(model(p1), [p1, p2])).toBeNull()
  })
  it('nothing when a rate is unknown', () => {
    expect(rateAgainst(model(g26, { previous: g25, rates: { g26: 82 } }), [])).toBeNull()
    expect(rateAgainst(model(g26), [])).toBeNull()
  })
})
