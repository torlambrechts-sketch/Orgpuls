import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { HeaderNav } from '@/components/site/HeaderNav'
import { SiteFooter, type FooterData } from '@/components/site/SiteFooter'
import { UtmKeeper } from '@/components/marketing/UtmKeeper'
import { DESIGNED_FOOTER, FOOTERS, SITE_NAV_V2, type FooterId } from '@/lib/site/nav'

/**
 * The public chrome (D-88): design-reference/orgpuls/nettside, the `<header>` and `<footer>`
 * every page of the site's design shares.
 *
 * A separate shell from the application's, and deliberately so: no role, no account chip
 * and no assistant, because nobody reading it is signed in. The header is the logo, the
 * site's five sections and the two account buttons; the footer is the one each page's design
 * draws (lib/site/nav). The page you are on, and which footer it has, are read from the path
 * by two small client components, so every page stays static.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('site.chrome')

  const columns = Object.fromEntries(
    (Object.keys(FOOTERS) as FooterId[]).map((id) => [
      id,
      FOOTERS[id].map((c) => ({
        head: t(`footer.head.${c.head}`),
        links: c.links.map((l) => ({ label: t(`footer.link.${l.key}`), href: l.href })),
      })),
    ]),
  ) as FooterData

  return (
    <div className="min-h-screen bg-bg text-[14px] text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-sf">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-[22px] px-[26px] py-[13px] max-lg:gap-[12px]">
          <Link href="/" className="flex flex-none items-center gap-[10px] text-ink hover:text-ink max-lg:min-h-[44px]">
            <span className="flex h-[33px] w-[33px] items-center justify-center rounded-ctl border-[1.5px] border-ink bg-sf">
              <svg width="22" height="13" viewBox="0 0 20 12" fill="none" aria-hidden="true" className="block">
                <path
                  d="M1 6.2h3.6l1.7-4.4 2.9 8.8 1.9-4.4h2.4"
                  stroke="#191510"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="17" cy="6.2" r="1.9" fill="#191510" />
              </svg>
            </span>
            <span className="font-display text-[21px] font-semibold tracking-[-0.01em]">Orgpuls</span>
          </Link>
          <HeaderNav
            items={SITE_NAV_V2.map((i) => ({ href: i.href!, label: t(`nav.${i.key}`) }))}
            label={t('navLabel')}
            menuLabel={t('menu')}
            account={[
              { href: '/logg-inn', label: t('signIn') },
              { href: '/registrer', label: t('getStarted') },
            ]}
          />
          {/* on a phone these two move into the menu, so the header is one row and the page starts sooner */}
          <span className="hidden flex-none gap-[9px] sm:flex">
            <Link
              href="/logg-inn"
              className="flex h-[38px] items-center rounded-ctl px-[15px] text-[14px] font-semibold text-ink hover:text-ink"
            >
              {t('signIn')}
            </Link>
            <Link
              href="/registrer"
              className="flex h-[38px] items-center rounded-ctl border border-ink bg-ac px-[17px] text-[14px] font-bold text-ink hover:text-ink"
            >
              {t('getStarted')}
            </Link>
          </span>
        </div>
      </header>

      <main>{children}</main>
      <UtmKeeper />

      <SiteFooter
        columns={columns}
        designed={DESIGNED_FOOTER}
        about={t('footer.about')}
        bottom={t('footer.bottom', { year: new Date().getFullYear() })}
      />
    </div>
  )
}
