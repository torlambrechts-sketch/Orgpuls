/**
 * Campaign tags (utm_*) from the address a visitor arrived on, kept for the rest of the
 * visit so that a sign-up can be attributed to the page and campaign that started it.
 *
 * Only the five standard keys, each capped in length: a tag is a campaign name, and
 * nothing longer or other belongs in an analytics event. They live in sessionStorage,
 * which ends with the tab, and are sent nowhere except as properties of the site's own
 * conversion events (lib/marketing/events).
 */
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>

const STORE = 'op_utm'
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

/** Stores the tags of the current address, if it has any; a later page without them keeps the first. */
export function rememberUtm(): void {
  const utm = utmFrom(window.location.search)
  if (!Object.keys(utm).length) return
  try {
    window.sessionStorage.setItem(STORE, JSON.stringify(utm))
  } catch {
    // storage refused (private mode, quota): attribution is a nicety, not a requirement
  }
}

/** The current address's tags, or the ones remembered from where the visit began. */
export function currentUtm(): Utm {
  const here = utmFrom(window.location.search)
  if (Object.keys(here).length) return here
  try {
    return utmFrom(new URLSearchParams(JSON.parse(window.sessionStorage.getItem(STORE) ?? '{}')).toString())
  } catch {
    return {}
  }
}
