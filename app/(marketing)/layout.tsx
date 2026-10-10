import type { Metadata } from 'next'
import Link from '@/components/site/SitePaths'
import { headers } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { EN_URL, hostOf, MAIN_URL, marketOfHost, PUBLIC_HOSTS, siteLangs, siteOf } from '@/lib/hosts'
import { LanguageSwitch } from '@/components/i18n/LanguageSwitch'
import { SiteBeacon } from '@/components/marketing/SiteBeacon'
import { SiteFooter, type FooterData } from '@/components/site/v3/SiteFooter'
import { SiteHeader } from '@/components/site/v3/SiteHeader'
import { FOOTERS, OWN_FOOTERS, OWN_NAV, SITE_NAV, type FooterId } from '@/lib/site/nav'
import { SitePathsProvider } from '@/components/site/SitePaths'
import { ownSite } from '@/lib/site/own'
import { industryLinks } from '@/lib/site/industries'
import { INDUSTRY_META } from '@/content/industries/meta'
import { CONTACT_MAIL } from '@/lib/marketing/site'
import { siteIndexing } from '@/lib/site/indexing'
import { siteNotice } from '@/lib/site/notice'
import { contentLang } from '@/lib/i18n/locales'

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
/** «Allow search engines» (0126, set through the platform's settings.set_indexing): off, every page here says noindex */
export async function generateMetadata(): Promise<Metadata> {
  return (await siteIndexing()) ? {} : { robots: { index: false, follow: false } }
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('site.chrome')
  // on the production hosts each language has its own; the switch links across (D-98)
  const host = (await headers()).get('host')
  // Norway's hosts only: on the Swedish one, English is a choice on the same host (D-256)
  const hosts = PUBLIC_HOSTS.includes(hostOf(host)) && siteOf(host)?.market === 'no' ? { no: MAIN_URL, en: EN_URL } : undefined
  // a site of its own (D-270): its menu, its footer, its addresses; no industries, no demo, one language
  const own = await ownSite()
  const nav = own ? OWN_NAV : SITE_NAV
  const footers = own ? OWN_FOOTERS : FOOTERS
  const industries = own ? [] : await industryLinks()
  // Bransjer's column links to the cards /bransjer shows in this language: on English only the
  // industries with an English page have one, so a link to any other card would land nowhere
  const shown = new Set(industries.map((i) => INDUSTRY_META.find((m) => `/${m.slug}` === i.href)?.anchor))
  const langs = siteLangs(host)
  const columns = Object.fromEntries(
    (Object.keys(footers) as FooterId[]).map((id) => [
      id,
      footers[id].map((c) => ({
        head: t(`footer.head.${c.head}`),
        links: c.links
          .filter((l) => !l.href?.startsWith('/bransjer#') || shown.has(l.href.slice('/bransjer#'.length)))
          .map((l) => ({ label: t(`footer.link.${l.key}`), href: l.href })),
      })),
    ]),
  ) as FooterData

  // the site notice (0123): only while it is switched on (the platform's settings.set_notice)
  const notice = await siteNotice(contentLang(await getLocale()))

  return (
    <SitePathsProvider paths={own?.site.own.paths} market={marketOfHost(host)}>
      <div className="min-h-screen bg-bg font-site text-[14px] text-ink">
        {/* the site's own visit counting, in Sentral (D-248): renders nothing */}
        <SiteBeacon />
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
          items={nav.map((i) => ({
            href: i.href,
            label: t(`nav.${i.key}`),
            ...(i.industries ? { children: industries, all: t('nav.alleBransjer') } : {}),
            ...(i.children ? { children: i.children.map((c) => ({ href: c.href, label: t(`nav.${c.key}`) })), all: t(`nav.${i.all}`) } : {}),
          }))}
          label={t('navLabel')}
          menu={t('menu')}
          demo={own ? undefined : t('demo')}
          signIn={t('signIn')}
          cta={t('getStarted')}
        />

        <main id="innhold" tabIndex={-1} className="focus:outline-none">
          {children}
        </main>

        <SiteFooter
          columns={columns}
          label={t('footerNav')}
          about={t('footer.about')}
          language={langs.length > 1 ? <LanguageSwitch label={t('language')} size="text" hosts={hosts} langs={langs} /> : null}
          bottom={t.rich('footer.bottom', {
            year: new Date().getFullYear(),
            // the company and how to reach it, for e-handelsloven § 8 as far as the facts go (D-194)
            mail: (chunks) => (
              <a href={`mailto:${CONTACT_MAIL}`} className="text-inherit underline underline-offset-2 hover:text-ink">
                {chunks}
              </a>
            ),
            // the design's words, now links to the pages they name (D-104, D-194), underlined as links in prose (G5)
            privacy: (chunks) => (
              <Link href="/personvernerklaering" className="text-inherit underline underline-offset-2 hover:text-ink">
                {chunks}
              </Link>
            ),
            terms: (chunks) => (
              <Link href="/vilkar" className="text-inherit underline underline-offset-2 hover:text-ink">
                {chunks}
              </Link>
            ),
          })}
        />
      </div>
    </SitePathsProvider>
  )
}
