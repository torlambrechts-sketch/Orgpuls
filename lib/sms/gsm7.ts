// relative, not @/: scripts/verify/i18n.mjs loads this through tsx from any working directory
import { smsLength } from '../../supabase/functions/_shared/sms'

/**
 * GSM-7 (3GPP TS 23.038) for text we write and text organisations write.
 *
 * The alphabet is not repeated here: it is the one supabase/functions/_shared/sms.ts bills
 * with, so what the i18n gate calls GSM-7 is exactly what the dispatcher sends as GSM-7. One
 * character outside it and the whole message goes out as UCS-2, 70 characters a part instead
 * of 160; the default invitation is two parts in GSM-7 and would be three.
 */

/** The distinct characters in `text` that force UCS-2, in order of appearance. */
export function nonGsm7(text: string): string[] {
  return [...new Set([...text].filter((c) => smsLength(c).unicode))]
}

export function isGsm7(text: string): boolean {
  return !smsLength(text).unicode
}

// Typographic quotes, as phones, Word and macOS substitute them while you type. None is in
// GSM-7; their ASCII forms are. Guillemets are the Norwegian quotes, and they are not in
// GSM-7 either.
const SINGLE = /[‘’‚‛′‹›´`]/g // ‘ ’ ‚ ‛ ′ ‹ › ´ `
const DOUBLE = /[“”„‟″«»]/g // “ ” „ ‟ ″ « »

/** Typographic quotes → ASCII ' and ". The length is unchanged: one character for one. */
export function asciiQuotes(text: string): string {
  return text.replace(SINGLE, "'").replace(DOUBLE, '"')
}
