import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { callFailed, parseFailed, readFailed } from '@/lib/supabase/read'
import { writeFailed } from '@/lib/supabase/write'
import { onlyOrganisation } from '@/lib/org/current'

/**
 * The three failure helpers, and the one-organisation rule.
 *
 * These are small functions with an outsized job: each one is the difference between a
 * failure the product reports and a failure it renders as the truth. D-40 (a refused read
 * shown as "Ingen tiltak") and S1 (a refused write shown as "Lagret") were both fixed by
 * routing through them, so what they return — and what they refuse to log — is pinned here.
 */

const pgError = (over: Partial<PostgrestError> = {}): PostgrestError =>
  ({ name: 'PostgrestError', code: 'PGRST201', message: 'Could not embed', details: '', hint: '', ...over }) as PostgrestError

afterEach(() => vi.restoreAllMocks())
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('writeFailed — S1', () => {
  it('a refused UPDATE comes back as zero rows and no error, and that is a failure', () => {
    const log = quiet()
    expect(writeFailed('saveWheel', null, [])).toBe(true)
    expect(log.mock.calls[0]?.[0]).toMatch(/\[write\] saveWheel: no row was affected/)
  })

  it('a missing representation is a failure too — a mutation without .select() cannot pass', () => {
    quiet()
    expect(writeFailed('saveWheel', null, null)).toBe(true)
  })

  it('an error is a failure, and is logged by code and message', () => {
    const log = quiet()
    expect(writeFailed('addLocation', pgError({ code: '23505', message: 'duplicate key' }), null)).toBe(true)
    expect(log.mock.calls[0]?.[0]).toBe('[write] addLocation: 23505 duplicate key')
  })

  it('one returned row is success, and logs nothing', () => {
    const log = quiet()
    expect(writeFailed('saveWheel', null, [{ id: 'x' }])).toBe(false)
    expect(log).not.toHaveBeenCalled()
  })

  it('never logs `details` — the field that quotes the value that violated a constraint', () => {
    const log = quiet()
    writeFailed('addEmployee', pgError({ details: 'Key (full_name)=(Kari Nordmann) already exists' }), null)
    expect(String(log.mock.calls[0]?.[0])).not.toContain('Kari Nordmann')
  })
})

describe('readFailed — D-40', () => {
  it('the refused embed that emptied Tiltak is a failure, not an empty list', () => {
    const log = quiet()
    expect(readFailed('getMeasures', pgError(), null)).toBe(true)
    expect(log.mock.calls[0]?.[0]).toMatch(/^\[read\] getMeasures: PGRST201/)
  })

  it('a genuinely empty result is not a failure', () => {
    const log = quiet()
    expect(readFailed('getMeasures', null, [])).toBe(false)
    expect(log).not.toHaveBeenCalled()
  })
})

describe('callFailed', () => {
  it('a null payload from an RPC is a legitimate answer, not a failure', () => {
    expect(callFailed('getViewerRole', null)).toBe(false)
  })
})

describe('parseFailed — invariant 7', () => {
  it('logs the column and the code, never the value it received', () => {
    const log = quiet()
    const parsed = z.object({ body: z.number() }).safeParse({ body: 'a respondent wrote this' })
    expect(parseFailed('getThread', parsed)).toBe(true)
    const line = String(log.mock.calls[0]?.[0])
    expect(line).toContain('body [invalid_type]')
    expect(line).not.toContain('a respondent wrote this')
  })

  it('narrows the success arm, so no call site needs an assertion', () => {
    const parsed = z.object({ n: z.number() }).safeParse({ n: 1 })
    if (parseFailed('x', parsed)) throw new Error('unreachable')
    expect(parsed.data.n).toBe(1)
  })
})

describe('onlyOrganisation — Q3', () => {
  it('one organisation is the answer', () => {
    expect(onlyOrganisation('x', [{ id: 'a' }])).toEqual({ id: 'a' })
  })

  it('none is null, and not an error', () => {
    const log = quiet()
    expect(onlyOrganisation('x', [])).toBeNull()
    expect(log).not.toHaveBeenCalled()
  })

  it('two is null and a log line — refuse rather than guess', () => {
    const log = quiet()
    expect(onlyOrganisation('createMeasure', [{ id: 'a' }, { id: 'b' }])).toBeNull()
    expect(log.mock.calls[0]?.[0]).toMatch(/\[org\] createMeasure: .*more than one organisation/)
  })
})
