import 'server-only'

/**
 * A per-address limit on the public registry lookup. S5 in docs/CODE_REVIEW_2026-09-23.md.
 *
 * **Why in memory, and not a table.** The review first sketched a throttle table in
 * Postgres. It would have been worse than the problem: this project has no service-role
 * key by design, so the counting function would have to be callable by `anon` — and then
 * anybody could call it directly with *another person's* address and lock them out of
 * sign-up. That is a new endpoint and a new abuse to defend a low-severity issue.
 *
 * In memory it adds nothing reachable. Vercel reuses warm instances across requests, so a
 * burst from one source meets the same counter; a caller spread across many instances or
 * addresses gets through, and meets the check digit instead (lib/brreg/lookup.ts), which
 * refuses ten of every eleven enumerated numbers without an outbound call. The two
 * together blunt enumeration; neither pretends to be a firewall.
 *
 * **The address is never stored whole.** It is cut to its network — /24 for IPv4, /48 for
 * IPv6 — before it becomes a key, so this map is a throttle and not a visitor log, and it
 * lives only as long as the instance does.
 */

const LIMIT = 20
const WINDOW_MS = 10 * 60 * 1000
const MAX_KEYS = 5000

const hits = new Map<string, { count: number; windowStart: number }>()

/** The network an address belongs to; `unknown` when there is no address to go on. */
export function networkOf(address: string | null | undefined): string {
  const first = (address ?? '').split(',')[0]?.trim() ?? ''
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(first)) return first.split('.').slice(0, 3).join('.') + '.0/24'
  if (first.includes(':')) return first.split(':').slice(0, 3).join(':') + '::/48'
  return 'unknown'
}

/** `true` if this network may make another lookup now. Counts the attempt either way. */
export function lookupAllowed(network: string, now = Date.now()): boolean {
  const entry = hits.get(network)
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    if (hits.size >= MAX_KEYS) {
      // bounded memory: drop every expired window before admitting a new key
      for (const [key, value] of hits) if (now - value.windowStart >= WINDOW_MS) hits.delete(key)
      if (hits.size >= MAX_KEYS) return false
    }
    hits.set(network, { count: 1, windowStart: now })
    return true
  }
  entry.count += 1
  return entry.count <= LIMIT
}

/** For tests only. */
export function resetLookupThrottle() {
  hits.clear()
}
