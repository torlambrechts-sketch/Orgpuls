import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import { AppHeader } from '@/components/shell/AppHeader'
import { AccessNotice } from '@/components/shell/AccessNotice'
import { AppFooter } from '@/components/shell/AppFooter'
import { ShellFrame } from '@/components/shell/ShellFrame'
import { ShellPrefsProvider } from '@/components/shell/ShellPrefs'
import { SideRail } from '@/components/shell/SideRail'
import { NAV_ROUTES, type NavEntry } from '@/lib/shell/nav'
import { getShellPrefs } from '@/lib/shell/prefs.server'
import { getUnansweredCount } from '@/lib/shell/read'
import { getWizardGate } from '@/lib/wizard/read'
import { WizardProvider } from '@/components/veiviser/WizardProvider'

/**
 * The signed-in shell. Every application screen renders inside this, so the header, the
 * side rail and the footer are built and verified once rather than per screen.
 *
 * The nav model is read here once and handed to both the top bar and the rail, so the two
 * layouts cannot disagree. The layout preferences come from cookies (lib/shell/prefs.ts),
 * so the first paint is already in the chosen layout. D-70.
 *
 * Over the screens, only once a trial has ended unconfirmed, a line about what still works
 * (AccessNotice, D-94).
 *
 * The page background is #FCF6E9 from globals.css; the header, rail and footer are
 * #FFFDF6, and that contrast is what separates the chrome from the content in the design.
 */
const ASSISTANT_FACE = 'av4'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations()
  const [prefs, unanswered, wizard, messages] = await Promise.all([
    getShellPrefs(),
    getUnansweredCount(),
    getWizardGate(),
    getMessages(),
  ])

  const items: NavEntry[] = NAV_ROUTES.map((r) => ({
    ...r,
    label: t(`nav.${r.key}`),
    enkelLabel: r.key === 'innsikt' ? t('nav.oversikt') : undefined,
    badge: r.key === 'kommentarer' && unanswered > 0 ? unanswered : null,
    badgeAria: r.key === 'kommentarer' ? t('nav.badgeAria', { count: unanswered }) : undefined,
  }))

  return (
    // the application's client screens read from most of the catalogue, so it gets all of it (lib/i18n/client)
    <NextIntlClientProvider messages={messages}>
      <ShellPrefsProvider initial={prefs}>
        <WizardProvider gate={wizard} face={ASSISTANT_FACE}>
          <ShellFrame
            rail={<SideRail items={items} assistantFace={ASSISTANT_FACE} />}
            header={<AppHeader items={items} assistantFace={ASSISTANT_FACE} />}
            footer={<AppFooter />}
          >
            <AccessNotice />
            {children}
          </ShellFrame>
        </WizardProvider>
      </ShellPrefsProvider>
    </NextIntlClientProvider>
  )
}
