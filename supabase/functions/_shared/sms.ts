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
 * Norwegian numbers are what people type: "912 34 567", "+47 912 34 567", "0047 91234567".
 * An eight-digit number is taken as Norwegian only if it starts with 4 or 9, the mobile
 * ranges; a landline cannot receive an SMS, and guessing a country for anything else would
 * send a survey link to a stranger. Returns null for anything that is not a usable number.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  let s = input.trim().replace(/[\s\-().]/g, '')
  if (s === '') return null
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (/^[49]\d{7}$/.test(s)) return `+47${s}`
  if (/^47[49]\d{7}$/.test(s)) return `+${s}`
  if (/^\+47\d{8}$/.test(s)) return /^\+47[49]/.test(s) ? s : null
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s
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
