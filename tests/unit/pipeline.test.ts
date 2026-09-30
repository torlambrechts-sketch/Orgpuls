import { describe, expect, it } from 'vitest'
import { shownSum, totals, unvalued, winRate, winRateText } from '@/lib/admin/pipeline'

describe('pipeline sums (0137)', () => {
  it('counts a deal without a value and adds nothing for it', () => {
    const t = totals([{ value_nok: 120_000 }, { value_nok: null }, { value_nok: 30_000 }])
    expect(t).toEqual({ count: 3, valued: 2, value: 150_000 })
    expect(unvalued(t)).toBe(1)
    expect(shownSum(t)).toBe(150_000)
  })

  it('an empty column sums to 0 kr; a column of unvalued deals has no sum', () => {
    expect(shownSum(totals([]))).toBe(0)
    expect(shownSum(totals([{ value_nok: null }, { value_nok: null }]))).toBeNull()
  })

  it('a value of 0 is a value', () => {
    const t = totals([{ value_nok: 0 }])
    expect(t.valued).toBe(1)
    expect(shownSum(t)).toBe(0)
  })
})

describe('win rate (0137)', () => {
  it('is won over won and lost', () => {
    expect(winRate(3, 1)).toBe(75)
    expect(winRate(1, 2)).toBe(33)
    expect(winRate(0, 4)).toBe(0)
    expect(winRate(2, 0)).toBe(100)
  })

  it('with zero closed deals there is no rate, and nothing is rendered', () => {
    expect(winRate(0, 0)).toBeNull()
    const phrase = ({ rate, won, closed }: { rate: number; won: number; closed: number }) => `${rate} % (${won} of ${closed})`
    expect(winRateText({ won: 0, lost: 0 }, phrase)).toBeNull()
    expect(winRateText({ won: 1, lost: 3 }, phrase)).toBe('25 % (1 of 4)')
  })

  it('refuses counts that cannot be counts', () => {
    expect(winRate(-1, 2)).toBeNull()
    expect(winRate(Number.NaN, 1)).toBeNull()
  })
})
