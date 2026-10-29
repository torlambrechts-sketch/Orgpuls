import { describe, expect, it } from 'vitest'
import { formatOrgNumber, normalizeOrgNumber, ORG_NUMBER_SHAPE, orgNumberInput, orgNumberValid, signupOrgNumber, validOrgNumber } from '@/lib/org-number'
import { PendingOrg } from '@/lib/signup/pending'

/**
 * Organisation numbers per market (0218, D-254; 0222, D-264; 0236, DE-B). The cases are the ones
 * supabase/tests/markets_invariants.sql rows 19, 23 and 26 give app.org_number_valid, so the form
 * and the database refuse the same numbers.
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
    ['gb_company', '01234567', true], // England and Wales
    ['gb_company', 'SC327000', true], // Scotland
    ['gb_company', 'NI000001', true], // Northern Ireland
    ['gb_company', 'R0000001', true], // Northern Ireland, before partition
    ['gb_company', 'OC300001', true], // LLP, England and Wales
    ['gb_company', 'SO300001', true], // LLP, Scotland
    ['gb_company', 'NC000001', true], // LLP, Northern Ireland
    ['gb_company', 'LP000001', false], // a limited partnership: not a company or LLP
    ['gb_company', 'FC000001', false], // an overseas company
    ['gb_company', 'sc327000', false], // stored in capitals only
    ['gb_company', '1234567', false], // stored padded to eight
    ['gb_company', '999000214', false], // nine digits
    ['de_ustid', 'DE136695976', true], // a USt-IdNr. with its check digit
    ['de_ustid', 'DE811569869', true], // another
    ['de_ustid', 'DE136695977', false], // wrong check digit
    ['de_ustid', '136695976', false], // the prefix is part of the number
    ['de_ustid', 'de136695976', false], // stored in capitals only
    ['de_ustid', 'DE13669597', false], // eight digits
    ['de_ustid', 'ATU12345675', false], // another country's VAT number
    ['de_ustid', '999000214', false], // Norway's nine digits
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
    expect(validOrgNumber('gb', '924118742')).toBe(false)
    expect(validOrgNumber('no', '01234567')).toBe(false)
    expect(validOrgNumber('se', 'SC327000')).toBe(false)
    expect(validOrgNumber('de', '924118742')).toBe(false)
    expect(validOrgNumber('no', 'DE136695976')).toBe(false)
  })

  it('in Germany, may carry the spaces and dots a firm prints, and is stored in capitals with its prefix', () => {
    expect(normalizeOrgNumber(' de 136 695 976 ', 'de')).toBe('DE136695976')
    expect(normalizeOrgNumber('DE136.695.976', 'de')).toBe('DE136695976')
    expect(validOrgNumber('de', 'de 136 695 976')).toBe(true)
    expect(validOrgNumber('de', 'DE 136 695 977')).toBe(false)
    expect(orgNumberInput('de')).toBe('text')
    expect(formatOrgNumber('DE136695976')).toBe('DE 136 695 976')
    expect(ORG_NUMBER_SHAPE.test('DE136695976')).toBe(true)
  })

  it('in the United Kingdom, is stored as Companies House prints it', () => {
    expect(normalizeOrgNumber(' sc 327000 ', 'gb')).toBe('SC327000')
    expect(normalizeOrgNumber('1234567', 'gb')).toBe('01234567')
    expect(normalizeOrgNumber('6', 'gb')).toBe('00000006')
    // padding is the UK's: elsewhere a short number stays short and is refused
    expect(normalizeOrgNumber('1234567', 'no')).toBe('1234567')
    expect(normalizeOrgNumber('1234567')).toBe('1234567')
    expect(validOrgNumber('gb', 'sc327000')).toBe(true)
    expect(validOrgNumber('gb', '1234567')).toBe(true)
    expect(validOrgNumber('gb', 'LP000001')).toBe(false)
  })

  it('takes letters on the keyboard only where the number has them', () => {
    expect(orgNumberInput('gb')).toBe('text')
    expect(orgNumberInput('no')).toBe('numeric')
    expect(orgNumberInput('se')).toBe('numeric')
    expect(orgNumberInput('de')).toBe('text')
  })

  it('has a shape every market’s stored number fits, before the market is known', () => {
    for (const n of ['999000214', '5560125790', '01234567', 'SC327000', 'DE136695976']) expect(ORG_NUMBER_SHAPE.test(n), n).toBe(true)
    for (const n of ['1234567', '12345678901', 'sc327000', '556012-5790', 'de136695976', 'ATU12345675']) expect(ORG_NUMBER_SHAPE.test(n), n).toBe(false)
  })

  it('is printed as each country prints it', () => {
    expect(formatOrgNumber('924118742')).toBe('924 118 742')
    expect(formatOrgNumber('5560125790')).toBe('556012-5790')
    expect(formatOrgNumber('01234567')).toBe('01234567')
    expect(formatOrgNumber('SC327000')).toBe('SC327000')
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
    expect(PendingOrg.safeParse({ ...base, orgNumber: 'SC327000', market: 'gb' }).success).toBe(true)
    expect(PendingOrg.safeParse({ ...base, orgNumber: 'SC327000', market: 'se' }).success).toBe(false)
    expect(PendingOrg.safeParse({ ...base, orgNumber: '999000214', market: 'gb' }).success).toBe(false)
  })

  it('reads one kept before markets as Norway’s, nine digits as before', () => {
    const p = PendingOrg.safeParse({ ...base, orgNumber: '999000214' })
    expect(p.success && p.data.market).toBe('no')
  })
})

describe('a number a sign-up may carry (X-114, D-279)', () => {
  it('holds a Norwegian number to the register\'s check digit, so a typo is refused rather than routed', () => {
    expect(signupOrgNumber('no', '987 654 325')).toBe(true)
    expect(signupOrgNumber('no', '999999115')).toBe(true)
    expect(signupOrgNumber('no', '999999995')).toBe(false)
    expect(signupOrgNumber('no', '924118742')).toBe(false)
    expect(validOrgNumber('no', '924118742')).toBe(true)
  })

  it('leaves other markets to their own rule', () => {
    expect(signupOrgNumber('se', '556012-5790')).toBe(true)
    expect(signupOrgNumber('gb', 'SC327000')).toBe(true)
    expect(signupOrgNumber('gb', 'LP000001')).toBe(false)
  })
})
