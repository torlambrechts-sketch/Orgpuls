import 'server-only'
import { cookies } from 'next/headers'
import { getOrganization, getViewerRole } from '@/lib/org/read'
import { parsePrefs, type ShellPrefs, type ViewMode } from './prefs'

/**
 * The shell's layout preferences for this request (lib/shell/prefs.ts).
 *
 * Design 3 starts a daglig leder of an organisation with fewer than 50 employees in Enkel
 * (`simpleMode`: `emp < 50 && role === "Daglig leder"`): a small company's leader needs the
 * overview and the next step, not the analyses. Everyone else starts in Full. A choice the
 * person has made (the cookie) always wins over the default. D-71.
 */
export function defaultView(role: string | null, employees: number | null): ViewMode {
  return role === 'daglig_leder' && employees !== null && employees < 50 ? 'enkel' : 'full'
}

/**
 * The Enkel/Full switch waits (Tor, 7 October 2026, D-247): the header no longer offers it, and every
 * person is in Full whatever a cookie from before says, so nobody is left in a narrowed navigation
 * with no way out. The layout and the rail are still the person's.
 */
export async function getShellPrefs(): Promise<ShellPrefs> {
  const jar = await cookies()
  return { ...parsePrefs((name) => jar.get(name)?.value, 'full'), view: 'full' }
}

/**
 * The view Innsikt opens on until a person picks one (D-244, D-247): design 3's rule, which chose the
 * shell's view before, now chooses Innsikt's – a small organisation's daglig leder starts in Enkel.
 */
export async function innsiktDefault(): Promise<ViewMode> {
  const [role, org] = await Promise.all([getViewerRole(), getOrganization()])
  return defaultView(role, org?.employee_count ?? null)
}
