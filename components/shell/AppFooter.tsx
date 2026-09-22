import { getTranslations } from 'next-intl/server'
import { LogoMark } from './Logo'

/**
 * The application footer. Transcribed from Orgpuls_Offline_Source.html lines 2478-2515.
 *
 * #FFFDF6 above a #E8DFC9 hairline, inner rail capped at 1180px with 34/28/26 padding.
 * The first column is the mark, the promise and the two compliance chips; the rest are
 * auto-fitting link columns. A second hairline separates the legal line.
 *
 * The tagline is the product's anonymity promise in its own words. It is a message key
 * like everything else, but it is worth noting that it is also a claim the database has
 * to keep: "ingen enkeltsvar kan spores tilbake til en person" is what migration 0003
 * implements by omitting the columns that would make tracing possible.
 */
const COLUMNS: { head: string; links: string[] }[] = [
  { head: 'produkt', links: ['innsikt', 'malinger', 'samtaler', 'tiltak'] },
  { head: 'oppsett', links: ['selskap', 'ansatte', 'integrasjoner', 'arshjulet'] },
  { head: 'hjelp', links: ['alleArtikler', 'komIGang', 'anonymitet', 'kontaktOss'] },
]

/** The Produkt column links to nav destinations; the others to footer-specific ones. */
const NAV_LINKS = new Set(['innsikt', 'malinger', 'samtaler', 'tiltak'])

export async function AppFooter() {
  const t = await getTranslations()

  return (
    <footer className="border-t border-line bg-sf">
      <div className="mx-auto max-w-[1180px] px-[28px] pb-[26px] pt-[34px]">
        <div className="grid gap-[26px] [grid-template-columns:minmax(220px,1.4fr)_repeat(auto-fit,minmax(140px,1fr))]">
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
                {t('footer.dataNorge')}
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
                  <button
                    key={link}
                    type="button"
                    className="cursor-pointer border-none bg-transparent p-0 text-left text-[12.5px] text-body"
                  >
                    {NAV_LINKS.has(link) ? t(`nav.${link}`) : t(`footer.${link}`)}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-[26px] flex flex-wrap items-center justify-between gap-[16px] border-t border-line pt-[16px]">
          <span className="text-[11.5px] text-mut">{t('footer.legal')}</span>
          <span className="flex flex-wrap gap-[16px]">
            {(['databehandleravtale', 'personvern', 'driftsstatus'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className="cursor-pointer border-none bg-transparent p-0 text-[11.5px] text-mut"
              >
                {t(`footer.${k}`)}
              </button>
            ))}
          </span>
        </div>
      </div>
    </footer>
  )
}
