import Link from 'next/link'
import type { Route } from 'next'
import { getTranslations } from 'next-intl/server'
import { LogoMark } from './Logo'

/**
 * The application footer. Transcribed from Orgpuls_Offline_Source.html lines 2478-2515, with
 * design 3's Produkt column (Resultater and Kommentarer where Samtaler was).
 *
 * #FFFDF6 above a #E8DFC9 hairline, inner rail on the page column (`max-w-page`) with
 * 34/28/26 padding.
 * The first column is the mark, the promise and the two compliance chips; the rest are
 * auto-fitting link columns. A second hairline separates the legal line.
 *
 * The tagline is the product's anonymity promise in its own words. It is a message key
 * like everything else, but it is worth noting that it is also a claim the database has
 * to keep: "ingen enkeltsvar kan spores tilbake til en person" is what migration 0003
 * implements by omitting the columns that would make tracing possible.
 */
/**
 * Every entry now has a route, so every entry is a link.
 *
 * They were `<button>` elements while the screens did not exist — a focusable control
 * that goes nowhere is at least honest about going nowhere, which a dead `<a>` is not.
 * Now that the destinations are built they are real links, styled exactly as the bundle
 * styles that class of control. D-06's substitution, in the direction it was always
 * heading.
 */
const COLUMNS: { head: string; links: { key: string; href: Route }[] }[] = [
  {
    head: 'produkt',
    links: [
      { key: 'innsikt', href: '/innsikt' },
      { key: 'malinger', href: '/malinger' },
      { key: 'resultater', href: '/resultater' },
      { key: 'kommentarer', href: '/kommentarer' },
      { key: 'tiltak', href: '/tiltak' },
    ],
  },
  {
    head: 'oppsett',
    links: [
      { key: 'selskap', href: '/oppsett?fane=selskap' as Route },
      { key: 'ansatte', href: '/oppsett?fane=ansatte' as Route },
      { key: 'integrasjoner', href: '/integrasjoner' },
      { key: 'arshjulet', href: '/arshjulet' },
    ],
  },
  {
    head: 'hjelp',
    links: [
      { key: 'alleArtikler', href: '/hjelp' },
      { key: 'komIGang', href: '/hjelp/forsteTimen' as Route },
      { key: 'anonymitet', href: '/hjelp/hvaVilagrer' as Route },
      { key: 'kontaktOss', href: '/hjelp' },
    ],
  },
]

/** The Produkt column labels come from the nav's own keys; the others are footer-specific. */
const NAV_LINKS = new Set(['innsikt', 'malinger', 'resultater', 'kommentarer', 'tiltak'])

export async function AppFooter() {
  const t = await getTranslations()

  return (
    <footer className="border-t border-line bg-sf">
      <div className="mx-auto max-w-page px-[16px] md:px-[28px] pb-[26px] pt-[34px]">
        <div className="grid grid-cols-2 gap-[26px] md:[grid-template-columns:minmax(220px,1.4fr)_repeat(auto-fit,minmax(140px,1fr))]">
          <div className="min-w-0">
            <span className="flex items-center gap-[9px]">
              <LogoMark size={28} />
              <span className="font-display text-[18px] font-semibold tracking-[-0.01em]">
                Orgpuls
              </span>
            </span>
            <p className="mt-[11px] max-w-[280px] text-[12.5px] leading-[1.6] text-mut [text-wrap:pretty]">
              {t('app.tagline')}
            </p>
            <div className="mt-[13px] flex flex-wrap items-center gap-[8px]">
              <span className="rounded-pill bg-mint px-[10px] py-[4px] text-[11px] font-bold text-greendeep">
                {t('footer.dataEu')}
              </span>
              <span className="rounded-pill bg-sbg px-[10px] py-[4px] text-[11px] font-bold text-cautiondeep">
                {t('footer.gdpr')}
              </span>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.head} className="min-w-0">
              <span className="block text-[11px] uppercase tracking-[0.11em] text-mut">
                {t(`footer.${col.head}`)}
              </span>
              <span className="mt-[11px] flex flex-col items-start gap-[8px]">
                {col.links.map((link) => (
                  <Link
                    key={link.key}
                    href={link.href}
                    className="cursor-pointer border-none bg-transparent p-0 text-left text-[12.5px] text-body no-underline hover:text-body hover:no-underline"
                  >
                    {NAV_LINKS.has(link.key) ? t(`nav.${link.key}`) : t(`footer.${link.key}`)}
                  </Link>
                ))}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-[26px] flex flex-wrap items-center justify-between gap-[16px] border-t border-line pt-[16px]">
          <span className="text-[11.5px] text-mut">{t('footer.legal')}</span>
          <span className="flex flex-wrap gap-[16px]">
            {/*
              Personvern is a tab that exists; the other two are documents this
              installation does not have, so they stay non-links rather than becoming
              links to a page that would have to apologise. D-34.
            */}
            {/* in the design's order — Personvern is the middle one, link or not */}
            <span className="text-[11.5px] text-mut">{t('footer.databehandleravtale')}</span>
            <Link
              href={'/oppsett?fane=personvern' as Route}
              className="cursor-pointer p-0 text-[11.5px] text-mut no-underline hover:text-mut hover:no-underline"
            >
              {t('footer.personvern')}
            </Link>
            <span className="text-[11.5px] text-mut">{t('footer.driftsstatus')}</span>
          </span>
        </div>
      </div>
    </footer>
  )
}
