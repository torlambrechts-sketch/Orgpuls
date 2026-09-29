import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { EN_HOST, EN_URL, hostOf, MAIN_URL } from '@/lib/hosts'
import { archive } from '@/lib/crm/read'
import { cmsList } from '@/lib/cms/read'
import { pathOf, type CmsKind } from '@/lib/cms/content'
import { ARTICLES, LANDING_PAGES, SITE_PAGES } from '@/lib/marketing/site'
import { INDUSTRIES, liveQuestionPages, pageIn } from '@/content/industries'

/**
 * Every public page a search engine should know about, and nothing behind the sign-in: the
 * start page, the site's own pages, the landing pages, the article index and each article
 * with its own date. Each in Norwegian (www) with its English twin (en.orgpuls.com) as an
 * alternate, D-98. The newsletter's signup and archive index are translated like the rest;
 * the issues themselves (D-103) are Norwegian only, each with the date it went out, and
 * their pages say so: canonical on www, no English twin (D-104).
 */
export const revalidate = 3600

/**
 * One sitemap per host (multilingual guide § 8, D-132): www.orgpuls.com lists its Norwegian
 * pages, en.orgpuls.com its English ones, each with the other as an alternate and x-default on
 * the Norwegian, as the pages' own <link rel=alternate> say (lib/marketing/meta.ts). A page that
 * exists in one language only is in that host's sitemap only, with no alternates. IndexNow reads
 * www's (supabase/functions/orgpuls-seo) and announces the English twins from its alternates.
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

/**
 * An industry page that never had a landing page (barnehage og skole, D-131): its address
 * exists only once launched, per language, with a twin only where both are.
 */
function industryPages(s: ReturnType<typeof sitemapFor>): MetadataRoute.Sitemap {
  const landing = LANDING_PAGES as readonly string[]
  const rest = { changeFrequency: 'monthly' as const, priority: 0.8 }
  return INDUSTRIES.filter((i) => !landing.includes(i.slug)).flatMap((i) =>
    s.twinned(`/${i.slug}`, !!pageIn(i, 'no')?.launched, !!pageIn(i, 'en')?.launched, rest),
  )
}

/**
 * The pages made in the CMS (0114, X-094) that are live and may be indexed: per language, a twin
 * where both are live, each with the time it last changed.
 */
async function cmsPages(s: ReturnType<typeof sitemapFor>): Promise<MetadataRoute.Sitemap> {
  const kinds: CmsKind[] = ['page', 'article']
  const out: MetadataRoute.Sitemap = []
  for (const kind of kinds) {
    const [no, en] = await Promise.all([cmsList(kind, 'no'), cmsList(kind, 'en')])
    const slugs = [...new Set([...no, ...en].filter((p) => !p.noindex).map((p) => p.slug))]
    for (const slug of slugs) {
      const n = no.find((p) => p.slug === slug && !p.noindex)
      const e = en.find((p) => p.slug === slug && !p.noindex)
      const at = [n?.updated_at, e?.updated_at].filter((x): x is string => !!x).sort().at(-1)
      out.push(...s.twinned(pathOf(kind, slug), !!n, !!e, { lastModified: at, changeFrequency: 'monthly', priority: kind === 'article' ? 0.6 : 0.7 }))
    }
  }
  return out
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = sitemapFor(hostOf((await headers()).get('host')) === EN_HOST)
  const { entry } = s
  const issues = await archive()
  const newest = ARTICLES.map((a) => a.modified)
    .sort()
    .at(-1)
  return [
    entry('/', { changeFrequency: 'monthly', priority: 1 }),
    ...SITE_PAGES.map((p) => entry(`/${p.slug}`, { changeFrequency: 'monthly', priority: 0.8 })),
    ...LANDING_PAGES.map((s) => entry(`/${s}`, { changeFrequency: 'monthly', priority: 0.8 })),
    ...industryPages(s),
    // an industry's question page, per language once launched there; a twin only when both are (D-118, D-120)
    ...questionPages(s),
    entry('/artikler', { lastModified: newest, changeFrequency: 'weekly', priority: 0.7 }),
    ...ARTICLES.map((a) => entry(`/artikler/${a.slug}`, { lastModified: a.modified, changeFrequency: 'monthly', priority: 0.6 })),
    entry('/demo', { changeFrequency: 'yearly', priority: 0.6 }),
    entry('/nyhetsbrev', { changeFrequency: 'yearly', priority: 0.4 }),
    entry('/nyhetsbrev/arkiv', { lastModified: issues[0]?.published_at, changeFrequency: 'weekly', priority: 0.5 }),
    // the issues are Norwegian only (D-104): www's sitemap only
    ...issues.flatMap((i) => s.single(`/nyhetsbrev/arkiv/${i.slug}`, 'no', { lastModified: i.published_at, changeFrequency: 'yearly', priority: 0.5 })),
    ...(await cmsPages(s)),
  ]
}
