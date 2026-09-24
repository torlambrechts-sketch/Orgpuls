import { getTranslations } from 'next-intl/server'
import { AppHeader } from '@/components/shell/AppHeader'
import { AppFooter } from '@/components/shell/AppFooter'
import { ShellFrame } from '@/components/shell/ShellFrame'
import { ShellPrefsProvider } from '@/components/shell/ShellPrefs'
import { SideRail } from '@/components/shell/SideRail'
import { NAV_ROUTES, type NavEntry } from '@/lib/shell/nav'
import { getShellPrefs } from '@/lib/shell/prefs.server'
import { getUnansweredCount } from '@/lib/shell/read'

/**
 * The signed-in shell. Every application screen renders inside this, so the header, the
 * side rail and the footer are built and verified once rather than per screen.
 *
 * The nav model is read here once and handed to both the top bar and the rail, so the two
 * layouts cannot disagree. The layout preferences come from cookies (lib/shell/prefs.ts),
 * so the first paint is already in the chosen layout. D-70.
 *
 * The page background is #FCF6E9 from globals.css; the header, rail and footer are
 * #FFFDF6, and that contrast is what separates the chrome from the content in the design.
 */
const ASSISTANT_FACE = 'av4'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations()
  const [prefs, unanswered] = await Promise.all([getShellPrefs(), getUnansweredCount()])

  const items: NavEntry[] = NAV_ROUTES.map((r) => ({
    ...r,
    label: t(`nav.${r.key}`),
    enkelLabel: r.key === 'innsikt' ? t('nav.oversikt') : undefined,
    badge: r.key === 'kommentarer' && unanswered > 0 ? unanswered : null,
    badgeAria: r.key === 'kommentarer' ? t('nav.badgeAria', { count: unanswered }) : undefined,
  }))

  return (
    <ShellPrefsProvider initial={prefs}>
      <ShellFrame
        rail={<SideRail items={items} assistantFace={ASSISTANT_FACE} />}
        header={<AppHeader items={items} assistantFace={ASSISTANT_FACE} />}
        footer={<AppFooter />}
      >
        {children}
      </ShellFrame>
    </ShellPrefsProvider>
  )
}
