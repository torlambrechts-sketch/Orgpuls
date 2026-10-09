import { describe, expect, it } from 'vitest'
import { formatOrgNumber, normalizeOrgNumber, orgNumberValid, validOrgNumber } from '@/lib/org-number'
import { PendingOrg } from '@/lib/signup/pending'

/**
 * Organisation numbers per market (0218, D-254). The cases are the ones
 * supabase/tests/markets_invariants.sql row 19 gives app.org_number_valid, so the form and the
 * database refuse the same numbers.
 */
describe('the organisation number rules, as the database has them', () => {
  it.each([
    ['se_legal_ten', '5560125790', true], // Volvo AB
    ['se_legal_ten', '2120000142', true], // Skatteverket
    ['se_legal_ten', '5560125791', false], // wrong check digit
    ['se_legal_ten', '8507091232', false], // a personnummer: valid check digit, month 07
    ['se_legal_ten', '556012579', false], // nine digits
    ['nine_digits', '999000214', true],
    ['nine_digits', '5560125790', false],
    ['nine_digits', '99900021a', false],
  ] as const)('%s %s → %s', (rule, digits, expected) => {
    expect(orgNumberValid(rule, digits)).toBe(expected)
  })
})

describe('what a person types', () => {
  it('may carry spaces and the Swedish hyphen', () => {
    expect(normalizeOrgNumber(' 556012-5790 ')).toBe('5560125790')
    expect(validOrgNumber('se', '556012-5790')).toBe(true)
    expect(validOrgNumber('no', '924 118 742')).toBe(true)
  })

  it('is a number in its own market only', () => {
    expect(validOrgNumber('no', '556012-5790')).toBe(false)
    expect(validOrgNumber('se', '924118742')).toBe(false)
  })

  it('is printed as each country prints it', () => {
    expect(formatOrgNumber('924118742')).toBe('924 118 742')
    expect(formatOrgNumber('5560125790')).toBe('556012-5790')
    expect(formatOrgNumber('abc')).toBe('abc')
    expect(formatOrgNumber(null)).toBeNull()
  })
})

describe('a sign-up kept for its confirmation', () => {
  const base = { companyName: 'Prov AB', employeeCount: 12 }
  it('holds the number to the market it was made in', () => {
    expect(PendingOrg.safeParse({ ...base, orgNumber: '5566778899', market: 'se' }).success).toBe(true)
    expect(PendingOrg.safeParse({ ...base, orgNumber: '999000214', market: 'se' }).success).toBe(false)
    expect(PendingOrg.safeParse({ ...base, orgNumber: '5566778899', market: 'no' }).success).toBe(false)
  })

  it('reads one kept before markets as Norway’s, nine digits as before', () => {
    const p = PendingOrg.safeParse({ ...base, orgNumber: '999000214' })
    expect(p.success && p.data.market).toBe('no')
  })
})
