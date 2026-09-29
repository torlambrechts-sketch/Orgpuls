import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PreviewBanner } from '@/components/industry/PreviewBanner'
import { parseContent, pathOf, type CmsPublic } from '@/lib/cms/content'
import { pageMeta } from '@/lib/marketing/meta'
import { ARTICLES } from '@/lib/marketing/site'
import { ArticleBody } from './ArticleView'
import { PageView } from './PageView'

/**
 * A page made in the CMS (0114, X-094), drawn by the site's own designed views: a landing page and
 * a document by PageView (the second without sign-up in the hero), a splash page by PageView with a
 * picture of the product and no trail back into the site, an article by ArticleBody. The layout
 * is the template's; the words are the page's; nothing here has a style of its own.
 */
export async function CmsView({ page }: { page: CmsPublic }) {
  const c = parseContent(page.content)
  if (!c) return null
  const t = await getTranslations()
  const path = pathOf(page.kind, page.slug)
  const banner = page.preview ? <PreviewBanner text={t('cms.preview')} /> : null

  if (page.layout === 'article') {
    const at = page.updated_at ?? page.published_at ?? new Date().toISOString()
    return (
      <>
        {banner}
        <ArticleBody
          content={{
            h1: c.h1,
            description: c.description,
            lead: c.lead,
            blocks: c.blocks,
            sources: c.sources,
            ctaTitle: c.finalTitle || t('start.finalTitle'),
            ctaBody: c.finalBody || t('start.finalBody'),
          }}
          path={path}
          published={(page.published_at ?? at).slice(0, 10)}
          modified={at.slice(0, 10)}
          next={null}
          related={ARTICLES.slice(0, 2).map((a) => a.slug)}
        />
      </>
    )
  }
  return (
    <>
      {banner}
      <PageView
        content={{ ...c, signupLabel: c.signupLabel || undefined }}
        path={path}
        plain={page.layout === 'document'}
        crumbs={page.layout !== 'splash'}
        heroShot={page.layout === 'splash' || page.layout === 'landing' ? (page.shot ?? undefined) : undefined}
      />
    </>
  )
}

/** Its metadata: title, description, canonical and hreflang (a twin only where both languages are live), noindex when asked or previewed */
export async function cmsMetadata(page: CmsPublic): Promise<Metadata> {
  const c = parseContent(page.content)
  if (!c) return {}
  const meta = await pageMeta({
    title: c.title,
    description: c.description,
    path: pathOf(page.kind, page.slug),
    type: page.layout === 'article' ? 'article' : 'website',
    published: page.published_at ?? undefined,
    modified: page.updated_at ?? undefined,
    noTwin: !page.twin,
  })
  return page.noindex || page.preview ? { ...meta, robots: { index: false, follow: !page.preview } } : meta
}
