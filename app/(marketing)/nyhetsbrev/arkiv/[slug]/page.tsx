import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { JsonLd } from '@/components/marketing/JsonLd'
import { CampaignWeb } from '@/components/site/CampaignWeb'
import { archiveItem } from '@/lib/crm/read'
import { pageMeta } from '@/lib/marketing/meta'
import { article, breadcrumbs, graph } from '@/lib/marketing/schema'

/**
 * One newsletter issue on the web (D-103): what the mail said, with no personal data, its
 * own title and description for search and sharing, Article structured data, and a signup
 * for the next issue. Only an issue published to the web that has gone out is shown.
 */
export const revalidate = 600

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const item = await archiveItem((await params).slug)
  if (!item) return {}
  return pageMeta({
    title: `${item.title} · Orgpuls`,
    description: item.description ?? item.preheader,
    path: `/nyhetsbrev/arkiv/${item.slug}`,
    type: 'article',
    published: item.published_at,
    modified: item.published_at,
  })
}

export default async function ArchiveItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const item = await archiveItem((await params).slug)
  if (!item) notFound()
  const t = await getTranslations('archive')
  const format = await getFormatter()
  const m = await getTranslations('mail.crm')
  const words = item.blocks.map((b) => [b.title, b.text].filter(Boolean).join(' ')).join(' ').split(/\s+/).filter(Boolean).length
  const path = `/nyhetsbrev/arkiv/${item.slug}`

  return (
    <div className="animate-entry mx-auto max-w-[720px] px-[26px] pb-[70px] pt-[44px]">
      <JsonLd
        data={graph(
          {
            ...article({
              headline: item.title,
              description: item.description ?? item.preheader,
              path,
              published: item.published_at,
              modified: item.published_at,
              words,
            }),
            inLanguage: item.lang === 'en' ? 'en' : 'nb-NO',
          },
          breadcrumbs([
            { name: 'Orgpuls', path: '/' },
            { name: t('title'), path: '/nyhetsbrev/arkiv' },
            { name: item.title, path },
          ]),
        )}
      />
      <Link href={'/nyhetsbrev/arkiv' as Route} className="text-[13.5px] font-semibold text-link">
        ← {t('back')}
      </Link>
      <p className="mb-0 mt-[14px] text-[13px] text-mut">
        {t('sent', { date: format.dateTime(new Date(item.published_at), { dateStyle: 'long', timeZone: 'Europe/Oslo' }) })}
      </p>
      <h1 className="mb-[20px] mt-[6px] font-display text-[clamp(28px,3.8vw,38px)] font-semibold leading-[1.12] [text-wrap:balance]">{item.title}</h1>
      <article lang={item.lang === 'en' ? 'en' : 'nb'} className="rounded-card border border-line bg-sf p-[clamp(22px,3.5vw,34px)]">
        <CampaignWeb
          blocks={item.blocks}
          campaign={item.utm_campaign}
          signature={item.signature}
          company={m('companyFallback')}
          readMore={t('readMore')}
        />
      </article>
      <div className="mt-[28px] rounded-card border-[1.5px] border-ink bg-sbg px-[24px] py-[22px]">
        <p className="m-0 text-[17px] font-bold">{t('subscribeTitle')}</p>
        <Link
          href={'/nyhetsbrev' as Route}
          className="mt-[12px] inline-flex h-[46px] items-center rounded-cta border border-ink bg-ac px-[20px] text-[15px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
        >
          {t('subscribe')}
        </Link>
      </div>
    </div>
  )
}
