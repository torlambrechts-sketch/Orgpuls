import { utmFrom } from '@/lib/marketing/utm'

/**
 * What an analytics event may say about where it happened.
 *
 * Vercel Web Analytics and Speed Insights report the URL of every page view and every
 * vitals sample. Two things in this product's URLs must not travel:
 *
 * 1. **The respondent's link.** `/s/<token>` carries the capability token a respondent
 *    answers with (review S4). It is a credential, and a page view on it is also a fact
 *    about when somebody answered — invariant 2's reason for truncating `submitted_hour`
 *    to the hour. Nothing under `/s/` is reported at all: the event is dropped, not
 *    redacted, because a redacted event still carries the timestamp.
 * 2. **Query strings.** `?maling=<round id>`, `?runde=`, `?fane=` are ids and screen state,
 *    not identities, but nothing in the product needs them counted, and dropping them means
 *    no future parameter can leak something by being added. Fragments go the same way.
 *    The one exception is a campaign's tags, the five standard `utm_*` keys, kept by name
 *    and capped in length (lib/marketing/utm), so a visit can be traced to the campaign
 *    that brought it. Nothing else survives, `?orgnr=` on /registrer included.
 *
 * What remains is the origin, the path and those tags: which screen was viewed, which is
 * what the dashboard is for. `null` means "do not send".
 */
export function scrubUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (isRespondentPath(parsed.pathname)) return null
  const utm = new URLSearchParams(utmFrom(parsed.search)).toString()
  return `${parsed.origin}${parsed.pathname}${utm ? `?${utm}` : ''}`
}

/**
 * A path that carries a capability token: the respondent's link (`/s/<token>`) and a
 * member invitation (`/bli-med/<token>`, 0028). Neither is ever reported.
 */
const CAPABILITY_PREFIXES = ['/s', '/bli-med']

export function isRespondentPath(pathname: string): boolean {
  return CAPABILITY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
