import 'server-only'

/**
 * A per-network limit on the QR page's "send me my link" (0076, D-126), in front of the
 * database's own limits (ten minutes per person and round, and a ceiling per organisation
 * and hour). The reasoning is lib/brreg/throttle.ts's: in memory, keyed by /24 or /48 and
 * never by the whole address, so it throttles without keeping a visitor log.
 *
 * Ten tries in ten minutes is generous for a person who mistypes their number twice and
 * tight for somebody walking a list.
 */
const LIMIT = 10
const WINDOW_MS = 10 * 60 * 1000
const MAX_KEYS = 5000

const hits = new Map<string, { count: number; windowStart: number }>()

/** `true` if this network may ask again now. Counts the attempt either way. */
export function entryAllowed(network: string, now = Date.now()): boolean {
  const entry = hits.get(network)
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    if (hits.size >= MAX_KEYS) {
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
export function resetEntryThrottle() {
  hits.clear()
}
