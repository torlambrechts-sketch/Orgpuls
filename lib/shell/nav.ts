import type { Route } from 'next'
import type { ViewMode } from './prefs'

/**
 * Design 3's navigation: six screens, the same list in the top bar and in the side rail.
 *
 * One model for both, so the two layouts cannot disagree about what is where. The labels
 * are resolved on the server (next-intl); the icon glyphs are the design's own and carry no
 * words, so they are not messages. `badge` is a count the server read, or null for none.
 */
export type NavKey = 'innsikt' | 'malinger' | 'resultater' | 'kommentarer' | 'tiltak' | 'oppsett'

export interface NavEntry {
  key: NavKey
  href: Route
  label: string
  /** Innsikt's label in Enkel, where it is the whole product: "Oversikt" */
  enkelLabel?: string
  icon: string
  badge: number | null
  badgeAria?: string
}

export const NAV_ROUTES: { key: NavKey; href: Route; icon: string }[] = [
  { key: 'innsikt', href: '/innsikt', icon: '◉' },
  { key: 'malinger', href: '/malinger', icon: '◷' },
  { key: 'resultater', href: '/resultater', icon: '▤' },
  { key: 'kommentarer', href: '/kommentarer', icon: '❝' },
  { key: 'tiltak', href: '/tiltak', icon: '✓' },
  { key: 'oppsett', href: '/oppsett', icon: '⚙' },
]

/** In Enkel the nav is Oversikt and Oppsett, nothing else (design 3, `simpleMode`). */
export const ENKEL_KEYS: NavKey[] = ['innsikt', 'oppsett']

/**
 * Screens reached from Målinger keep it tinted without being it: the design keeps the
 * trail visible (bundle 3, `n.bg`: result, respond, plan, wheel).
 */
const UNDER: Partial<Record<NavKey, string[]>> = {
  malinger: ['/malinger/', '/maleoppsett', '/arshjulet', '/forhandsvis'],
}

const matches = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`)

/** `current`: this is the screen. `trail`: a screen under it. Neither: plain. */
export function navState(entry: { key: NavKey; href: string }, pathname: string): 'current' | 'trail' | null {
  if (matches(pathname, entry.href)) return 'current'
  if (UNDER[entry.key]?.some((p) => pathname.startsWith(p))) return 'trail'
  return null
}

export function visibleNav(entries: NavEntry[], view: ViewMode): NavEntry[] {
  return view === 'enkel' ? entries.filter((e) => ENKEL_KEYS.includes(e.key)) : entries
}

export const labelOf = (entry: NavEntry, view: ViewMode) =>
  view === 'enkel' && entry.enkelLabel ? entry.enkelLabel : entry.label
