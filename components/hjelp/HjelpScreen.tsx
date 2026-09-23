import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ButtonLink } from '@/components/ui/Button'
import { ArticleList, type ArticleCard } from '@/components/hjelp/ArticleList'

/**
 * Hjelp. Bundle lines 1057-1142.
 *
 * The articles are product copy, so they live in `/messages` like every other string, and
 * `lib/help/articles.ts` holds only what the index sorts and filters by. Adding one is a
 * row and a message key.
 *
 * **The right column is shorter than the design's, and each omission is the same reason.**
 * The design offers a chat ("Nederst til høyre i appen" — there is no widget), a telephone
 * number (22 00 00 00, which is not a number anybody answers), an offer to put you in
 * touch with an arbeidsmiljørådgiver (a service that is not sold here), and a status line
 * reading "Alle systemer virker som de skal · sist oppdatert i dag kl. 06.00" (there is no
 * monitor, and an uptime claim with nothing behind it is the worst kind of reassurance).
 * What is left is the e-mail address, which is real, and one line saying why. D-34.
 */
export interface HjelpView {
  articles: ArticleCard[]
  categories: { key: string; label: string }[]
}

export async function HjelpScreen({ view }: { view: HjelpView }) {
  const t = await getTranslations()

  const quick = [
    { key: 'oppsett', href: '/oppsett' },
    { key: 'arshjulet', href: '/arshjulet' },
    { key: 'rapport', href: '/rapport' },
  ] as const

  return (
    <main className="animate-entry mx-auto max-w-[1180px] px-[16px] md:px-[28px] pb-[60px] pt-[26px]">
      <ButtonLink href="/innsikt" size="xxs" tone="ghost">
        {t('hjelp.back')}
      </ButtonLink>

      <div className="mt-[16px]">
        <h1 className="m-0 font-display text-[34px] font-semibold leading-[1.1]">
          {t('hjelp.title')}
        </h1>
        <p className="mt-[9px] max-w-[600px] text-[14.5px] leading-[1.6] text-mut [text-wrap:pretty]">
          {t('hjelp.lead')}
        </p>
      </div>

      {/*
        The design's three quick cards open the settings, the respondent flow and the
        årshjul. The respondent flow needs an invitation token to be anything but an
        error, so that card points at the report instead — a route that exists and that a
        leader looking for "where do I start" genuinely wants. D-34.
      */}
      <div className="mt-[22px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
        {quick.map((q) => (
          <Link
            key={q.key}
            href={q.href}
            className="block rounded-row border border-ink bg-sbg px-[19px] py-[17px] text-ink no-underline hover:text-ink hover:no-underline"
          >
            <span className="block text-[14.5px] font-bold">{t(`hjelp.quick.${q.key}.title`)}</span>
            <span className="mt-[4px] block text-[12.5px] leading-[1.45] text-mut [text-wrap:pretty]">
              {t(`hjelp.quick.${q.key}.note`)}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-[22px] grid items-start gap-[20px] md:[grid-template-columns:minmax(0,1.6fr)_minmax(280px,0.85fr)]">
        <div className="min-w-0 rounded-panel border border-line bg-sf px-[26px] py-[24px]">
          <ArticleList
            articles={view.articles}
            categories={view.categories}
            labels={{
              heading: t('hjelp.articles'),
              placeholder: t('hjelp.searchPlaceholder'),
              searchLabel: t('hjelp.searchLabel'),
              all: t('hjelp.all'),
              emptyTitle: t('hjelp.emptyTitle'),
              emptyLead: t('hjelp.emptyLead'),
            }}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-[14px]">
          <div className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
            <h2 className="m-0 font-display text-[21px] font-semibold">{t('hjelp.contactHead')}</h2>
            <div className="mt-[14px] flex flex-col gap-[11px]">
              <div className="rounded-tile border border-line bg-bg px-[16px] py-[14px]">
                <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
                  <span className="text-[13.5px] font-bold">{t('hjelp.contactMailKey')}</span>
                  <span className="text-[11.5px] text-mut">{t('hjelp.contactMail')}</span>
                </div>
                <div className="mt-[5px] text-[12.5px] leading-[1.5] text-mut [text-wrap:pretty]">
                  {t('hjelp.contactMailNote')}
                </div>
                <a
                  href={`mailto:${t('hjelp.contactMail')}`}
                  className="mt-[11px] inline-flex h-[34px] cursor-pointer items-center justify-center rounded-bar border border-ink bg-sf px-[14px] text-[12.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
                >
                  {t('hjelp.contactMailCta')}
                </a>
              </div>
            </div>
            <p className="mt-[13px] text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">
              {t('hjelp.contactOnlyNote')}
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
