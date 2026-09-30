import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CsatForm } from '@/components/site/CsatForm'
import { openRating } from '@/lib/csat/read'

/**
 * «Hvordan løste vi saken?» (0135): the rating page the resolution mail of a support case links
 * to, with a one-use key. The key is the only way in, so the page is never indexed, and the site
 * sends no referrer (next.config.ts), so the key does not leave with a click. A key that is
 * malformed, unknown, expired or already used shows the same «the link does not work».
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('csat')
  return { title: `${t('metaTitle')} · Orgpuls`, robots: { index: false, follow: false } }
}

export default async function RatingPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t: token } = await searchParams
  const t = await getTranslations('csat')
  const open = await openRating(token)

  return (
    <div className="animate-entry mx-auto max-w-[560px] px-[26px] pb-[70px] pt-[44px]">
      <div className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]">
        <span className="inline-block rounded-pill bg-sbg px-[12px] py-[5px] text-[11.5px] font-bold">{t('badge')}</span>
        <h1 className="mt-[13px] font-display text-[clamp(26px,3.6vw,31px)] font-semibold leading-[1.12]">
          {open.ok ? t('title') : open.problem === 'invalid' ? t('invalidTitle') : t('busyTitle')}
        </h1>
        <p className="mt-[10px] max-w-[46ch] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">
          {open.ok ? t('lead', { number: open.number }) : open.problem === 'invalid' ? t('invalidLead') : t(`problem.${open.problem}`)}
        </p>
        {open.ok && typeof token === 'string' ? (
          <CsatForm
            token={token}
            words={{
              legend: t('legend'),
              scores: { '1': t('score.1'), '2': t('score.2'), '3': t('score.3'), '4': t('score.4'), '5': t('score.5') },
              comment: t('comment'),
              commentHint: t('commentHint'),
              submit: t('submit'),
              sending: t('sending'),
              thanksTitle: t('thanksTitle'),
              thanksLead: t('thanksLead'),
              problems: {
                invalid: t('invalidLead'),
                invalid_rating: t('problem.invalid_rating'),
                too_long: t('problem.too_long', { max: 2000 }),
                rate_limited: t('problem.rate_limited'),
                failed: t('problem.failed'),
              },
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
