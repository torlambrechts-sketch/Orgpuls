import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ArticleView } from '@/components/marketing/ArticleView'
import { pageMeta } from '@/lib/marketing/meta'
import { ARTICLES, articleBySlug, articleImage } from '@/lib/marketing/site'

/**
 * An article: one of the entries in lib/marketing/site.ts, else a 404. The CMS that could write one
 * is gone (D-230).
 */
export const dynamicParams = true

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const a = articleBySlug((await props.params).slug)
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
  const a = articleBySlug(slug)
  if (!a) notFound()
  return <ArticleView article={a} />
}
