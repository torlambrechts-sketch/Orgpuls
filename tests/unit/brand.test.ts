import { describe, expect, it } from 'vitest'
import { brandSrc } from '@/lib/org/brand'

/** The header and the side rail show the organisation's logo only when it was chosen for them (AUD-25). */
describe('brandSrc', () => {
  const key = 'ab'.repeat(16)
  it('gives the logo\'s address when it stands in the header', () => {
    expect(brandSrc({ key, inHeader: true })).toBe(`/logo/${key}`)
  })
  it('gives nothing, and so the Orgpuls mark, when it does not or there is none', () => {
    expect(brandSrc({ key, inHeader: false })).toBeNull()
    expect(brandSrc(null)).toBeNull()
  })
})
