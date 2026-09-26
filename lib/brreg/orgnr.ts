/**
 * The organisation number's check digit (modulus 11, weights 3 2 7 6 5 4 3 2): a remainder of
 * 0 gives 0, a result of 10 cannot exist. Pure and client-safe, so the start form on the public
 * pages can refuse a mistyped number before it leaves the browser; lib/brreg/lookup.ts uses the
 * same function before it asks the register.
 */
export function hasValidCheckDigit(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false
  const weights = [3, 2, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0)
  const rest = sum % 11
  const check = rest === 0 ? 0 : 11 - rest
  return check !== 10 && check === Number(digits[8])
}
