import { K_FLOOR } from '@/lib/org/threshold'

/**
 * The rule a segment filter obeys (A7; the SQL twin is app.segment_cell_ok, 0070 and 0150): within
 * a group, a segment is shown only when both the segment's part of the group and the rest of it
 * have at least k answers. With only the first, "group" minus "group ∩ segment" gives the rest
 * away. `threshold` is the round's own k (app.k_round): a round keeps the threshold it opened
 * with. Never below K_FLOOR. Behind `module_segments`; nothing shows segments yet.
 */
export function segmentCellOk(threshold: number, inSegment: number, inGroup: number): boolean {
  const k = Math.max(threshold, K_FLOOR)
  return inSegment >= k && inGroup - inSegment >= k
}
