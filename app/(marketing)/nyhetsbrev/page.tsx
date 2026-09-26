import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { NewsletterSignup, TokenAction } from '@/components/site/NewsletterForms'
import { publicLists } from '@/lib/crm/read'
import { pageMeta } from '@/lib/marketing/meta'

/**
 * The newsletter (D-101): signing up, and confirming from the mailed link (`?t=`). The
 * signup is double opt-in; nothing is sent until the link is used. No design exists for
 * the page; it is the new-password page's card with the contact form's fields.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ t?: string }> }): Promise<Metadata> {
  const t = await getTranslations('newsletter')
  // the signup is a page worth finding; a confirmation link is a credential and is not
  if ((await searchParams).t) return { title: `${t('title')} · Orgpuls`, robots: { index: false, follow: false } }
  return pageMeta({ title: `${t('title')} · Orgpuls`, description: t('lead'), path: '/nyhetsbrev' })
}

export default async function NewsletterPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t: token } = await searchParams
  const t = await getTranslations('newsletter')
  const lang = (await getLocale()) === 'en' ? 'en' : 'no'
  const confirming = typeof token === 'string' && token.length > 0
  const lists = confirming ? [] : await publicLists()

  return (
    <div className="animate-entry mx-auto max-w-[520px] px-[26px] pb-[70px] pt-[44px]">
      <div className="rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]">
        <span className="inline-block rounded-pill bg-sbg px-[12px] py-[5px] text-[11.5px] font-bold">{t('badge')}</span>
        <h1 className="mt-[13px] font-display text-[clamp(26px,3.6vw,31px)] font-semibold leading-[1.12]">
          {confirming ? t('confirmTitle') : t('title')}
        </h1>
        <p className="mt-[10px] max-w-[44ch] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">
          {confirming ? t('confirmLead') : t('lead')}
        </p>
        {confirming ? (
          <TokenAction
            action="confirm"
            token={token}
            words={{
              submit: t('confirm'),
              sending: t('sending'),
              doneTitle: t('confirmedTitle'),
              doneLead: t('confirmedLead'),
              invalidTitle: t('expiredTitle'),
              invalidLead: t('expiredLead'),
              again: t('again'),
            }}
          />
        ) : (
          <NewsletterSignup
            lang={lang}
            lists={lists.map((l) => ({
              key: l.key,
              name: lang === 'en' ? l.name_en : l.name_no,
              description: lang === 'en' ? l.description_en : l.description_no,
            }))}
            words={{
              mail: t('mail'),
              name: t('name'),
              company: t('company'),
              submit: t('submit'),
              sending: t('sending'),
              invalid: t('invalid'),
              limited: t('limited'),
              failed: t('failed'),
              sentTitle: t('sentTitle'),
              sentLead: t.raw('sentLead') as string,
              privacy: t('privacy'),
              listsTitle: t('listsTitle'),
              listsHint: t('listsHint'),
              noLists: t('noLists'),
            }}
          />
        )}
      </div>
    </div>
  )
}
