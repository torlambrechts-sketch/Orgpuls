import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Logo } from './Logo'
import { AppNav, type NavItem as NavLink } from './AppNav'

/**
 * The application header. Transcribed from Orgpuls_Offline_Source.html lines 49-66.
 *
 * Sticky, z-40, #FFFDF6 on a #E8DFC9 hairline; inner rail capped at 1180px with
 * 11px/28px padding. Five nav items, then the help and basis controls, the assistant,
 * the role selector and the account chip.
 *
 * Verneombud only appears in the role list when law mode is on (bundle line 4146).
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
  lawMode = true,
  initials = 'TB',
  assistantFace = 'av4',
}: {
  role?: Role
  lawMode?: boolean
  initials?: string
  assistantFace?: string
}) {
  const t = await getTranslations()

  const roles: Role[] = lawMode
    ? ['daglig_leder', 'avdelingsleder', 'verneombud']
    : ['daglig_leder', 'avdelingsleder']

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-sf">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-[18px] px-[28px] py-[11px]">
        <Logo />

        <AppNav
          items={NAV.map((item) => ({ href: item.href, label: t(`nav.${item.messageKey}`) }))}
        />

        <span className="flex flex-none items-center gap-[8px]">
          {/* the help control is navigation, so it is a link — D-06's substitution */}
          <Link
            href="/hjelp"
            aria-label={t('header.helpAria')}
            className="flex h-[34px] cursor-pointer items-center gap-[7px] rounded-ctl border border-line bg-transparent px-[13px] text-[12.5px] font-semibold text-ink no-underline hover:text-ink hover:no-underline"
          >
            <span
              aria-hidden="true"
              className="flex h-[17px] w-[17px] items-center justify-center rounded-pill border-[1.5px] border-ink text-[11px] font-bold leading-none"
            >
              ?
            </span>
            {t('header.help')}
          </Link>

          <button
            type="button"
            className="h-[34px] cursor-pointer rounded-ctl border border-line bg-transparent px-[13px] text-[12.5px] font-semibold text-ink"
          >
            {t('header.grunnlag')}
          </button>

          <button
            type="button"
            aria-label={t('header.assistantAria')}
            className="flex h-[34px] cursor-pointer items-center gap-[7px] rounded-ctl border border-line bg-transparent py-0 pl-[4px] pr-[13px] text-[12.5px] font-semibold text-ink"
          >
            <span
              aria-hidden="true"
              className="block h-[26px] w-[26px] flex-none rounded-btn bg-bg bg-cover bg-center"
              style={{ backgroundImage: `url(/tuva/${assistantFace}.png)` }}
            />
            Tuva
          </button>

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
        </span>
      </div>
    </header>
  )
}
