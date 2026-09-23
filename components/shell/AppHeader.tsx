import { getTranslations } from 'next-intl/server'
import { Logo } from './Logo'
import { AppNav, type NavItem as NavLink } from './AppNav'
import { HeaderBar } from './HeaderBar'
import { getShellContext, getViewer } from '@/lib/shell/read'
import type { Role } from '@/lib/org/read'

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

export async function AppHeader({ assistantFace = 'av4' }: { assistantFace?: string }) {
  const t = await getTranslations()
  const [{ lawMode, progress }, viewer] = await Promise.all([getShellContext(), getViewer()])

  /*
   * The design's selector switches the whole product to another role's view ("Bytt rolle
   * … for å se nøyaktig det avdelingslederne ser"). That cannot be honest here: every
   * reader is scoped by the signed-in account in the database, so a switch could only
   * restyle the same data under another label. The selector is set to the role the viewer
   * holds and the others are listed but disabled — present, as the design lists them,
   * which also keeps the control the design's width. No role at all is no selector. D-57.
   */
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
          {viewer.role ? (
            <select
              aria-label={t('header.roleAria')}
              defaultValue={viewer.role}
              className="h-[34px] cursor-pointer rounded-ctl border border-line bg-bg px-[11px] text-[12.5px] font-semibold text-ink"
            >
              {(roles.includes(viewer.role) ? roles : [viewer.role, ...roles]).map((r) => (
                <option key={r} value={r} disabled={r !== viewer.role}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </select>
          ) : null}

          <span
            aria-hidden
            className="flex h-[32px] w-[32px] flex-none items-center justify-center rounded-pill bg-sbg text-[12px] font-bold"
          >
            {viewer.initials}
          </span>
        </>
      }
    />
  )
}
