import 'server-only'

/**
 * The network an address belongs to, for a per-address limit on a public endpoint (the QR entry,
 * lib/entry/throttle.ts). It began as the limit on the public registry lookup (S5 in
 * docs/CODE_REVIEW_2026-09-23.md), which went with the lookup step of the sign-up (0232, D-279);
 * the reasoning below is still the entry throttle's.
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

/** The network an address belongs to; `unknown` when there is no address to go on. */
export function networkOf(address: string | null | undefined): string {
  const first = (address ?? '').split(',')[0]?.trim() ?? ''
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(first)) return first.split('.').slice(0, 3).join('.') + '.0/24'
  if (first.includes(':')) return first.split(':').slice(0, 3).join(':') + '::/48'
  return 'unknown'
}
