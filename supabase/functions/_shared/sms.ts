/**
 * SMS: numbers, length and the message itself. D-66.
 *
 * Pure like mail.ts: no imports, no runtime globals. The dispatcher sends with it, the SMS
 * screen counts with it, the Ansatte form normalises numbers with it, and
 * tests/unit/sms.test.ts proves all three against the same code.
 */

// ---------------------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------------------

/**
 * A mobile number as the register stores it: E.164, "+4791234567".
 *
 * A number with its country code ("+44 7700 900123", "0046 70 123 45 67") is kept as it is,
 * in any market. A number without one is read by the organisation's market (D-280), because
 * guessing a country for it would send a survey link to a stranger:
 *   - Norway: "912 34 567", an eight-digit number starting with 4 or 9, the mobile ranges (a
 *     landline cannot receive an SMS), or "47 912 34 567", the plus lost as a spreadsheet loses
 *     it — but not grouped as a North American area code («479 555 1234»: 474 and 479 are
 *     Canada's and Arkansas's), which is a US or Canadian number typed without +1;
 *   - the United Kingdom: "07700 900123", a UK mobile (07 then 1–5 or 7–9, or the Isle of Man's 07624);
 *   - Sweden: "070-123 45 67", a Swedish mobile (070, 072, 073, 076, 079).
 * Norway's forms are never read in another market. Returns null for anything that is not a
 * usable number.
 */
export function normalizePhone(input: string | null | undefined, market: string = 'no'): string | null {
  if (!input) return null
  const raw = input.trim()
  let s = raw.replace(/[\s\-().]/g, '')
  if (s === '') return null
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (/^\+47\d{8}$/.test(s)) return /^\+47[49]/.test(s) ? s : null
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s
  if (market === 'gb') return /^07([1-57-9]\d{8}|624\d{6})$/.test(s) ? `+44${s.slice(1)}` : null
  if (market === 'se') return /^07[02369]\d{7}$/.test(s) ? `+46${s.slice(1)}` : null
  // Germany (DE-B): a mobile number begins 015, 016 or 017 and has eleven or twelve digits with its leading zero
  if (market === 'de') return /^01[5-7]\d{8,9}$/.test(s) ? `+49${s.slice(1)}` : null
  if (/^[49]\d{7}$/.test(s)) return `+47${s}`
  if (/^47[49]\d{7}$/.test(s) && !/^\(?47[49]\)?[\s\-.]/.test(raw)) return `+${s}`
  return null
}

/** "+4791234567" -> "912 34 567"; foreign numbers are shown as stored. */
export function displayPhone(e164: string): string {
  const m = /^\+47(\d{3})(\d{2})(\d{3})$/.exec(e164)
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164
}

// ---------------------------------------------------------------------------------------
// Length. What an operator bills is segments, not characters.
// ---------------------------------------------------------------------------------------

// GSM 03.38 basic set (æøå, ÆØÅ are in it) and the extension set, which costs two
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
const GSM_EXTENDED = '^{}\\[~]|€'

export interface SmsLength {
  /** characters as the operator counts them (an extended GSM character counts twice) */
  chars: number
  /** billed messages */
  parts: number
  /** true when a character outside GSM-7 forces UCS-2, which cuts a message to 70 */
  unicode: boolean
}

export function smsLength(text: string): SmsLength {
  let gsm = true
  let chars = 0
  for (const c of text) {
    if (GSM_BASIC.includes(c)) chars += 1
    else if (GSM_EXTENDED.includes(c)) chars += 2
    else {
      gsm = false
      break
    }
  }
  if (!gsm) {
    const n = [...text].length
    return { chars: n, parts: n <= 70 ? 1 : Math.ceil(n / 67), unicode: true }
  }
  return { chars, parts: chars <= 160 ? 1 : Math.ceil(chars / 153), unicode: false }
}

// ---------------------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------------------

export const SMS_TEXT_MAX = 300

/**
 * The organisation's own text, or the default, with the personal link after it — the
 * design's rule: "Den personlige lenken legges til automatisk til slutt."
 */
export function smsContent(text: string, link: string): string {
  const t = text.trim()
  return t === '' ? link : `${t} ${link}`
}
