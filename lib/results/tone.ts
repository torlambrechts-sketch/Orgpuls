/**
 * How a result is coloured and signed. Presentation only: nothing in the database
 * branches on these, and the number they are applied to is always the server's.
 *
 * Kept apart from `read.ts`, which is server-only, because Resultater's workspace is a
 * client component and colours its cells as the selection moves.
 */

/**
 * The heat-map cell palette, transcribed from the bundle's `tone()` (v3 line 4121).
 *
 * Five steps rather than the three risk bands, because the grid is read as a picture:
 * the extra steps are what make a 31 legible against a 47 at a glance.
 */
export function heatTone(index: number): { bg: string; fg: string } {
  if (index < 40) return { bg: '#E38258', fg: '#4A1706' }
  if (index < 50) return { bg: '#EC9B77', fg: '#5E1F09' }
  if (index < 62) return { bg: '#F5DC96', fg: '#5C4600' }
  if (index < 72) return { bg: '#CFE7E4', fg: '#20431C' }
  return { bg: '#B5DAD4', fg: '#20431C' }
}

/** The delta colour from the bundle: a fall of 3 or more is rust, a rise of 3 or more green. */
export function deltaColour(delta: number): string {
  if (delta <= -3) return '#A33A16'
  if (delta >= 3) return '#2F5D2A'
  return '#5F5849'
}

/**
 * A signed delta with a typographic minus. Design 2 kept the minus on zero ("−0", its
 * line 3046); design 3's `fmt` prints "±0". Both are reproduced where each is drawn.
 */
export function signedDelta(delta: number): string {
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`
}

/** Design 3's `fmt`: "+3", "−3", "±0". */
export function fmtDelta(delta: number): string {
  return `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)}`
}
