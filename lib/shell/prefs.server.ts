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

export async function getShellPrefs(): Promise<ShellPrefs> {
  const [jar, role, org] = await Promise.all([cookies(), getViewerRole(), getOrganization()])
  return parsePrefs((name) => jar.get(name)?.value, defaultView(role, org?.employee_count ?? null))
}
