import { describe, expect, it } from 'vitest'
import { bars, bareTitle, change, clock, dec, int, monthsLabel, periodOf, rangeLabel, share } from '@/lib/admin/analytics'

describe('analytics arithmetic (X-095)', () => {
  it('reads the period, falling back to the design’s fourteen days', () => {
    expect(periodOf('30')).toBe(30)
    expect(periodOf('31')).toBe(14)
    expect(periodOf(undefined)).toBe(14)
  })

  it('writes the period as the design does', () => {
    expect(rangeLabel('2026-09-16', '2026-09-29')).toBe('16–29 Sep 2026')
    expect(rangeLabel('2026-08-31', '2026-09-29')).toBe('31 Aug – 29 Sep 2026')
    expect(rangeLabel('2025-09-30', '2026-09-29')).toBe('30 Sep 2025 – 29 Sep 2026')
    expect(monthsLabel('2026-09-16', '2026-09-29')).toBe('September')
    expect(monthsLabel('2026-08-31', '2026-09-29')).toBe('August–September')
  })

  it('compares with the period before only where there is one', () => {
    expect(change(106, 100)).toEqual({ dir: 'up', pct: 6 })
    expect(change(97, 100)).toEqual({ dir: 'down', pct: 3 })
    expect(change(100, 100)).toEqual({ dir: 'flat', pct: 0 })
    expect(change(5, 0)).toBeNull()
    expect(change(5, null)).toBeNull()
    expect(change(null, 4)).toBeNull()
  })

  it('writes numbers in the design’s grouping', () => {
    expect(int(10710).replace(/\s/g, ' ')).toBe('10 710')
    expect(dec(1.3102, 2)).toBe('1,31')
    expect(clock(134)).toBe('2:14')
    expect(clock(3734)).toBe('1:02:14')
    expect(share(1, 3)).toBe(33)
    expect(share(1, 0)).toBe(0)
  })

  it('draws every day of a short period, weekends marked, missing days at 0', () => {
    const r = bars('2026-09-16', '2026-09-29', [{ day: '2026-09-16', visitors: 754 }, { day: '2026-09-19', visitors: 920 }])
    expect(r.per).toBe('day')
    expect(r.bars).toHaveLength(14)
    expect(r.bars[0]).toMatchObject({ label: '16', n: 754, weekend: false })
    expect(r.bars[1]?.n).toBe(0)
    expect(r.bars.filter((b) => b.weekend).map((b) => b.label)).toEqual(['19', '20', '26', '27'])
  })

  it('draws a week a bar beyond a month, and loses no visitor', () => {
    const daily = [
      { day: '2026-07-02', visitors: 3 },
      { day: '2026-08-10', visitors: 5 },
      { day: '2026-09-29', visitors: 7 },
    ]
    const r = bars('2026-07-02', '2026-09-29', daily)
    expect(r.per).toBe('week')
    expect(r.bars.reduce((a, b) => a + b.n, 0)).toBe(15)
    expect(r.bars[0]?.label).toBe('27')
    expect(r.bars[r.bars.length - 1]?.label).toBe('40')
    expect(r.bars.length).toBe(14)
  })

  it('leaves the site’s name off a page title', () => {
    expect(bareTitle('Priser · Orgpuls')).toBe('Priser')
    expect(bareTitle('Priser | Orgpuls')).toBe('Priser')
    expect(bareTitle('Orgpuls')).toBe('Orgpuls')
  })
})
