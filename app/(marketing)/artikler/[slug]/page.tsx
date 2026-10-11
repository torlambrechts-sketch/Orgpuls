import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ArticleView } from '@/components/marketing/ArticleView'
import { pageMeta } from '@/lib/marketing/meta'
import { articleImage } from '@/lib/marketing/site'
import { articleIn, articlesOf, NORWAY_ARTICLES } from '@/lib/marketing/site-articles'
import { siteArticles } from '@/lib/site/own'

/**
 * An article: one of the articles this site publishes (lib/marketing/site-articles.ts, D-277), else a
 * 404: Norway's on Norway's hosts, Empvibe's own on Empvibe's. The CMS that could write one is gone
 * (D-230).
 */
export const dynamicParams = true

export function generateStaticParams() {
  return [...NORWAY_ARTICLES.articles, ...articlesOf('empvibe').articles].map((a) => ({ slug: a.slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const a = articleIn(await siteArticles(), (await props.params).slug)
  if (!a) return {}
  const t = await getTranslations()
  return pageMeta({
    title: t(`seo.articles.${a.key}.title`),
    description: t(`seo.articles.${a.key}.description`),
    path: `/artikler/${a.slug}`,
    type: 'article',
    published: a.published,
    modified: a.modified,
    image: articleImage(a.slug),
  })
}

export default async function ArticlePage(props: Props) {
  const { slug } = await props.params
  const a = articleIn(await siteArticles(), slug)
  if (!a) notFound()
  return <ArticleView article={a} />
}
