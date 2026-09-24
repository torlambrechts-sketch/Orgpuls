/**
 * How the shell is laid out for this person: design 3's Enkel/Full switch, its top or
 * side navigation, and whether the side rail is drawn narrow. D-70.
 *
 * These are conveniences, not data: nothing here is about the organisation or anyone's
 * answers, and losing them costs one click. So they live in first-party cookies the
 * server reads. A cookie lets the first paint already have the right layout, with no
 * flash from a client-side read and no database round trip on every page view. Values are
 * parsed, never trusted: anything unrecognised falls back to the default.
 *
 * Shared by the server reader and the client context, so the names and values cannot
 * drift between the side that writes them and the side that reads them.
 */
export type ViewMode = 'enkel' | 'full'
export type Layout = 'top' | 'side'
export type Rail = 'open' | 'closed'

export interface ShellPrefs {
  view: ViewMode
  layout: Layout
  rail: Rail
}

export const PREF_COOKIE = { view: 'op_view', layout: 'op_layout', rail: 'op_rail' } as const

const VALUES = {
  view: ['enkel', 'full'],
  layout: ['top', 'side'],
  rail: ['open', 'closed'],
} as const

/**
 * Parses stored values over the defaults. `view` has no default of its own: whether a
 * person starts in Enkel is decided by the caller (design 3 starts a small organisation's
 * daglig leder there), so it is passed in.
 */
export function parsePrefs(read: (name: string) => string | undefined, defaultView: ViewMode): ShellPrefs {
  const pick = <K extends keyof typeof VALUES>(key: K, fallback: (typeof VALUES)[K][number]) => {
    const v = read(PREF_COOKIE[key])
    return ((VALUES[key] as readonly string[]).includes(v ?? '') ? v : fallback) as (typeof VALUES)[K][number]
  }
  return { view: pick('view', defaultView), layout: pick('layout', 'top'), rail: pick('rail', 'open') }
}

/** A year; a preference nobody touches for a year may as well return to the default. */
export const PREF_MAX_AGE = 60 * 60 * 24 * 365
