import type { Market } from '@/lib/markets'

/**
 * Organisation numbers per market (0218, D-254), the same rules as `app.org_number_valid`. The
 * database holds every organisation to its market's rule; this is the same rule at the form, so a
 * person hears that a number is wrong before anything is sent. Edge-safe and pure.
 *
 *   nine_digits    Norway: nine digits, as since 0001
 *   se_legal_ten   Sweden: ten digits, the Luhn check digit, and a third digit of 2 or more, which only
 *                  a legal person's organisationsnummer has. A sole trader's number is their
 *                  personnummer, which the product does not take.
 *
 * tests/unit/org-number.test.ts holds this to the database's rule on the same numbers that
 * supabase/tests/markets_invariants.sql checks.
 */
export type OrgNumberRule = 'nine_digits' | 'se_legal_ten'

export const ORG_NUMBER_RULE: Record<Market, OrgNumberRule> = { no: 'nine_digits', se: 'se_legal_ten' }

/** What a person types, as digits: spaces and the Swedish hyphen (556677-8899) go */
export const normalizeOrgNumber = (value: string): string => value.replace(/[\s-]/g, '')

function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

export function orgNumberValid(rule: OrgNumberRule, digits: string): boolean {
  switch (rule) {
    case 'nine_digits':
      return /^\d{9}$/.test(digits)
    case 'se_legal_ten':
      return /^\d{2}[2-9]\d{7}$/.test(digits) && luhn(digits)
  }
}

/** Whether what a person typed is an organisation number in this market */
export const validOrgNumber = (market: Market, value: string): boolean =>
  orgNumberValid(ORG_NUMBER_RULE[market], normalizeOrgNumber(value))

/**
 * As it is printed: Norway's in groups of three (123 456 789), Sweden's with its hyphen
 * (556677-8899). The two cannot be confused: nine digits and ten.
 */
export function formatOrgNumber(orgNumber: string | null): string | null {
  if (!orgNumber) return null
  const digits = orgNumber.replace(/\s/g, '')
  if (/^\d{9}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  if (/^\d{10}$/.test(digits)) return `${digits.slice(0, 6)}-${digits.slice(6)}`
  return orgNumber
}
