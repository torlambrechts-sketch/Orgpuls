import { getTranslations } from 'next-intl/server'
import { Logo } from './Logo'
import { HeaderBar } from './HeaderBar'
import type { NavEntry } from '@/lib/shell/nav'
import { getShellContext, getViewer } from '@/lib/shell/read'
import type { Role } from '@/lib/org/read'

/**
 * The application header, design 3 (bundle 3, the sticky bar under `topNav`/`sideNav`).
 *
 * Sticky, z-40, #FFFDF6 on a #E8DFC9 hairline; the inner rail follows the page column
 * (`max-w-page`: 1180px in the top layout, the full width in the side layout) with
 * 11px/28px padding. In the top layout: the brand, the six-screen nav, then the layout
 * toggle, Hjelp, the Enkel/Full switch, the role selector and the account chip. In the side
 * layout the rail carries the brand, the nav and Hjelp, and the bar carries the screen's
 * title instead.
 *
 * The bar is HeaderBar, a client component, because its toggles and the help panel are
 * state. This file supplies what only the server knows: translations, law mode, the setup
 * checklist and the viewer's role. The nav model itself comes from the layout, which reads
 * it once for the bar and the rail.
 *
 * Verneombud only appears in the role list when law mode is on (bundle line 4146).
 */
export async function AppHeader({ items, assistantFace }: { items: NavEntry[]; assistantFace: string }) {
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
      items={items}
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
