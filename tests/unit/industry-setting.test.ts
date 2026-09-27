import { describe, expect, it } from 'vitest'
import { INDUSTRIES_IN_ORDER, resolveIndustry } from '@/content/industries/meta'

/** The organisation's industry (0091, D-139, innstillinger-og-forside.md § 3.1) */
const none = { source: null, key: null, suggestedAtChoice: null } as const

describe('the organisation\'s industry', () => {
  it('follows the NACE code until chosen, and when chosen to follow it', () => {
    expect(resolveIndustry('47.110', none).chosen?.slug).toBe('handel')
    expect(resolveIndustry('62.100', { ...none, source: 'brreg' }).chosen?.slug).toBe('kunnskap-og-kontor')
    expect(resolveIndustry(null, none).chosen).toBeNull()
  })

  it('keeps a manual choice, including «Ingen bransjemodul», when the code changes', () => {
    const r = resolveIndustry('47.110', { source: 'manual', key: 'kunnskap-og-kontor', suggestedAtChoice: 'kunnskap-og-kontor' })
    expect(r.chosen?.slug).toBe('kunnskap-og-kontor')
    expect(r.suggested?.slug).toBe('handel')
    expect(resolveIndustry('47.110', { source: 'manual', key: null, suggestedAtChoice: 'handel' }).chosen).toBeNull()
  })

  it('offers the new suggestion once, where it differs from the one the choice was made against', () => {
    // chosen against kontor; the code now says handel
    expect(resolveIndustry('47.110', { source: 'manual', key: 'bygg-og-anlegg', suggestedAtChoice: 'kunnskap-og-kontor' }).changed?.slug).toBe('handel')
    // «Behold» recorded handel: not asked again
    expect(resolveIndustry('47.110', { source: 'manual', key: 'bygg-og-anlegg', suggestedAtChoice: 'handel' }).changed).toBeNull()
    // the new suggestion is what they chose anyway
    expect(resolveIndustry('47.110', { source: 'manual', key: 'handel', suggestedAtChoice: null }).changed).toBeNull()
  })

  it('lists the industries in the registry\'s order, largest first', () =>
    expect(INDUSTRIES_IN_ORDER.map((i) => i.slug)).toEqual([
      'handel',
      'kunnskap-og-kontor',
      'bygg-og-anlegg',
      'barnehage-og-skole',
      'helse-og-omsorg',
    ]))
})

describe('the industry cards (D-141)', () => {
  it('says «Ny» only on a launched page, until its date', async () => {
    const { isNewIndustry, getIndustry, INDUSTRIES } = await import('@/content/industries')
    const bygg = getIndustry('bygg-og-anlegg')!.page!
    expect(isNewIndustry({ ...bygg, card: { newUntil: '2026-12-27' } }, '2026-09-28')).toBe(true)
    expect(isNewIndustry({ ...bygg, card: { newUntil: '2026-12-27' } }, '2026-12-28')).toBe(false)
    expect(isNewIndustry({ ...bygg, launched: false, card: { newUntil: '2026-12-27' } }, '2026-09-28')).toBe(false)
    expect(isNewIndustry(bygg, '2026-09-28')).toBe(false)
    // the registry's order
    expect(INDUSTRIES.map((i) => i.slug)[0]).toBe('handel')
  })

  it('refuses a «Ny» date that is not one', async () => {
    const { problemsOf } = await import('@/content/industries/validate')
    const { getIndustry } = await import('@/content/industries')
    const bygg = getIndustry('bygg-og-anlegg')!.page!
    expect(problemsOf({ ...bygg, card: { newUntil: 'SETT-DATO-90-DAGER-ETTER-PUBLISERING' } })).toContain(
      'card: «Ny» until "SETT-DATO-90-DAGER-ETTER-PUBLISERING" is not an ISO date',
    )
    expect(problemsOf({ ...bygg, card: { newUntil: '2026-12-27' } })).toEqual([])
  })
})
