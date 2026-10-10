/**
 * A UK VAT registration number as save_billing stores it (0227, D-274): spaces, dots and dashes
 * dropped, upper case, GB in front of nine or twelve bare digits. The database is the rule; this only
 * shows the form what it kept, and tests/unit/billing-gb.test.ts holds the two to the same result.
 */
export function vatNumberAsStored(input: string): string {
  const v = input.replace(/[\s.\-]/g, '').toUpperCase()
  return /^(\d{9}|\d{12})$/.test(v) ? `GB${v}` : v
}
