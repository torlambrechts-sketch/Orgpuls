import { describe, expect, it } from 'vitest'
import { safeReturn, switchUrl } from '@/lib/i18n/switch'

/** The language switch's return path (D-109): a path on this site, never somewhere else. */
describe('language switch return (D-109)', () => {
  it('keeps a path on this site', () => {
    expect(safeReturn('/priser')).toBe('/priser')
    expect(safeReturn('/artikler/anonym-medarbeiderundersokelse')).toBe('/artikler/anonym-medarbeiderundersokelse')
  })
  it('refuses anything that could leave it', () => {
    for (const bad of ['https://evil.example/', '//evil.example', '/\\evil.example', 'priser', '', null, '/a\nb']) {
      expect(safeReturn(bad)).toBe('/')
    }
  })
  it('goes through the target host own route', () => {
    expect(switchUrl('https://www.orgpuls.com', 'no', '/priser')).toBe('https://www.orgpuls.com/api/sprak?l=no&til=%2Fpriser')
  })
})
