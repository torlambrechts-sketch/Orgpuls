import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A module is offered in its market (0220, D-260). The database decides which module keys an
 * organisation may use (org_module_keys); the screens take that answer and nothing else, so what
 * they offer is what set_org_module will accept. What would go wrong silently:
 *
 *  - an unreadable answer read as "everything", which would offer an organisation in Sweden the
 *    Norwegian modules again;
 *  - an answer of another shape cast instead of parsed.
 *
 * The rule itself (a key with no market is Norway's) is held in SQL by
 * supabase/tests/module_market_invariants.sql.
 */
const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }))
const { getUsableModuleKeys } = await import('@/lib/modules/read')

const ORG = '00000000-0000-4000-8000-000000000001'

describe('the module keys an organisation may use', () => {
  beforeEach(() => rpc.mockReset())

  it('are the keys org_module_keys returns for the organisation', async () => {
    rpc.mockResolvedValue({ data: ['bygg-og-anlegg', 'handel'], error: null })
    expect(await getUsableModuleKeys(ORG)).toEqual(new Set(['bygg-og-anlegg', 'handel']))
    expect(rpc).toHaveBeenCalledWith('org_module_keys', { p_org: ORG })
  })

  it('are none for an organisation whose market has no module', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect((await getUsableModuleKeys(ORG)).size).toBe(0)
  })

  it('are none when the database cannot be read, never every module', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function public.org_module_keys(uuid) does not exist' } })
    expect((await getUsableModuleKeys(ORG)).size).toBe(0)
  })

  it('are none when the answer is not a list of keys', async () => {
    rpc.mockResolvedValue({ data: { keys: ['handel'] }, error: null })
    expect((await getUsableModuleKeys(ORG)).size).toBe(0)
  })
})
