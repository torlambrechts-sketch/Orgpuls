import type { Metadata, Route } from 'next'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { ArticleView } from '@/components/marketing/ArticleView'
import { CmsView, cmsMetadata } from '@/components/marketing/CmsView'
import { cmsPage, cmsPreview, cmsRedirect } from '@/lib/cms/read'
import { pageMeta } from '@/lib/marketing/meta'
import { ARTICLES, articleBySlug, articleImage } from '@/lib/marketing/site'

/**
 * An article: one of the entries in lib/marketing/site.ts, else one written in the CMS and live in
 * the site's language (0114, X-094), or its draft through a preview link (?cms=<token>); else an
 * address the admin has redirected; else a 404.
 */
export const dynamicParams = true

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }))
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ cms?: string; cmsl?: string }> }

async function cmsAt(props: Props) {
  const { slug } = await props.params
  const { cms: token, cmsl } = await props.searchParams
  const lang = await getLocale()
  // a preview names the draft's language, since one host serves both languages outside production
  return token ? cmsPreview(token, 'article', slug, cmsl === 'en' || cmsl === 'no' ? cmsl : lang) : cmsPage('article', slug, lang)
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const a = articleBySlug((await props.params).slug)
  if (!a) {
    const cms = await cmsAt(props)
    return cms ? cmsMetadata(cms) : {}
  }
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
  if (a) return <ArticleView article={a} />
  const cms = await cmsAt(props)
  if (cms) return <CmsView page={cms} />
  const moved = await cmsRedirect(`/artikler/${slug}`)
  if (moved) (moved.permanent ? permanentRedirect : redirect)(moved.to as Route)
  notFound()
}
