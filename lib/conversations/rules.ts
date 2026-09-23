/**
 * "Late" is the bundle's own rule (line 3690): unanswered, not closed, and five days or
 * more. Five, not a round week — a comment that has sat unanswered for a working week is
 * the thing the screen exists to prevent, and the design picked the number. Shared so
 * Samtaler and Resultat cannot disagree about which comment is overdue.
 */
export const LATE_AFTER_DAYS = 5

/** The tone chips' fills, the design's (bundle 3690 and the themes list): one per reading. */
export const TONE_STYLE = {
  negativ: { background: '#FBD5C4', color: '#6B240C' },
  noytral: { background: '#FBEBBE', color: '#5C4600' },
  blandet: { background: '#FBEBBE', color: '#5C4600' },
  positiv: { background: '#CFE7E4', color: '#20431C' },
} as const

export type ThemeTone = keyof typeof TONE_STYLE

/**
 * A theme's tone, from how the answers under its comments fall — counted by
 * `comment_themes` (0030), never read from the text. Two thirds or more at one end names
 * that end; two thirds or more in the middle is "Nøytral"; anything else is "Blandet", the
 * design's word for a theme people disagree about.
 */
export function themeTone(counts: { low: number; mid: number; high: number }): ThemeTone {
  const total = counts.low + counts.mid + counts.high
  if (total === 0) return 'blandet'
  if (counts.low * 3 >= total * 2) return 'negativ'
  if (counts.high * 3 >= total * 2) return 'positiv'
  if (counts.mid * 3 >= total * 2) return 'noytral'
  return 'blandet'
}
