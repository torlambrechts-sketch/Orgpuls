import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ArticleView } from '@/components/marketing/ArticleView'
import { pageMeta } from '@/lib/marketing/meta'
import { ARTICLES, articleBySlug, articleImage } from '@/lib/marketing/site'

/** An article, one per entry in lib/marketing/site.ts; any other slug is a 404. */
export const dynamicParams = false

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = articleBySlug((await params).slug)
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

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = articleBySlug((await params).slug)
  if (!a) notFound()
  return <ArticleView article={a} />
}
