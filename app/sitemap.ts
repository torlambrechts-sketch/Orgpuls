import type { MetadataRoute } from 'next'
import { EN_URL, MAIN_URL } from '@/lib/hosts'
import { archive } from '@/lib/crm/read'
import { ARTICLES, LANDING_PAGES, SITE_PAGES } from '@/lib/marketing/site'

/**
 * Every public page a search engine should know about, and nothing behind the sign-in: the
 * start page, the site's own pages, the landing pages, the article index and each article
 * with its own date. Each in Norwegian (www) with its English twin (en.orgpuls.com) as an
 * alternate, D-98. The newsletter's signup and archive index are translated like the rest;
 * the issues themselves (D-103) are Norwegian only, each with the date it went out, and
 * their pages say so: canonical on www, no English twin (D-104).
 */
export const revalidate = 3600

const entry = (path: string, rest: Omit<MetadataRoute.Sitemap[number], 'url' | 'alternates'>): MetadataRoute.Sitemap[number] => {
  const p = path === '/' ? '' : path
  return {
    url: `${MAIN_URL}${p || '/'}`,
    alternates: { languages: { nb: `${MAIN_URL}${p || '/'}`, en: `${EN_URL}${p || '/'}` } },
    ...rest,
  }
}
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const issues = await archive()
  const newest = ARTICLES.map((a) => a.modified)
    .sort()
    .at(-1)
  return [
    entry('/', { changeFrequency: 'monthly', priority: 1 }),
    ...SITE_PAGES.map((p) => entry(`/${p.slug}`, { changeFrequency: 'monthly', priority: 0.8 })),
    ...LANDING_PAGES.map((s) => entry(`/${s}`, { changeFrequency: 'monthly', priority: 0.8 })),
    entry('/artikler', { lastModified: newest, changeFrequency: 'weekly', priority: 0.7 }),
    ...ARTICLES.map((a) => entry(`/artikler/${a.slug}`, { lastModified: a.modified, changeFrequency: 'monthly', priority: 0.6 })),
    entry('/nyhetsbrev', { changeFrequency: 'yearly', priority: 0.4 }),
    entry('/nyhetsbrev/arkiv', { lastModified: issues[0]?.published_at, changeFrequency: 'weekly', priority: 0.5 }),
    ...issues.map((i) => ({ url: `${MAIN_URL}/nyhetsbrev/arkiv/${i.slug}`, lastModified: i.published_at, changeFrequency: 'yearly' as const, priority: 0.5 })),
  ]
}
