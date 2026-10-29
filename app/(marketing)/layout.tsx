import type { Metadata } from 'next'
import Link from '@/components/site/SitePaths'
import { headers } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { hostOf, marketOfHost, PAGE_LANG_HEADER, PUBLIC_HOSTS, siteLangs } from '@/lib/hosts'
import { LanguageSwitch } from '@/components/i18n/LanguageSwitch'
import { SiteBeacon } from '@/components/marketing/SiteBeacon'
import { SiteFooter, type FooterData } from '@/components/site/v3/SiteFooter'
import { SiteHeader } from '@/components/site/v3/SiteHeader'
import { FOOTERS, OWN_FOOTERS, OWN_NAV, SITE_NAV, type FooterId } from '@/lib/site/nav'
import { SitePathsProvider } from '@/components/site/SitePaths'
import { ownSite, serves, siteSupport } from '@/lib/site/own'
import { industryLinks } from '@/lib/site/industries'
import { INDUSTRY_META } from '@/content/industries/meta'
import { siteIndexing } from '@/lib/site/indexing'
import { siteNotice } from '@/lib/site/notice'
import { contentLang } from '@/lib/i18n/locales'
import { requestHost } from '@/lib/site/host'

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
  // the languages this host's switch offers; each is a choice on the same address (D-252, D-275). A site
  // of its own's pages have none: they are written in its one language (D-270, D-276). On Sweden's,
  // signing in and up keep the reader's choice, Swedish or English, and the switch is there
  const head = await headers()
  const host = await requestHost()
  // a site of its own (D-270): its menu, its footer, its addresses; no industries, no demo, one language.
  // Its menu and footer link only to the pages it serves: Sweden's has no prices or terms yet (D-276)
  const own = await ownSite()
  const linked = (href: string) => serves(own, href.split('#')[0]!)
  const nav = (own ? OWN_NAV : SITE_NAV)
    .filter((i) => linked(i.href))
    .map((i) => (i.children ? { ...i, children: i.children.filter((c) => linked(c.href)) } : i))
  const footers = own ? OWN_FOOTERS : FOOTERS
  // what a site shows follows from the pages it serves, not from which site it is: industries and the
  // demo only where /bransjer and /demo are served (Norway's hosts today)
  const industries = serves(own, '/bransjer') ? await industryLinks() : []
  // Bransjer's column links to the cards /bransjer shows in this language: on English only the
  // industries with an English page have one, so a link to any other card would land nowhere
  const shown = new Set(industries.map((i) => INDUSTRY_META.find((m) => `/${m.slug}` === i.href)?.anchor))
  const langs = siteLangs(host)
  // the routes in the site's one language, where others are in the reader's choice (Sweden's, D-276)
  const pinnedPages = own && !own.site.pinned ? own.site.own.pages : undefined
  const ownPage = !!own && head.get(PAGE_LANG_HEADER) === own.site.lang
  const offersSwitch = langs.length > 1 && (!own || (!own.site.pinned && !ownPage))
  const columns = Object.fromEntries(
    (Object.keys(footers) as FooterId[]).map((id) => [
      id,
      footers[id].map((c) => ({
        head: t(`footer.head.${c.head}`),
        links: c.links
          .filter((l) => !l.href || linked(l.href))
          .filter((l) => !l.href?.startsWith('/bransjer#') || shown.has(l.href.slice('/bransjer#'.length)))
          .map((l) => ({ label: t(`footer.link.${l.key}`), href: l.href })),
      })),
    ]),
  ) as FooterData

  // the address the site's readers write to: its brand's (lib/brand.ts BRANDS `support`)
  const support = await siteSupport()
  // the site notice (0123): only while it is switched on (the platform's settings.set_notice)
  const notice = await siteNotice(contentLang(await getLocale()))

  return (
    <SitePathsProvider paths={own?.site.own.paths} market={marketOfHost(host)} pages={pinnedPages}>
      <div className="min-h-screen bg-bg font-site text-[14px] text-ink">
        {/* the site's own visit counting, in Sentral (D-248): renders nothing. Counted on the production
            host the request really came to, never a preview showing another site (lib/hosts.ts effectiveHost) */}
        <SiteBeacon counted={PUBLIC_HOSTS.includes(hostOf(head.get('x-forwarded-host') ?? head.get('host')))} paths={own?.site.own.paths} />
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
          demo={serves(own, '/demo') ? t('demo') : undefined}
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
          language={offersSwitch ? <LanguageSwitch label={t('language')} size="text" langs={langs} /> : null}
          bottom={t.rich('footer.bottom', {
            year: new Date().getFullYear(),
            // the company and how to reach it, for e-handelsloven § 8 as far as the facts go (D-194)
            mail: (chunks) => (
              <a href={`mailto:${support}`} className="text-inherit underline underline-offset-2 hover:text-ink">
                {chunks}
              </a>
            ),
            // the design's words, now links to the pages they name (D-104, D-194), underlined as links in prose (G5);
            // nothing on a site that does not serve the page (D-272), whose text then carries its separator
            // inside the tag
            privacy: (chunks) =>
              serves(own, '/personvernerklaering') ? (
                <Link href="/personvernerklaering" className="text-inherit underline underline-offset-2 hover:text-ink">
                  {chunks}
                </Link>
              ) : null,
            terms: (chunks) =>
              serves(own, '/vilkar') ? (
                <Link href="/vilkar" className="text-inherit underline underline-offset-2 hover:text-ink">
                  {chunks}
                </Link>
              ) : null,
          })}
        />
      </div>
    </SitePathsProvider>
  )
}
