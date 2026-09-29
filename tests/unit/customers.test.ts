import { describe, expect, it } from 'vitest'
import { customerState, seats } from '@/lib/admin/customers'

const base = { status: 'active' as const, cancelled_at: null, cancel_effective_at: null, demo: false }
const NOW = Date.parse('2026-09-29T12:00:00Z')

describe('customerState (D-164)', () => {
  it('takes the access state when nothing is cancelled', () => {
    expect(customerState(base, NOW)).toBe('active')
    expect(customerState({ ...base, status: 'trial' }, NOW)).toBe('trial')
    expect(customerState({ ...base, status: 'grace' }, NOW)).toBe('ended')
    expect(customerState({ ...base, status: 'read_only' }, NOW)).toBe('ended')
  })
  it('is cancelling until the last day and churned after it', () => {
    const c = { ...base, cancelled_at: '2026-09-01T00:00:00Z' }
    expect(customerState({ ...c, cancel_effective_at: '2026-10-01T00:00:00Z' }, NOW)).toBe('cancelling')
    expect(customerState({ ...c, status: 'read_only', cancel_effective_at: '2026-09-15T00:00:00Z' }, NOW)).toBe('churned')
  })
  it('never counts a demo sandbox as a customer', () => {
    expect(customerState({ ...base, demo: true }, NOW)).toBe('demo')
  })
})

describe('seats', () => {
  it('counts against the chosen plan', () => {
    expect(seats('small', 40, 20)).toEqual({ plan: 'small', chosen: true, used: 20, max: 25, pct: 80 })
  })
  it('falls back to the plan the stated size fits, and caps the share at 100', () => {
    expect(seats(null, 60, 130)).toEqual({ plan: 'usual', chosen: false, used: 130, max: 100, pct: 100 })
  })
  it('has no share on the plan without a ceiling', () => {
    expect(seats('group', 400, 380)).toMatchObject({ plan: 'group', max: null, pct: null })
  })
})
