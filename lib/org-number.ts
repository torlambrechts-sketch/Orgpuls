import type { Market } from '@/lib/markets'
import { hasValidCheckDigit } from '@/lib/brreg/orgnr'

/**
 * Organisation numbers per market (0218, D-254), the same rules as `app.org_number_valid`. The
 * database holds every organisation to its market's rule; this is the same rule at the form, so a
 * person hears that a number is wrong before anything is sent. Edge-safe and pure.
 *
 *   nine_digits    Norway: nine digits, as since 0001
 *   se_legal_ten   Sweden: ten digits, the Luhn check digit, and a third digit of 2 or more, which only
 *                  a legal person's organisationsnummer has. A sole trader's number is their
 *                  personnummer, which the product does not take.
 *   gb_company     United Kingdom (0222): a Companies House number of a limited company or LLP, eight
 *                  characters: eight digits, or SC, NI, R0, OC, SO or NC and six digits. Stored with
 *                  the prefix in capitals and a number of digits only padded to eight with zeros, as
 *                  Companies House prints it (docs/markets/uk-legal.md § 7).
 *   de_ustid       Germany (0236): the Umsatzsteuer-Identifikationsnummer, DE and nine digits, the ninth
 *                  the check digit of the first eight (ISO 7064 MOD 11,10). Germany has no single public
 *                  company number, and a reverse-charge invoice carries this one anyway
 *                  (docs/markets/de-legal.md, assumption 4). Stored with the prefix in capitals.
 *
 * tests/unit/org-number.test.ts holds this to the database's rule on the same numbers that
 * supabase/tests/markets_invariants.sql checks.
 */
export type OrgNumberRule = 'nine_digits' | 'se_legal_ten' | 'gb_company' | 'de_ustid'

export const ORG_NUMBER_RULE: Record<Market, OrgNumberRule> = { no: 'nine_digits', se: 'se_legal_ten', gb: 'gb_company', de: 'de_ustid' }

/**
 * What any market's number can look like before its rule is known: eight to ten digits or capitals,
 * or DE and nine digits (a USt-IdNr., 0236). A boundary that has no market yet checks this, then the
 * market's rule once the host names it.
 */
export const ORG_NUMBER_SHAPE = /^([0-9A-Z]{8,10}|DE[0-9]{9})$/

/**
 * What a person types, as the number is stored: spaces, the Swedish hyphen (556677-8899) and the
 * dots some German firms print (DE 136.695.976) go, and letters are capitals (sc123456 is SC123456,
 * de136695976 is DE136695976). In the United Kingdom a number of digits only is padded to eight with
 * zeros: Companies House drops the leading zeros in places, and 1234567 is 01234567.
 */
export function normalizeOrgNumber(value: string, market?: Market): string {
  const typed = value.replace(/[\s.-]/g, '').toUpperCase()
  if (market && ORG_NUMBER_RULE[market] === 'gb_company' && /^\d{1,7}$/.test(typed)) return typed.padStart(8, '0')
  return typed
}

/** The keyboard a market's number needs: digits, or letters too (a Companies House prefix, the DE of a USt-IdNr.) */
export const orgNumberInput = (market: Market): 'numeric' | 'text' => (ORG_NUMBER_RULE[market] === 'gb_company' || ORG_NUMBER_RULE[market] === 'de_ustid' ? 'text' : 'numeric')

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

/**
 * The check digit of a German USt-IdNr. over its first eight digits, as the database computes it
 * (app.de_ustid_check, 0236): ISO 7064 MOD 11,10.
 */
export function deUstIdCheck(eight: string): number {
  let product = 10
  for (const c of eight) {
    let sum = (Number(c) + product) % 10
    if (sum === 0) sum = 10
    product = (2 * sum) % 11
  }
  const check = 11 - product
  return check === 10 ? 0 : check
}

export function orgNumberValid(rule: OrgNumberRule, digits: string): boolean {
  switch (rule) {
    case 'nine_digits':
      return /^\d{9}$/.test(digits)
    case 'se_legal_ten':
      return /^\d{2}[2-9]\d{7}$/.test(digits) && luhn(digits)
    case 'gb_company':
      return /^(\d{8}|(SC|NI|R0|OC|SO|NC)\d{6})$/.test(digits)
    case 'de_ustid':
      return /^DE\d{9}$/.test(digits) && deUstIdCheck(digits.slice(2, 10)) === Number(digits[10])
  }
}

/** Whether what a person typed is an organisation number in this market */
export const validOrgNumber = (market: Market, value: string): boolean =>
  orgNumberValid(ORG_NUMBER_RULE[market], normalizeOrgNumber(value, market))

/**
 * A number a sign-up may carry (X-114, D-279): the market's rule, and in Norway the register's check
 * digit too. A typed number is matched to the organisation that holds it, so a typo must be refused,
 * not routed to somebody else's company; `signup_organisation` (0232) holds the same rule.
 */
export const signupOrgNumber = (market: Market, value: string): boolean =>
  validOrgNumber(market, value) &&
  (ORG_NUMBER_RULE[market] !== 'nine_digits' || hasValidCheckDigit(normalizeOrgNumber(value, market)))

/**
 * As it is printed: Norway's in groups of three (123 456 789), Sweden's with its hyphen
 * (556677-8899), the United Kingdom's as Companies House prints it (01234567, SC123456), Germany's
 * with its prefix and groups of three (DE 136 695 976). The four cannot be confused: nine digits,
 * ten, eight characters, and DE and nine.
 */
export function formatOrgNumber(orgNumber: string | null): string | null {
  if (!orgNumber) return null
  const digits = orgNumber.replace(/\s/g, '')
  if (/^DE\d{9}$/.test(digits)) return `DE ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  if (/^\d{9}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  if (/^\d{10}$/.test(digits)) return `${digits.slice(0, 6)}-${digits.slice(6)}`
  return orgNumber
}
