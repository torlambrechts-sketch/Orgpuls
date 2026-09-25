import { describe, expect, it } from 'vitest'
import { isRespondentPath, scrubUrl } from '@/lib/analytics/scrub'

describe('scrubUrl', () => {
  it('keeps origin and path for a screen', () => {
    expect(scrubUrl('https://www.orgpuls.com/innsikt')).toBe('https://www.orgpuls.com/innsikt')
  })

  it('drops the query string and the fragment', () => {
    expect(scrubUrl('https://www.orgpuls.com/resultat?maling=abc&avdeling=x#top')).toBe(
      'https://www.orgpuls.com/resultat',
    )
  })

  it('refuses a respondent link outright — the path carries the token', () => {
    expect(scrubUrl('https://www.orgpuls.com/s/secret-token-value')).toBeNull()
    expect(scrubUrl('https://www.orgpuls.com/s/secret-token-value?x=1')).toBeNull()
    expect(scrubUrl('https://www.orgpuls.com/s')).toBeNull()
  })

  it('refuses an invitation link the same way — its path carries a token too', () => {
    expect(scrubUrl('https://www.orgpuls.com/bli-med/0123abcd')).toBeNull()
  })

  it('keeps a campaign\'s utm tags, and nothing else, from the query string', () => {
    expect(scrubUrl('https://www.orgpuls.com/lovkrav?utm_source=linkedin&orgnr=924118742&utm_campaign=vår&x=1')).toBe(
      'https://www.orgpuls.com/lovkrav?utm_source=linkedin&utm_campaign=v%C3%A5r',
    )
  })

  it('caps a tag\'s length', () => {
    const long = 'a'.repeat(200)
    expect(scrubUrl(`https://www.orgpuls.com/?utm_content=${long}`)).toBe(`https://www.orgpuls.com/?utm_content=${'a'.repeat(80)}`)
  })

  it('does not mistake a path that merely starts with s for a respondent link', () => {
    expect(scrubUrl('https://www.orgpuls.com/samtaler')).toBe('https://www.orgpuls.com/samtaler')
  })

  it('sends nothing for a URL it cannot parse', () => {
    expect(scrubUrl('not a url')).toBeNull()
  })
})

describe('isRespondentPath', () => {
  it('matches /s and everything under it, nothing else', () => {
    expect(isRespondentPath('/s/abc')).toBe(true)
    expect(isRespondentPath('/s')).toBe(true)
    expect(isRespondentPath('/samtaler')).toBe(false)
    expect(isRespondentPath('/')).toBe(false)
  })
})
