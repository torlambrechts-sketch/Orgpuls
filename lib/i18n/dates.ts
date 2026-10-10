/**
 * How the product writes a date and a time (UK-E, D-273): in the reader's language, on the
 * organisation's clock.
 *
 * - **The language's form.** The catalogue's English is British English, so its dates are British
 *   too: «14 September 2026», «02:00», never the American «September 14, 2026», «02:00 AM» that
 *   `Intl` gives a bare `en`. Every other language is formatted as its own code says, so Norway's
 *   screens are exactly what they were.
 * - **The organisation's clock.** A time is shown in the organisation's own time zone
 *   (app.organizations.timezone, which a new organisation takes from its market: 0214, 0218, 0222).
 *   Where no organisation is known, the market's (lib/markets.ts MARKET_TIME_ZONE). «Today», the day
 *   a deadline passes, and the hour of the greeting follow the same clock.
 *
 * The server side (the zone of this request) is lib/i18n/dates-server.ts. Edge-safe.
 */

/** The tag `Intl` formats a locale's dates in: British English for English, the code itself otherwise */
export const intlLocale = (locale: string): string => (locale === 'en' ? 'en-GB' : locale)

/** A day as YYYY-MM-DD on a clock: what a date column holds, for comparing with one */
export const isoDay = (timeZone: string, at: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(at)

/** The reader's form and the organisation's clock, as a screen passes them on */
export type Dates = { locale: string; timeZone: string }

/** A formatter in a reader's form, on a clock */
export const dateFormat = (dates: Dates, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(dates.locale, { timeZone: dates.timeZone, ...options })
