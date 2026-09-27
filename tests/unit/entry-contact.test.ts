import { describe, expect, it } from 'vitest'
import { contactOf } from '@/lib/entry/contact'

// the QR page's field (0076, D-126): what is typed, as the register stores it
describe('contactOf', () => {
  it('lower-cases an e-mail address', () => {
    expect(contactOf('  Kari.Nord@Firma.NO ')).toEqual({ kind: 'email', value: 'kari.nord@firma.no' })
  })
  it('reads a Norwegian mobile number the way people write it', () => {
    expect(contactOf('912 34 567')).toEqual({ kind: 'phone', value: '+4791234567' })
    expect(contactOf('+47 912 34 567')).toEqual({ kind: 'phone', value: '+4791234567' })
    expect(contactOf('0047 91234567')).toEqual({ kind: 'phone', value: '+4791234567' })
  })
  it('refuses what is neither', () => {
    expect(contactOf('')).toBeNull()
    expect(contactOf('12')).toBeNull()
    expect(contactOf('ikke en adresse')).toBeNull()
    expect(contactOf('a@b')).toBeNull()
    // a landline cannot receive the link
    expect(contactOf('22 33 44 55')).toBeNull()
  })
})
