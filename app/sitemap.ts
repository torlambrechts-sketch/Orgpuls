import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { EN_HOST, EN_URL, hostOf, MAIN_URL } from '@/lib/hosts'
import { ARTICLES, LANDING_PAGES, SITE_PAGES } from '@/lib/marketing/site'
import { getIndustry, INDUSTRIES, liveQuestionPages, pageIn } from '@/content/industries'
import { siteIndexing } from '@/lib/site/indexing'

/**
 * Every public page a search engine should know about, and nothing behind the sign-in: the
 * start page, the site's own pages, the landing pages, the article index and each article
 * with its own date. Each in Norwegian (www) with its English twin (en.orgpuls.com) as an
 * alternate, D-98.
 */
export const revalidate = 3600

/**
 * One sitemap per host (multilingual guide § 8, D-132): www.orgpuls.com lists its Norwegian
 * pages, en.orgpuls.com its English ones, each with the other as an alternate and x-default on
 * the Norwegian, as the pages' own <link rel=alternate> say (lib/marketing/meta.ts). A page that
 * exists in one language only is in that host's sitemap only, with no alternates.
 */
type Entry = MetadataRoute.Sitemap[number]
type Rest = Omit<Entry, 'url' | 'alternates'>

function sitemapFor(en: boolean) {
  const base = en ? EN_URL : MAIN_URL
  const at = (path: string) => (path === '/' ? '/' : path)
  /** a page in both languages */
  const entry = (path: string, rest: Rest): Entry => ({
    url: `${base}${at(path)}`,
    alternates: { languages: { nb: `${MAIN_URL}${at(path)}`, en: `${EN_URL}${at(path)}`, 'x-default': `${MAIN_URL}${at(path)}` } },
    ...rest,
  })
  /** a page in one language: listed on its own host only */
  const single = (path: string, lang: 'no' | 'en', rest: Rest): Entry[] => ((lang === 'en') === en ? [{ url: `${base}${at(path)}`, ...rest }] : [])
  /** an industry's page or question page: a twin where both languages are live, else wherever it is */
  const twinned = (path: string, no: boolean, enLive: boolean, rest: Rest): Entry[] =>
    no && enLive ? [entry(path, rest)] : no ? single(path, 'no', rest) : enLive ? single(path, 'en', rest) : []
  return { entry, single, twinned }
}

function questionPages(s: ReturnType<typeof sitemapFor>): MetadataRoute.Sitemap {
  const no = liveQuestionPages('no')
  const en = liveQuestionPages('en')
  const rest = { changeFrequency: 'monthly' as const, priority: 0.6 }
  return [...new Set([...no, ...en])].flatMap((slug) => s.twinned(`/${slug}/sporsmal`, no.includes(slug), en.includes(slug), rest))
}

/** An industry page: its address exists once launched, per language, with a twin only where both are (D-131) */
function industryPages(s: ReturnType<typeof sitemapFor>): MetadataRoute.Sitemap {
  const rest = { changeFrequency: 'monthly' as const, priority: 0.8 }
  return INDUSTRIES.flatMap((i) => s.twinned(`/${i.slug}`, !!pageIn(i, 'no')?.launched, !!pageIn(i, 'en')?.launched, rest))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // «Allow search engines» off (0126): nothing to offer
  if (!(await siteIndexing())) return []
  const s = sitemapFor(hostOf((await headers()).get('host')) === EN_HOST)
  const { entry } = s
  const newest = ARTICLES.map((a) => a.modified)
    .sort()
    .at(-1)
  return [
    entry('/', { changeFrequency: 'monthly', priority: 1 }),
    ...SITE_PAGES.map((p) => entry(`/${p.slug}`, { changeFrequency: 'monthly', priority: 0.8 })),
    // the landing pages; bygg's and helse's addresses are their industry pages now (D-213)
    ...LANDING_PAGES.filter((p) => !getIndustry(p)).map((p) => entry(`/${p}`, { changeFrequency: 'monthly', priority: 0.8 })),
    ...industryPages(s),
    // an industry's question page, per language once launched there; a twin only when both are (D-118, D-120)
    ...questionPages(s),
    entry('/artikler', { lastModified: newest, changeFrequency: 'weekly', priority: 0.7 }),
    ...ARTICLES.map((a) => entry(`/artikler/${a.slug}`, { lastModified: a.modified, changeFrequency: 'monthly', priority: 0.6 })),
    entry('/demo', { changeFrequency: 'yearly', priority: 0.6 }),
  ]
}
