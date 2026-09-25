import { currentUtm, referrerHost } from './utm'

/**
 * The public site's own page views and "Kom i gang" clicks (D-91). They go to /api/wv, which
 * passes them to `track_web_event` (0050). The body says which page and which campaign, and
 * the host that referred the visit. The server adds a visitor hash that changes every day,
 * and stores no address, no user agent and no cookie.
 *
 * A browser that asks not to be tracked (Global Privacy Control, Do Not Track) sends nothing.
 */
export type BeaconKind = 'view' | 'cta'
export type BeaconBody = { k: BeaconKind; p: string; r?: string; u?: Record<string, string>; l?: string }

export function beaconBody(
  kind: BeaconKind,
  path: string,
  referrer: string,
  self: string,
  utm: Record<string, string>,
  label?: string,
): BeaconBody {
  const body: BeaconBody = { k: kind, p: path.slice(0, 160) }
  const r = referrerHost(referrer, self)
  if (r) body.r = r
  if (Object.keys(utm).length) body.u = utm
  if (label) body.l = label
  return body
}

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1'
}

export function sendBeacon(kind: BeaconKind, label?: string): void {
  try {
    // a capability link carries a token in its path; the server drops these too
    if (optedOut() || /^\/(s|bli-med|auth|admin)(\/|$)/.test(window.location.pathname)) return
    const body = JSON.stringify(
      beaconBody(
        kind,
        window.location.pathname,
        document.referrer,
        window.location.hostname,
        currentUtm() as Record<string, string>,
        label,
      ),
    )
    const blob = new Blob([body], { type: 'application/json' })
    if (!navigator.sendBeacon?.('/api/wv', blob)) {
      void fetch('/api/wv', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(
        () => {},
      )
    }
  } catch {
    // analytics never breaks a page
  }
}
