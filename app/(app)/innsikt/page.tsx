import { cookies } from 'next/headers'
import { Avansert } from '@/components/innsikt/Avansert'
import { Enkel } from '@/components/innsikt/Enkel'
import { ModeSwitch } from '@/components/innsikt/ModeSwitch'
import { avansertView, enkelView } from '@/lib/innsikt/home'
import { INNSIKT_COOKIE, parseInnsiktMode } from '@/lib/innsikt/mode'
import { getShellPrefs } from '@/lib/shell/prefs.server'

/**
 * Innsikt, the home screen: Enkel or Avansert (Orgpuls.dc.html 134-332, D-244). It replaces both
 * design 3's Oversikt and the earlier Innsikt (Tor, 7 October 2026): one address, two views, the
 * choice kept beside the screen. Unset, the view follows the shell – Full opens on Avansert.
 *
 * The figures are read in lib/innsikt/home.ts; the rendering is in components/innsikt.
 */
export const dynamic = 'force-dynamic'

export default async function InnsiktPage() {
  const [jar, prefs] = await Promise.all([cookies(), getShellPrefs()])
  const mode = parseInnsiktMode(jar.get(INNSIKT_COOKIE)?.value, prefs.view)

  if (mode === 'avansert') {
    const view = await avansertView()
    return (
      <main className="animate-entry mx-auto max-w-page">
        <ModeSwitch mode={mode} labels={view.mode} />
        <Avansert view={view} />
      </main>
    )
  }
  const view = await enkelView()
  return (
    <main className="animate-entry mx-auto max-w-page">
      <ModeSwitch mode={mode} labels={view.mode} />
      <Enkel view={view} />
    </main>
  )
}
