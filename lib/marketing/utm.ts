/**
 * Campaign tags (utm_*) from the address a visitor is on.
 *
 * Only the five standard keys, each capped in length: a tag is a campaign name, and
 * nothing longer or other belongs in an analytics event.
 *
 * **Nothing is kept on the device (D-104).** The tags and the visit's first page used to
 * live in sessionStorage so the signup form could send them. Ekomlov § 3-15 asks consent for
 * storing anything on the user's device, not only cookies, so they are no longer stored: a
 * page's analytics events carry the tags of its own address (lib/marketing/events.ts), and the
 * site's own beacon that once read the signup's first touch from them is gone (D-230).
 */
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>

const MAX = 80

export function utmFrom(search: string): Utm {
  const params = new URLSearchParams(search)
  const out: Utm = {}
  for (const k of UTM_KEYS) {
    const v = params.get(k)?.trim()
    if (v) out[k] = v.slice(0, MAX)
  }
  return out
}

/** The tags of the current address, if it has any. */
export function currentUtm(): Utm {
  return utmFrom(window.location.search)
}
