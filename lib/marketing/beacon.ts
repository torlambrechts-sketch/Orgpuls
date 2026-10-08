import { PUBLIC_HOSTS } from '@/lib/hosts'
import { COLLECT_OVERRIDE, COLLECT_URL } from './collect'
import { currentUtm } from './utm'
import type { SiteEvent } from './events'

/**
 * The public site's own visit counting (D-248, after D-91 and D-230): a page view, a press on
 * anything that leads to /registrer, and the three conversion events. They go to Sentral's
 * `web-collect` (lib/marketing/collect), which drops bots, turns the address and the browser string
 * into a visitor code with a key that changes every day, and stores neither. Nothing is stored on the
 * device (D-104).
 *
 * The body says which page, which campaign brought the visit, and the host that referred it, once per
 * page load; an event says which, and for a press which button. Never who: no organisation number, no
 * name, no address, no query string.
 *
 * Nothing is sent from a browser that asks not to be tracked (Global Privacy Control, Do Not Track),
 * from a page that carries a capability (a respondent's or member's link, an entry code, sign-in), or
 * from a host that is not a production one (a preview, a local build) unless a test stack names its
 * own collector.
 */
export type BeaconBody =
  | { k: 'view'; p: string; r?: string; u?: Record<string, string> }
  | { k: 'cta'; p: string; l: string; u?: Record<string, string> }
  | { k: 'event'; p: string; e: SiteEvent; u?: Record<string, string> }

/** the paths web-collect refuses too: a capability token in the path, sign-in, or not the site */
const NEVER = /^\/(s|bli-med|r|inn|auth|admin|api|logg-inn|nytt-passord)(\/|$)/

export function referrerHost(referrer: string, self: string): string | undefined {
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    return host && host !== self.toLowerCase() ? host : undefined
  } catch {
    return undefined
  }
}

export function mayCount(host: string, path: string, optedOut: boolean, override = COLLECT_OVERRIDE): boolean {
  if (optedOut || NEVER.test(path)) return false
  return !!override || PUBLIC_HOSTS.includes(host.toLowerCase())
}

type Kind = { k: 'view' } | { k: 'cta'; l: string } | { k: 'event'; e: SiteEvent }

export function beaconBody(kind: Kind, path: string, utm: Record<string, string>, referrer?: string): BeaconBody {
  const p = path.slice(0, 160)
  const u = Object.keys(utm).length ? { u: utm } : {}
  if (kind.k === 'cta') return { k: 'cta', p, l: kind.l, ...u }
  if (kind.k === 'event') return { k: 'event', p, e: kind.e, ...u }
  return { k: 'view', p, ...(referrer ? { r: referrer } : {}), ...u }
}

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1'
}

// the referring host is the page load's, not every client-side navigation's after it
let referrerSent = false

export function sendBeacon(kind: Kind): void {
  try {
    const { hostname, pathname } = window.location
    if (!mayCount(hostname, pathname, optedOut())) return
    const referrer = kind.k === 'view' && !referrerSent ? referrerHost(document.referrer, hostname) : undefined
    if (kind.k === 'view') referrerSent = true
    const body = JSON.stringify(beaconBody(kind, pathname, currentUtm() as Record<string, string>, referrer))
    // not navigator.sendBeacon: it posts in no-cors mode, and under this site's `no-referrer` policy
    // such a request says `Origin: null`, which web-collect cannot place. A keepalive fetch in cors mode
    // says the real origin, survives the page being left, and text/plain needs no preflight.
    void fetch(COLLECT_URL, {
      method: 'POST',
      body,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'text/plain' },
    }).catch(() => {})
  } catch {
    // counting never breaks a page
  }
}
