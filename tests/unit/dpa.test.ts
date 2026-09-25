import { describe, expect, it } from 'vitest'
import no from '@/messages/no.json'
import en from '@/messages/en.json'
import { DPA_SHA256, DPA_VERSION, DpaText, dpaHash } from '@/lib/legal/dpa'

describe('the data processing agreement', () => {
  it('is well formed in both languages', () => {
    expect(DpaText.safeParse(no.dpa).success).toBe(true)
    expect(DpaText.safeParse(en.dpa).success).toBe(true)
  })

  it('has the same sections in both languages', () => {
    expect(en.dpa.sections.length).toBe(no.dpa.sections.length)
  })

  it('is the text the published version was hashed from: a change to the words needs a new version', () => {
    expect(dpaHash(DpaText.parse(no.dpa))).toBe(DPA_SHA256)
    expect(DPA_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
