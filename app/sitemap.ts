import type { MetadataRoute } from 'next'
import { absolute, ARTICLES, LANDING_PAGES, SITE_PAGES } from '@/lib/marketing/site'

/**
 * Every public page a search engine should know about, and nothing behind the sign-in: the
 * start page, the site's own pages, the landing pages, the article index and each article
 * with its own date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const newest = ARTICLES.map((a) => a.modified)
    .sort()
    .at(-1)
  return [
    { url: absolute('/'), changeFrequency: 'monthly', priority: 1 },
    ...SITE_PAGES.map((p) => ({ url: absolute(`/${p.slug}`), changeFrequency: 'monthly' as const, priority: 0.8 })),
    ...LANDING_PAGES.map((s) => ({ url: absolute(`/${s}`), changeFrequency: 'monthly' as const, priority: 0.8 })),
    { url: absolute('/artikler'), lastModified: newest, changeFrequency: 'weekly', priority: 0.7 },
    ...ARTICLES.map((a) => ({
      url: absolute(`/artikler/${a.slug}`),
      lastModified: a.modified,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
