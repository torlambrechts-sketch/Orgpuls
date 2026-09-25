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

/**
 * The first page of the visit: where the tab landed, the host that sent it and the tags it
 * carried (D-91). Kept once per tab, beside the tags, so a sign-up later in the visit can be
 * attributed to its first touch as well as its last. The referrer is a host only; a full
 * referring URL can carry someone else's query string.
 */
const FIRST = 'op_first'
export type FirstTouch = Utm & { landing?: string; referrer?: string }

export function referrerHost(referrer: string, self: string): string | undefined {
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    return host && host !== self.toLowerCase() ? host : undefined
  } catch {
    return undefined
  }
}

export function rememberFirstTouch(): void {
  try {
    if (window.sessionStorage.getItem(FIRST)) return
    const first: FirstTouch = {
      landing: window.location.pathname.slice(0, 160),
      referrer: referrerHost(document.referrer, window.location.hostname),
      ...utmFrom(window.location.search),
    }
    window.sessionStorage.setItem(FIRST, JSON.stringify(first))
  } catch {
    // as above: without storage the sign-up is simply unattributed
  }
}

export function firstTouch(): FirstTouch {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(FIRST) ?? '{}')
    if (!raw || typeof raw !== 'object') return {}
    const r = raw as Record<string, unknown>
    const out: FirstTouch = {}
    for (const k of [...UTM_KEYS, 'landing', 'referrer'] as const) {
      const v = r[k]
      if (typeof v === 'string' && v) out[k] = v.slice(0, k === 'landing' || k === 'referrer' ? 160 : MAX)
    }
    return out
  } catch {
    return {}
  }
}
