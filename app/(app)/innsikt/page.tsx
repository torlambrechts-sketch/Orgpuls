import { cookies } from 'next/headers'
import { Avansert } from '@/components/innsikt/Avansert'
import { Enkel } from '@/components/innsikt/Enkel'
import { ModeSwitch } from '@/components/innsikt/ModeSwitch'
import { avansertView, enkelView } from '@/lib/innsikt/home'
import { INNSIKT_COOKIE, parseInnsiktMode } from '@/lib/innsikt/mode'
import { innsiktDefault } from '@/lib/shell/prefs.server'

/**
 * Innsikt, the home screen: Enkel or Avansert (Orgpuls.dc.html 134-332, D-244). It replaces both
 * design 3's Oversikt and the earlier Innsikt (Tor, 7 October 2026): one address, two views, the
 * choice kept beside the screen. Unset, a small organisation's daglig leder opens on Enkel and
 * everyone else on Avansert (D-247).
 *
 * The figures are read in lib/innsikt/home.ts; the rendering is in components/innsikt.
 */
export const dynamic = 'force-dynamic'

export default async function InnsiktPage() {
  const [jar, fallback] = await Promise.all([cookies(), innsiktDefault()])
  const mode = parseInnsiktMode(jar.get(INNSIKT_COOKIE)?.value, fallback)

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
