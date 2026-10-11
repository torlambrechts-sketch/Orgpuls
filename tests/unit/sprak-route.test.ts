import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Choosing a language through /api/sprak (D-109): the cookie always, the signed-in person's saved
 * language only when they chose it here. `profil=0` is the moved English host's (D-275): following
 * an old en.orgpuls.com link is not choosing a language for an account.
 */
const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
const setLocaleCookie = vi.fn(async (_l: string) => {})
vi.mock('@/lib/i18n/server', () => ({ setLocaleCookie: (l: string) => setLocaleCookie(l) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    schema: () => ({ from: () => ({ update }) }),
  }),
}))

describe('/api/sprak', () => {
  beforeEach(() => {
    update.mockClear()
    setLocaleCookie.mockClear()
  })

  it('saves the choice on the cookie and the profile, then returns to the page', async () => {
    const { GET } = await import('@/app/api/sprak/route')
    const res = await GET(new NextRequest('https://www.orgpuls.com/api/sprak?l=en&til=%2Fpriser'))
    expect(setLocaleCookie).toHaveBeenCalledWith('en')
    expect(update).toHaveBeenCalledWith({ lang: 'en' })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://www.orgpuls.com/priser')
  })

  it('with profil=0 saves it for this browser only', async () => {
    const { GET } = await import('@/app/api/sprak/route')
    const res = await GET(new NextRequest('https://www.orgpuls.com/api/sprak?l=en&til=%2Finnsikt&profil=0'))
    expect(setLocaleCookie).toHaveBeenCalledWith('en')
    expect(update).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBe('https://www.orgpuls.com/innsikt')
  })

  it('never returns to another host', async () => {
    const { GET } = await import('@/app/api/sprak/route')
    for (const til of ['https://evil.example/', '//evil.example', '/\\\\evil.example'])
      expect(new URL((await GET(new NextRequest(`https://www.orgpuls.com/api/sprak?l=en&til=${encodeURIComponent(til)}`))).headers.get('location')!).host).toBe('www.orgpuls.com')
  })
})
