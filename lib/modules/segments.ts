/**
 * The rule a segment filter obeys (A7; the SQL twin is app.segment_cell_ok in 0070): within a
 * group, a segment is shown only when both the segment's part of the group and the rest of it
 * have at least k answers. With only the first, "group" minus "group ∩ segment" gives the rest
 * away. Behind `module_segments`; nothing shows segments yet.
 */
export function segmentCellOk(threshold: number, inSegment: number, inGroup: number): boolean {
  const k = Math.max(threshold, 5)
  return inSegment >= k && inGroup - inSegment >= k
}
