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
