import { describe, expect, it } from 'vitest'
import { labelText } from '@/lib/admin/crmLabel'

/** The restore list's and the delete preview's name for a record (0195, D-210) */
describe('labelText', () => {
  it('joins a name and its detail, and skips what is missing', () => {
    expect(labelText({ name: 'Klinikk Sør AS', detail: '912345678' })).toBe('Klinikk Sør AS · 912345678')
    expect(labelText({ name: 'hege.sand@fixture.example', detail: null })).toBe('hege.sand@fixture.example')
    expect(labelText(null)).toBe('—')
  })
})
