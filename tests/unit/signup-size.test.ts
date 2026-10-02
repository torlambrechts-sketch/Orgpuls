import { describe, expect, it } from 'vitest'
import { bandOf, countFor } from '@/lib/start/size'

describe('the sign-up size bands', () => {
  it('meet where the plans do: 25 is Liten, 26 is not', () => {
    expect(bandOf(1)).toBe('under25')
    expect(bandOf(25)).toBe('under25')
    expect(bandOf(26)).toBe('to50')
    expect(bandOf(100)).toBe('to100')
    expect(bandOf(101)).toBe('over100')
  })

  it('keep the register headcount when it falls in the band chosen, and the band figure when not', () => {
    expect(countFor('under25', 25)).toBe(25)
    expect(countFor('to50', 25)).toBe(38)
    expect(countFor('to50', 44)).toBe(44)
    expect(countFor('under25', null)).toBe(20)
    expect(countFor('over100', 340)).toBe(340)
  })

  it('never give a company of 25 or fewer a count Liten refuses (0048: more than 25 is too many)', () => {
    for (let n = 1; n <= 25; n++) expect(countFor(bandOf(n), n)).toBeLessThanOrEqual(25)
    expect(countFor('under25', null)).toBeLessThanOrEqual(25)
  })
})
