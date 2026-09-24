import 'server-only'
import { cookies } from 'next/headers'
import { parsePrefs, type ShellPrefs, type ViewMode } from './prefs'

/**
 * The shell's layout preferences for this request (lib/shell/prefs.ts).
 *
 * Until Oversikt exists (design 3's P2) nobody starts in Enkel: the switch works and is
 * remembered, but the default is Full, because Enkel's landing page is Oversikt and
 * showing its two-item nav over the Full Innsikt would be neither design. D-70.
 */
export async function getShellPrefs(): Promise<ShellPrefs> {
  const jar = await cookies()
  const defaultView: ViewMode = 'full'
  return parsePrefs((name) => jar.get(name)?.value, defaultView)
}
