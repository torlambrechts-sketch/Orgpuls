import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// React's cache holds one value per server request; outside one it memoises nothing, so the test
// stands in a request of its own
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  cache: <T,>(fn: () => T) => {
    let held: { v: T } | null = null
    return () => (held ??= { v: fn() }).v
  },
}))

describe('report failures (review Q1)', () => {
  it('records the section a reader failed, once, and returns what the reader would have', async () => {
    const { failedAs, reportFailures } = await import('@/lib/report/failures')
    expect(failedAs('trainings', [])).toEqual([])
    expect(failedAs('trainings', [])).toEqual([])
    expect(failedAs('risk', null)).toBeNull()
    expect(reportFailures().sort()).toEqual(['risk', 'trainings'])
  })
})
