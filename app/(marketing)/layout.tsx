import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { SiteNav } from '@/components/marketing/SiteNav'
import { UtmKeeper } from '@/components/marketing/UtmKeeper'
import { LogoMark } from '@/components/shell/Logo'
import { CONTACT_MAIL, SITE_FOOTER, SITE_NAV } from '@/lib/marketing/site'

/**
 * The public chrome. Orgpuls_Start.dc.html lines 28-42 and 265-275.
 *
 * A separate shell from the application's, and deliberately so: no role, no account chip
 * and no assistant, because nobody reading it is signed in. Since D-83 it carries the public
 * site's menu (SiteNav) and a footer of the site's sections, where the design drew one page
 * with two buttons and three footer links. The rail
 * is 1120px rather than the application's 1180, which is the design's own difference —
 * marketing reads at a slightly narrower measure than a dashboard.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations()

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-[16px] px-[26px] py-[13px]">
          <Link
            href="/"
            className="flex min-h-[44px] flex-none items-center gap-[10px] text-ink no-underline hover:text-ink hover:no-underline"
          >
            <LogoMark size={33} />
            <span className="font-display text-[21px] font-semibold tracking-[-0.01em]">
              Orgpuls
            </span>
          </Link>
          <span className="flex-1 lg:flex-none" />
          <SiteNav
            items={SITE_NAV.map((i) => ({ href: i.href, label: t(`seo.nav.${i.key}`) }))}
            menuLabel={t('seo.nav.menu')}
            account={[
              { href: '/logg-inn', label: t('start.signIn') },
              { href: '/registrer', label: t('start.getStarted') },
            ]}
          />
          <span className="hidden flex-1 lg:block" />
          {/* on a phone these two move into the menu, so the header is one row and the page starts sooner */}
          <span className="hidden flex-none flex-wrap items-center gap-[9px] sm:flex">
            <Link
              href="/logg-inn"
              className="inline-flex h-[38px] items-center rounded-ctl border border-transparent px-[15px] text-[14px] font-semibold text-ink no-underline hover:text-ink hover:no-underline"
            >
              {t('start.signIn')}
            </Link>
            <Link
              href="/registrer"
              className="inline-flex h-[38px] items-center rounded-ctl border border-ink bg-ac px-[17px] text-[14px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
            >
              {t('start.getStarted')}
            </Link>
          </span>
        </div>
      </header>

      <main>{children}</main>
      <UtmKeeper />

      <footer className="mt-[54px] border-t border-line bg-sf">
        <div className="mx-auto max-w-[1120px] px-[26px] pb-[26px] pt-[34px]">
          <div className="grid gap-[26px] [grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))]">
            {SITE_FOOTER.map((col) => (
              <nav key={col.head} aria-label={t(`seo.footer.${col.head}`)}>
                <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t(`seo.footer.${col.head}`)}</span>
                <ul className="m-0 mt-[10px] flex list-none flex-col gap-0 p-0 text-[13.5px] lg:gap-[7px]">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href as Route} className="inline-flex min-h-[44px] min-w-[44px] items-center lg:min-h-0 lg:min-w-0">
                        {t(l.label)}
                      </Link>
                    </li>
                  ))}
                  {col.head === 'selskap' ? (
                    <li>
                      <a href={`mailto:${CONTACT_MAIL}`} className="inline-flex min-h-[44px] min-w-[44px] items-center lg:min-h-0 lg:min-w-0">
                        {CONTACT_MAIL}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </nav>
            ))}
          </div>
          <div className="mt-[28px] flex flex-wrap items-baseline justify-between gap-x-[26px] gap-y-[8px] border-t border-line pt-[18px] text-[12.5px] text-mut">
            <p className="m-0 max-w-[62ch] [text-wrap:pretty]">{t('start.footer')}</p>
            <p className="m-0">{t('seo.footer.company', { year: new Date().getFullYear() })}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
