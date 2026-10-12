import { normalizePhone } from '@/supabase/functions/_shared/sms'

/**
 * What a person types on the QR page, as the database compares it (0076): an e-mail address
 * in lower case, or a mobile number in E.164 by the register's own rule (normalizePhone), so
 * a number typed here matches the one stored there. A number without its country code is read by
 * the market the page is in (D-280), as Oppsett reads one by the organisation's. Anything else is
 * `null`, and the page asks again.
 */
export type Contact = { kind: 'email' | 'phone'; value: string }

export function contactOf(input: string, market: string = 'no'): Contact | null {
  const raw = input.trim()
  if (raw.length === 0 || raw.length > 254) return null
  if (raw.includes('@')) {
    const email = raw.toLowerCase()
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? { kind: 'email', value: email } : null
  }
  const phone = normalizePhone(raw, market)
  return phone ? { kind: 'phone', value: phone } : null
}
