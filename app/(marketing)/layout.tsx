import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { EN_URL, hostOf, MAIN_URL, PUBLIC_HOSTS } from '@/lib/hosts'
import { SiteBeacon } from '@/components/marketing/SiteBeacon'
import { LanguageSwitch } from '@/components/i18n/LanguageSwitch'
import { SiteFooter, type FooterData } from '@/components/site/v3/SiteFooter'
import { SiteHeader } from '@/components/site/v3/SiteHeader'
import { FOOTERS, SITE_NAV, type FooterId } from '@/lib/site/nav'
import { industryLinks } from '@/lib/site/industries'
import { siteIndexing } from '@/lib/site/indexing'
import { siteNotice } from '@/lib/site/notice'

/**
 * The public chrome (D-190): design-reference/orgpuls/nettside-v3, the mint top band with the
 * floating header card, and the footer every page of the design shares.
 *
 * A separate shell from the application's, and deliberately so: no role, no account chip and no
 * assistant, because nobody reading it is signed in. The order is the skip link, the header (in
 * the top of the mint band), one `<main>` and the footer (G-01, G-02). On the five v3 pages
 * (lib/site/nav `V3_ROUTES`) the page's first element, `SiteTop`, continues the band with its hero;
 * on every other public page the band closes under the header. The footer is the one each page's
 * design draws, read from the path; its bottom line carries Norsk / English (D-96). The whole site
 * sets in the v3 design's type stack (`font-site`), whose fallback draws → ✓ ▾ as the design does.
 */
/** Admin › Site settings › «Allow search engines» (0126): off, every page here says noindex */
export async function generateMetadata(): Promise<Metadata> {
  return (await siteIndexing()) ? {} : { robots: { index: false, follow: false } }
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('site.chrome')
  // on the production hosts each language has its own; the switch links across (D-98)
  const hosts = PUBLIC_HOSTS.includes(hostOf((await headers()).get('host'))) ? { no: MAIN_URL, en: EN_URL } : undefined
  const industries = await industryLinks()
  const columns = Object.fromEntries(
    (Object.keys(FOOTERS) as FooterId[]).map((id) => [
      id,
      FOOTERS[id].map((c) => ({
        head: t(`footer.head.${c.head}`),
        links: c.links.map((l) => ({ label: t(`footer.link.${l.key}`), href: l.href })),
      })),
    ]),
  ) as FooterData

  // the site notice (0123): only while it is switched on in admin
  const notice = await siteNotice((await getLocale()) === 'en' ? 'en' : 'no')

  return (
    <div className="min-h-screen bg-bg font-site text-[14px] text-ink">
      {/* G-01: the first thing a keyboard reaches; drawn as the header's button while focused */}
      <a
        href="#innhold"
        className="sr-only focus:not-sr-only focus:fixed focus:left-[18px] focus:top-[18px] focus:z-50 focus:flex focus:min-h-[38px] focus:items-center focus:rounded-ctl focus:border focus:border-ink focus:bg-ac focus:px-[16px] focus:text-[14px] focus:font-bold focus:text-ink focus:no-underline"
      >
        {t('skip')}
      </a>
      {notice ? (
        <p role="status" className="m-0 border-b border-line bg-band px-[26px] py-[9px] text-center text-[13px] font-semibold text-ink">
          {notice}
        </p>
      ) : null}
      <SiteHeader
        items={SITE_NAV.map((i) => ({
          href: i.href,
          label: t(`nav.${i.key}`),
          ...(i.industries ? { children: industries, all: t('nav.alleBransjer') } : {}),
        }))}
        label={t('navLabel')}
        menu={t('menu')}
        demo={t('demo')}
        signIn={t('signIn')}
        cta={t('getStarted')}
      />

      <main id="innhold" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <SiteBeacon />

      <SiteFooter
        columns={columns}
        label={t('footerNav')}
        about={t('footer.about')}
        language={<LanguageSwitch label={t('language')} size="text" hosts={hosts} />}
        bottom={t.rich('footer.bottom', {
          year: new Date().getFullYear(),
          // the design's words, now a link to the page they name (D-104), underlined as a link in prose (G5)
          privacy: (chunks) => (
            <Link href="/personvernerklaering" className="text-inherit underline underline-offset-2 hover:text-ink">
              {chunks}
            </Link>
          ),
        })}
      />
    </div>
  )
}
