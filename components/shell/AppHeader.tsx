import { getTranslations } from 'next-intl/server'
import { Logo } from './Logo'
import { AppNav, type NavItem as NavLink } from './AppNav'
import { HeaderBar } from './HeaderBar'
import { getShellContext } from '@/lib/shell/read'

/**
 * The application header. Transcribed from Orgpuls_Offline_Source.html lines 49-66.
 *
 * Sticky, z-40, #FFFDF6 on a #E8DFC9 hairline; inner rail capped at 1180px with
 * 11px/28px padding. Five nav items, then the help and basis controls, the assistant,
 * the role selector and the account chip.
 *
 * Verneombud only appears in the role list when law mode is on (bundle line 4146). Law mode
 * is the organisation's own `law_mode`, read with the setup checklist in `getShellContext`.
 *
 * The bar itself — and the Hjelp / Grunnlag / assistant panel under it — is HeaderBar, a
 * client component, because the panel is state. This file supplies what only the server
 * knows: the translations for the nav, law mode, and the checklist's facts. D-48.
 *
 * The nav lives in AppNav, a client component: the shell is a layout, so it renders
 * once for every screen beneath it and only the client knows which route is current.
 */
export type Role = 'daglig_leder' | 'avdelingsleder' | 'verneombud'

/**
 * `href` is omitted for a screen that has not been built yet, so the item renders as a
 * focusable non-link instead of a link to a 404. Adding the route is what turns it on.
 */
const NAV: (Omit<NavLink, 'label'> & { messageKey: string })[] = [
  { href: '/innsikt', messageKey: 'innsikt' },
  { href: '/malinger', messageKey: 'malinger' },
  { href: '/samtaler', messageKey: 'samtaler' },
  { href: '/tiltak', messageKey: 'tiltak' },
  { href: '/oppsett', messageKey: 'oppsett' },
]

export async function AppHeader({
  role = 'daglig_leder',
  initials = 'TB',
  assistantFace = 'av4',
}: {
  role?: Role
  initials?: string
  assistantFace?: string
}) {
  const t = await getTranslations()
  const { lawMode, progress } = await getShellContext()

  const roles: Role[] = lawMode
    ? ['daglig_leder', 'avdelingsleder', 'verneombud']
    : ['daglig_leder', 'avdelingsleder']

  return (
    <HeaderBar
      logo={<Logo />}
      nav={<AppNav items={NAV.map((item) => ({ href: item.href, label: t(`nav.${item.messageKey}`) }))} />}
      lawMode={lawMode}
      progress={progress}
      assistantFace={assistantFace}
      trailing={
        <>
          <select
            aria-label={t('header.roleAria')}
            defaultValue={role}
            className="h-[34px] cursor-pointer rounded-ctl border border-line bg-bg px-[11px] text-[12.5px] font-semibold text-ink"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>

          <span className="flex h-[32px] w-[32px] flex-none items-center justify-center rounded-pill bg-sbg text-[12px] font-bold">
            {initials}
          </span>
        </>
      }
    />
  )
}
