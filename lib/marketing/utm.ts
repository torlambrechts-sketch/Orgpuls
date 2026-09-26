/**
 * Campaign tags (utm_*) from the address a visitor is on.
 *
 * Only the five standard keys, each capped in length: a tag is a campaign name, and
 * nothing longer or other belongs in an analytics event.
 *
 * **Nothing is kept on the device (D-104).** The tags and the visit's first page used to
 * live in sessionStorage so the signup form could send them. Ekomlov § 3-15 asks consent for
 * storing anything on the user's device, not only cookies, so they are no longer stored:
 * each page's beacon carries the tags of its own address, and the signup's first and last
 * touch are read on the server from the events those beacons left (0059).
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

/** The referring host, or nothing when it is this site or not a URL. A full referring URL can carry someone else's query string. */
export function referrerHost(referrer: string, self: string): string | undefined {
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    return host && host !== self.toLowerCase() ? host : undefined
  } catch {
    return undefined
  }
}
