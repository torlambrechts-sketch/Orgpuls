import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TokenAction } from '@/components/site/NewsletterForms'
import { CONTACT_MAIL } from '@/lib/marketing/site'

/**
 * Unsubscribing from the newsletter and campaigns (D-101), from the link in every marketing
 * mail. It asks for one press, so a link scanner cannot unsubscribe anyone; a mail program's
 * own "Unsubscribe" uses /api/avmeld and needs no press. Mail about a survey or an account
 * is not affected.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('unsubscribe')
  return { title: `${t('title')} · Orgpuls`, robots: { index: false, follow: false } }
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t: token } = await searchParams
  const t = await getTranslations('unsubscribe')
  const valid = typeof token === 'string' && /^[0-9a-f]{64}$/.test(token)
  const invalidLead = (t.raw('invalidLead') as string).replace('{mail}', CONTACT_MAIL)

  return (
    <div className="animate-entry mx-auto max-w-[520px] px-[26px] pb-[70px] pt-[44px]">
      <div className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]">
        <span className="inline-block rounded-pill bg-sbg px-[12px] py-[5px] text-[11.5px] font-bold">{t('badge')}</span>
        <h1 className="mt-[13px] font-display text-[clamp(26px,3.6vw,31px)] font-semibold leading-[1.12]">
          {valid ? t('title') : t('invalidTitle')}
        </h1>
        <p className="mt-[10px] max-w-[44ch] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">{valid ? t('lead') : invalidLead}</p>
        {valid ? (
          <TokenAction
            action="unsubscribe"
            token={token}
            words={{
              submit: t('submit'),
              sending: t('sending'),
              doneTitle: t('doneTitle'),
              doneLead: t('doneLead'),
              invalidTitle: t('invalidTitle'),
              invalidLead,
              again: t('again'),
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
