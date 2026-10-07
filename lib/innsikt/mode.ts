/**
 * Innsikt's own view: Enkel or Avansert (D-244). The design keeps it beside the screen
 * (`ixMode`, «Visning»), separate from the shell's Enkel/Full: a person in Full may still want
 * the short page, and the other way round.
 *
 * Unset, design 3's rule decides: a small organisation's daglig leder opens on Enkel, everyone else
 * on Avansert (D-247; before, the shell's own Enkel/Full did). A choice the person makes is kept in a first-party cookie, read on the server so the first paint is the right
 * view – a convenience, like the shell's own preferences (lib/shell/prefs.ts).
 */
import type { ViewMode } from '@/lib/shell/prefs'

export type InnsiktMode = 'enkel' | 'avansert'

export const INNSIKT_COOKIE = 'op_innsikt'
export const INNSIKT_MODES: readonly InnsiktMode[] = ['enkel', 'avansert']

export function parseInnsiktMode(stored: string | undefined, shell: ViewMode): InnsiktMode {
  return (INNSIKT_MODES as readonly string[]).includes(stored ?? '') ? (stored as InnsiktMode) : shell === 'full' ? 'avansert' : 'enkel'
}
