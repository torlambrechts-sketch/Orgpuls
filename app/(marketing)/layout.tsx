import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LogoMark } from '@/components/shell/Logo'
import { CONTACT_MAIL } from '@/lib/marketing/site'

/**
 * The public chrome. Orgpuls_Start.dc.html lines 28-42 and 265-275.
 *
 * A separate shell from the application's, and deliberately so: this one has no nav, no
 * role, no account chip and no assistant, because nobody reading it is signed in. The rail
 * is 1120px rather than the application's 1180, which is the design's own difference —
 * marketing reads at a slightly narrower measure than a dashboard.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations()

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="sticky top-0 z-40 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-[16px] px-[26px] py-[13px]">
          <Link
            href="/"
            className="flex flex-none items-center gap-[10px] text-ink no-underline hover:text-ink hover:no-underline"
          >
            <LogoMark size={33} />
            <span className="font-display text-[21px] font-semibold tracking-[-0.01em]">
              Orgpuls
            </span>
          </Link>
          <span className="flex-1" />
          <span className="flex flex-none flex-wrap items-center gap-[9px]">
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
      </div>

      {children}

      <div className="mt-[54px] border-t border-line bg-sf">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-[16px] p-[26px]">
          <span className="max-w-[62ch] text-[12.5px] text-mut [text-wrap:pretty]">
            {t('start.footer')}
          </span>
          <span className="flex flex-wrap gap-[16px] text-[12.5px]">
            {/* public pages only: /hjelp is behind the sign-in, so a visitor landed on the
                sign-in form from "Slik virker det" and "Kontakt" (D-79) */}
            <Link href={'/#how' as Route}>{t('start.footerHow')}</Link>
            <Link href={'/artikler' as Route}>{t('seo.common.articles')}</Link>
            <Link href="/hjelp/gdpr">{t('start.footerPrivacy')}</Link>
            <a href={`mailto:${CONTACT_MAIL}`}>{t('start.footerContact')}</a>
          </span>
        </div>
      </div>
    </div>
  )
}
