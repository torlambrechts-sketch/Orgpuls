import type { Metadata, Route } from 'next'
import Link from '@/components/site/SitePaths'
import { getLocale, getTranslations } from 'next-intl/server'
import { ArticleCards } from '@/components/marketing/ArticleCards'
import { JsonLd } from '@/components/marketing/JsonLd'
import { TemplateTeaser } from '@/components/marketing/TemplateTeaser'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph, ldLanguage, organization, siteLd } from '@/lib/marketing/schema'
import { ownSite, serves, siteArticles } from '@/lib/site/own'

/**
 * The article index: every article this site publishes (lib/marketing/site-articles.ts, D-278), in its
 * section (D-250) and newest first within it. Informational, no offer (D-235); under the articles, the
 * free templates (D-243), where the site serves them (Norway's).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({ title: t('seo.index.title'), description: t('seo.index.description'), path: '/artikler' })
}

export default async function ArticleIndex() {
  const t = await getTranslations()
  const { articles, groups } = await siteArticles()
  const ld = await siteLd()
  const own = await ownSite()
  return (
    <div>
      <JsonLd
        data={graph(
          organization(ld),
          {
            '@type': 'CollectionPage',
            url: ld.absolute('/artikler'),
            name: t('seo.index.title'),
            description: t('seo.index.description'),
            inLanguage: ld.tag ?? ldLanguage(await getLocale()),
            hasPart: [
              ...articles.map((a) => ({
                '@type': 'Article',
                url: ld.absolute(`/artikler/${a.slug}`),
                headline: t(`seo.articles.${a.key}.h1`).replace(/\u00ad/g, ''),
              })),
            ],
          },
          breadcrumbs(
            [
              { name: t('seo.common.home'), path: '/' },
              { name: t('seo.index.crumb'), path: '/artikler' },
            ],
            ld,
          ),
        )}
      />
      <div className="mx-auto max-w-[1120px] px-[26px] pt-[54px]">
        <span className="block text-[11px] uppercase tracking-[0.12em] text-mut">{t('seo.index.eyebrow')}</span>
        <h1 className="mt-[9px] max-w-[22ch] font-display text-[clamp(30px,4.6vw,46px)] font-semibold leading-[1.1] [text-wrap:balance]">
          {t('seo.index.h1')}
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[16.5px] leading-[1.65] text-body [text-wrap:pretty]">{t('seo.index.lead')}</p>
        {/* the sections (D-250): where to start, the law, carrying it out, after the results, the eleven factors */}
        {groups.map((g) => (
          <section key={g} id={g} aria-labelledby={`gruppe-${g}`} className="mt-[44px] scroll-mt-[118px]">
            <h2 id={`gruppe-${g}`} className="font-display text-[clamp(23px,3vw,29px)] font-semibold leading-[1.18] [text-wrap:balance]">
              {t(`seo.index.groups.${g}.title`)}
            </h2>
            <p className="mt-[6px] max-w-[60ch] text-[15px] leading-[1.6] text-mut [text-wrap:pretty]">{t(`seo.index.groups.${g}.text`)}</p>
            <ArticleCards slugs={articles.filter((a) => a.group === g).map((a) => a.slug)} />
          </section>
        ))}
        {/* the free templates beside the articles (D-243): a resource, named for what it is, where the site serves them */}
        {serves(own, '/maler') ? (
          <>
            <TemplateTeaser slug="kartleggingspakken" className="mt-[40px]" />
            <p className="mt-[12px] text-[14px]">
              <Link href={'/maler' as Route}>{t('seo.maler.teaser.all')} →</Link>
            </p>
          </>
        ) : null}
      </div>
      {/* the index of informational articles carries no offer (D-235) */}
      <div className="pb-[72px]" />
    </div>
  )
}
