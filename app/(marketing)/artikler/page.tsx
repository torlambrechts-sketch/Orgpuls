import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ArticleCards } from '@/components/marketing/ArticleCards'
import { JsonLd } from '@/components/marketing/JsonLd'
import { TemplateTeaser } from '@/components/marketing/TemplateTeaser'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph, ldLanguage, organization } from '@/lib/marketing/schema'
import { absolute, ARTICLES } from '@/lib/marketing/site'

/**
 * The article index: every article in lib/marketing/site.ts, newest first. Informational, no offer (D-235);
 * under the articles, the free templates (D-243).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({ title: t('seo.index.title'), description: t('seo.index.description'), path: '/artikler' })
}

export default async function ArticleIndex() {
  const t = await getTranslations()
  return (
    <div>
      <JsonLd
        data={graph(
          organization(),
          {
            '@type': 'CollectionPage',
            url: absolute('/artikler'),
            name: t('seo.index.title'),
            description: t('seo.index.description'),
            inLanguage: ldLanguage(await getLocale()),
            hasPart: [
              ...ARTICLES.map((a) => ({
                '@type': 'Article',
                url: absolute(`/artikler/${a.slug}`),
                headline: t(`seo.articles.${a.key}.h1`),
              })),
            ],
          },
          breadcrumbs([
            { name: t('seo.common.home'), path: '/' },
            { name: t('seo.index.crumb'), path: '/artikler' },
          ]),
        )}
      />
      <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('seo.index.eyebrow')}</span>
        <h1 className="mt-[9px] max-w-[22ch] font-display text-[clamp(30px,4.6vw,46px)] font-semibold leading-[1.1] [text-wrap:balance]">
          {t('seo.index.h1')}
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[16.5px] leading-[1.65] text-body [text-wrap:pretty]">{t('seo.index.lead')}</p>
        <ArticleCards slugs={ARTICLES.map((a) => a.slug)} />
        {/* the free templates beside the articles (D-243): a resource, named for what it is */}
        <TemplateTeaser slug="kartleggingspakken" className="mt-[40px]" />
        <p className="mt-[12px] text-[14px]">
          <Link href={'/maler' as Route}>{t('seo.maler.teaser.all')} →</Link>
        </p>
      </div>
      {/* the index of informational articles carries no offer (D-235) */}
      <div className="pb-[72px]" />
    </div>
  )
}
