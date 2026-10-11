import type { MetadataRoute } from 'next'
import { MAIN_URL } from '@/lib/hosts'
import { ARTICLES, LANDING_PAGES, SITE_PAGES } from '@/lib/marketing/site'
import { TEMPLATES } from '@/lib/marketing/templates'
import { getIndustry, INDUSTRIES, liveQuestionPages, pageIn } from '@/content/industries'
import { siteIndexing } from '@/lib/site/indexing'
import { ownSite, siteArticles } from '@/lib/site/own'

/**
 * Every public page a search engine should know about, and nothing behind the sign-in: the
 * start page, the site's own pages, the landing pages, the article index and each article
 * with its own date.
 */
export const revalidate = 3600

/**
 * One sitemap per host (multilingual guide § 8, D-132). Norway's lists its pages at their one
 * address on www.orgpuls.com, in Norwegian, with no alternates: en.orgpuls.com, the English twin
 * each page named (D-98), moved at UK-G (D-275), and English on www is a choice on the same address.
 * An industry's page is listed once it is live in Norwegian. A site of its own lists its own pages.
 */
type Entry = MetadataRoute.Sitemap[number]

const entry = (path: string, rest: Omit<Entry, 'url'>): Entry => ({ url: `${MAIN_URL}${path}`, ...rest })

function questionPages(): MetadataRoute.Sitemap {
  return liveQuestionPages('no').map((slug) => entry(`/${slug}/sporsmal`, { changeFrequency: 'monthly', priority: 0.6 }))
}

/** An industry page: its address exists once launched in Norwegian (D-131) */
function industryPages(): MetadataRoute.Sitemap {
  return INDUSTRIES.filter((i) => pageIn(i, 'no')?.launched).map((i) => entry(`/${i.slug}`, { changeFrequency: 'monthly', priority: 0.8 }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // «Allow search engines» off (0126): nothing to offer
  if (!(await siteIndexing())) return []
  // a site of its own (D-270): the pages it serves, at its own addresses, and no twins on Orgpuls's hosts;
  // its articles (Empvibe's, D-277) with their own dates, and the index with the newest
  const own = await ownSite()
  if (own) {
    const { articles } = await siteArticles()
    const dated = new Map(articles.map((a) => [`/artikler/${a.slug}`, a.modified]))
    const latest = articles.map((a) => a.modified).sort().at(-1)
    return own.site.own.pages.map((route) =>
      route === '/artikler'
        ? { url: own.absolute(route), lastModified: latest, changeFrequency: 'weekly' as const, priority: 0.7 }
        : dated.has(route)
          ? { url: own.absolute(route), lastModified: dated.get(route), changeFrequency: 'monthly' as const, priority: 0.6 }
          : { url: own.absolute(route), changeFrequency: 'monthly' as const, priority: route === '/' ? 1 : 0.8 },
    )
  }
  const newest = ARTICLES.map((a) => a.modified)
    .sort()
    .at(-1)
  return [
    entry('/', { changeFrequency: 'monthly', priority: 1 }),
    ...SITE_PAGES.map((p) => entry(`/${p.slug}`, { changeFrequency: 'monthly', priority: 0.8 })),
    // the landing pages; bygg's and helse's addresses are their industry pages now (D-213)
    ...LANDING_PAGES.filter((p) => !getIndustry(p)).map((p) => entry(`/${p}`, { changeFrequency: 'monthly', priority: 0.8 })),
    ...industryPages(),
    // an industry's question page, once launched (D-118, D-120)
    ...questionPages(),
    entry('/artikler', { lastModified: newest, changeFrequency: 'weekly', priority: 0.7 }),
    ...ARTICLES.map((a) => entry(`/artikler/${a.slug}`, { lastModified: a.modified, changeFrequency: 'monthly', priority: 0.6 })),
    // the free templates (D-241): the index and each template's page
    entry('/maler', { changeFrequency: 'monthly', priority: 0.7 }),
    ...TEMPLATES.map((t) => entry(`/maler/${t.slug}`, { changeFrequency: 'monthly', priority: 0.7 })),
    entry('/demo', { changeFrequency: 'yearly', priority: 0.6 }),
  ]
}
