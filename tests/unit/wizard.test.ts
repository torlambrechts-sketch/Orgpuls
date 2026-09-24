import { describe, expect, it } from 'vitest'
import { offeredDays } from '@/lib/wizard/days'
import { wheelMonths } from '@/lib/wheel/months'

describe("offeredDays — the first send-out's Tuesdays (D-76)", () => {
  it('starts a week out: from Thursday 24 September, 6, 13 and 20 October', () => {
    expect(offeredDays('2026-09-24')).toEqual(['2026-10-06', '2026-10-13', '2026-10-20'])
  })
  it('a Tuesday itself is not offered a week later than it must be', () => {
    expect(offeredDays('2026-09-22')[0]).toBe('2026-09-29')
  })
  it('every day offered is a Tuesday, across a month and a year end', () => {
    for (const d of offeredDays('2026-12-27', 3)) expect(new Date(`${d}T12:00:00Z`).getUTCDay()).toBe(2)
    expect(offeredDays('2026-12-27')).toEqual(['2027-01-05', '2027-01-12', '2027-01-19'])
  })
})

describe('wheelMonths — mirrors app.wheel_months (0041)', () => {
  it('Hvert halvår: one puls six months after the baseline', () => {
    expect(wheelMonths('halvarspuls', 9, true)).toEqual([
      { month: 9, kind: 'grunnlinje' },
      { month: 3, kind: 'puls' },
    ])
  })
  it('and July stays empty when the pause is on', () => {
    expect(wheelMonths('halvarspuls', 1, true)).toEqual([{ month: 1, kind: 'grunnlinje' }])
    expect(wheelMonths('halvarspuls', 1, false)).toEqual([
      { month: 1, kind: 'grunnlinje' },
      { month: 7, kind: 'puls' },
    ])
  })
  it('a quarterly wheel from September pulses in December, March and June', () => {
    expect(wheelMonths('kvartalspuls', 9, true).map((m) => m.month)).toEqual([9, 12, 3, 6])
  })
})
