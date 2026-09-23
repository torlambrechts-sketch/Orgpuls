import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasValidCheckDigit, lookupOrgNumber } from '@/lib/brreg/lookup'
import { lookupAllowed, networkOf, resetLookupThrottle } from '@/lib/brreg/throttle'

/** S5: the public registry lookup, and what stops it being used as an amplifier. */

describe('hasValidCheckDigit', () => {
  it('accepts real organisation numbers', () => {
    expect(hasValidCheckDigit('923609016')).toBe(true) // Equinor, looked up live
    expect(hasValidCheckDigit('974760673')).toBe(true) // Brønnøysundregistrene
  })

  it('refuses numbers that cannot exist, including the fixture’s fictional one', () => {
    expect(hasValidCheckDigit('923609017')).toBe(false)
    expect(hasValidCheckDigit('924118742')).toBe(false)
    expect(hasValidCheckDigit('12345')).toBe(false)
  })

  it('a failing number is answered not_found without a request leaving the server', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    await expect(lookupOrgNumber('123456789')).resolves.toEqual({ ok: false, problem: 'not_found' })
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRestore()
  })
})

describe('networkOf', () => {
  it('keeps the network, never the address', () => {
    expect(networkOf('84.211.30.7')).toBe('84.211.30.0/24')
    expect(networkOf('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::/48')
  })

  it('takes the client, the first hop of x-forwarded-for', () => {
    expect(networkOf('84.211.30.7, 76.76.21.9')).toBe('84.211.30.0/24')
  })

  it('has a name for no address at all', () => {
    expect(networkOf(null)).toBe('unknown')
  })
})

describe('lookupAllowed', () => {
  beforeEach(() => resetLookupThrottle())

  it('allows twenty in a window and refuses the twenty-first', () => {
    const t = 1_000_000
    for (let i = 0; i < 20; i++) expect(lookupAllowed('a', t)).toBe(true)
    expect(lookupAllowed('a', t)).toBe(false)
  })

  it('one network being throttled does not throttle another', () => {
    for (let i = 0; i < 21; i++) lookupAllowed('a', 0)
    expect(lookupAllowed('b', 0)).toBe(true)
  })

  it('the window resets', () => {
    for (let i = 0; i < 21; i++) lookupAllowed('a', 0)
    expect(lookupAllowed('a', 10 * 60 * 1000)).toBe(true)
  })
})
