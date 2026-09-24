import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/org/read', () => ({ getOrganization: async () => null, getViewerRole: async () => null }))

const { defaultView } = await import('@/lib/shell/prefs.server')

describe('defaultView (design 3: Enkel for a small organisation\'s daglig leder)', () => {
  it('starts a daglig leder of fewer than 50 in Enkel', () => {
    expect(defaultView('daglig_leder', 34)).toBe('enkel')
    expect(defaultView('daglig_leder', 49)).toBe('enkel')
  })
  it('starts everyone else in Full', () => {
    expect(defaultView('daglig_leder', 50)).toBe('full')
    expect(defaultView('avdelingsleder', 10)).toBe('full')
    expect(defaultView('verneombud', 10)).toBe('full')
  })
  it('does not guess when it cannot know', () => {
    expect(defaultView(null, 10)).toBe('full')
    expect(defaultView('daglig_leder', null)).toBe('full')
  })
})
