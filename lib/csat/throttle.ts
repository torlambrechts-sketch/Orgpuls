import 'server-only'

/**
 * A per-network limit on the rating page (0135), in memory, for the reason lib/brreg/throttle.ts
 * gives: a counting table would need a function anon may call, and then anyone could spend
 * another person's allowance. The database adds a global backstop (200 misses in ten minutes,
 * app.csat_limited), which holds however the calls are spread. The network is the address cut to
 * /24 or /48, and lives only as long as the instance.
 */
const LIMIT = 30
const WINDOW_MS = 10 * 60 * 1000
const MAX_KEYS = 5000

const hits = new Map<string, { count: number; windowStart: number }>()

/** `true` if this network may open or submit another rating now. Counts the attempt either way. */
export function csatAllowed(network: string, now = Date.now()): boolean {
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
export function resetCsatThrottle() {
  hits.clear()
}
