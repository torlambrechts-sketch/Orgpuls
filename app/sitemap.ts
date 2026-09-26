import type { MetadataRoute } from 'next'
import { EN_URL, MAIN_URL } from '@/lib/hosts'
import { ARTICLES, LANDING_PAGES, SITE_PAGES } from '@/lib/marketing/site'

/**
 * Every public page a search engine should know about, and nothing behind the sign-in: the
 * start page, the site's own pages, the landing pages, the article index and each article
 * with its own date. Each in Norwegian (www) with its English twin (en.orgpuls.com) as an
 * alternate, D-98.
 */
const entry = (path: string, rest: Omit<MetadataRoute.Sitemap[number], 'url' | 'alternates'>): MetadataRoute.Sitemap[number] => {
  const p = path === '/' ? '' : path
  return {
    url: `${MAIN_URL}${p || '/'}`,
    alternates: { languages: { nb: `${MAIN_URL}${p || '/'}`, en: `${EN_URL}${p || '/'}` } },
    ...rest,
  }
}
export default function sitemap(): MetadataRoute.Sitemap {
  const newest = ARTICLES.map((a) => a.modified)
    .sort()
    .at(-1)
  return [
    entry('/', { changeFrequency: 'monthly', priority: 1 }),
    ...SITE_PAGES.map((p) => entry(`/${p.slug}`, { changeFrequency: 'monthly', priority: 0.8 })),
    ...LANDING_PAGES.map((s) => entry(`/${s}`, { changeFrequency: 'monthly', priority: 0.8 })),
    entry('/artikler', { lastModified: newest, changeFrequency: 'weekly', priority: 0.7 }),
    ...ARTICLES.map((a) => entry(`/artikler/${a.slug}`, { lastModified: a.modified, changeFrequency: 'monthly', priority: 0.6 })),
  ]
}
