import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const { helpPagePath, HELP_PAGE_MAX } = await import('@/lib/help/request')
const { sendHelpRequest } = await import('@/app/(app)/hjelp/actions')

describe('helpPagePath — the page a request is filed from (D-174)', () => {
  it('keeps the path of an app screen', () => {
    expect(helpPagePath('/innsikt')).toBe('/innsikt')
    expect(helpPagePath('/hjelp')).toBe('/hjelp')
    expect(helpPagePath('/tiltak/0b6f1b1e-2c9a-4c1e-9d2a-3f1e2d3c4b5a')).toBe('/tiltak/0b6f1b1e-2c9a-4c1e-9d2a-3f1e2d3c4b5a')
  })
  it('cuts the query string and the fragment', () => {
    expect(helpPagePath('/resultater?visning=segment&gruppe=Verksted')).toBe('/resultater')
    expect(helpPagePath('/malinger#arshjul')).toBe('/malinger')
    expect(helpPagePath('/oppsett?fane=ansatte#x?y')).toBe('/oppsett')
  })
  it('never names a respondent page, whose path is the token', () => {
    expect(helpPagePath('/s/abcDEF123')).toBe('')
    expect(helpPagePath('/s')).toBe('')
  })
  it('sends nothing rather than something that is not a path, or too long to keep', () => {
    expect(helpPagePath('https://example.com/innsikt')).toBe('')
    expect(helpPagePath('/innsikt og mer')).toBe('')
    expect(helpPagePath(`/${'a'.repeat(HELP_PAGE_MAX)}`)).toBe('')
    expect(helpPagePath('')).toBe('')
  })
})

describe('sendHelpRequest — the page reaches submit_help_request as a path only', () => {
  const base = { category: 'bug' as const, subject: '', body: 'Noe virker ikke.', browser: 'test' }
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: { ok: true, number: 1042 }, error: null })
  })

  it('passes the screen path through', async () => {
    expect(await sendHelpRequest({ ...base, page: '/resultater' })).toEqual({ ok: true, number: 1042 })
    expect(rpc).toHaveBeenCalledWith('submit_help_request', expect.objectContaining({ p_page: '/resultater' }))
  })
  it('accepts no page', async () => {
    expect(await sendHelpRequest({ ...base, page: '' })).toEqual({ ok: true, number: 1042 })
    expect(rpc).toHaveBeenCalledWith('submit_help_request', expect.objectContaining({ p_page: '' }))
  })
  it('refuses a query string, a fragment, a host, a respondent path or an overlong path before the database', async () => {
    for (const page of ['/resultater?gruppe=Verksted', '/malinger#x', 'https://example.com/', '/s/abc', `/${'a'.repeat(HELP_PAGE_MAX)}`]) {
      expect(await sendHelpRequest({ ...base, page })).toEqual({ ok: false, problem: 'invalid' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })
})
