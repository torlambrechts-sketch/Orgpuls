import { LANDINGS } from '@/content/industries/landing'
import { ARTICLES, LANDING_PAGES, landingKey, SITE_PAGES, type LandingSlug } from '@/lib/marketing/site'

/**
 * Every page of the public site that is code (X-094): the start page, the site's own pages, the
 * landing and industry pages, the articles and the indexes. Their layout is the design's and is
 * pixel-gated, so the CMS does not draw them; it lists them beside its own pages, scores their
 * title and description, shows their traffic, and edits their words where the words are messages
 * (the overrides of 0101). An industry page's are too: the landing template's (`site.bransje.<msg>`, D-207).
 *
 * The meta keys are the ones each page's generateMetadata reads; `suffix` is what it appends.
 */
export type DesignedGroup = 'home' | 'site' | 'landing' | 'industry' | 'article' | 'index'
export type DesignedPage = {
  path: string
  group: DesignedGroup
  /** message keys of the title and description, when they are messages */
  title?: string
  description?: string
  suffix?: string
  /** the languages the page is live in, where that is not both (an industry page launches per language) */
  live?: { no: boolean; en: boolean }
}

/** the site's pages whose metadata is not under seo.pages.<key> */
const OWN: Partial<Record<(typeof SITE_PAGES)[number]['key'], { title: string; description: string }>> = {
  hvorfor: { title: 'site.hvorfor.seoTitle', description: 'site.hvorfor.seoDescription' },
}

export function designedPages(): DesignedPage[] {
  const industries = new Set(LANDINGS.map((l) => l.slug as string))
  const pages: DesignedPage[] = [
    { path: '/', group: 'home', title: 'seo.home.title', description: 'seo.home.description' },
    ...SITE_PAGES.map((p) => ({
      path: `/${p.slug}`,
      group: 'site' as const,
      ...(OWN[p.key] ?? { title: `seo.pages.${p.key}.title`, description: `seo.pages.${p.key}.description` }),
    })),
    ...LANDING_PAGES.filter((s) => !industries.has(s)).map((s) => landing(s)),
    // the industry pages: the landing template's title and description, where it is live (D-207)
    ...LANDINGS.filter((l) => l.live.no || l.live.en).map(
      (l): DesignedPage => ({
        path: `/${l.slug}`,
        group: 'industry',
        title: `site.bransje.${l.msg}.seo.title`,
        description: `site.bransje.${l.msg}.seo.description`,
        live: l.live,
      }),
    ),
    { path: '/artikler', group: 'index', title: 'seo.index.title', description: 'seo.index.description' },
    ...ARTICLES.map((a) => ({
      path: `/artikler/${a.slug}`,
      group: 'article' as const,
      title: `seo.articles.${a.key}.title`,
      description: `seo.articles.${a.key}.description`,
    })),
    { path: '/demo', group: 'site', title: 'demo.metaTitle', description: 'demo.metaDescription', suffix: ' · Orgpuls' },
    { path: '/nyhetsbrev', group: 'site', title: 'newsletter.title', description: 'newsletter.lead', suffix: ' · Orgpuls' },
    { path: '/nyhetsbrev/arkiv', group: 'index', title: 'archive.title', description: 'archive.description', suffix: ' · Orgpuls' },
  ]
  return pages
}

function landing(slug: LandingSlug): DesignedPage {
  const k = `seo.lp.${landingKey(slug)}`
  return { path: `/${slug}`, group: 'landing', title: `${k}.title`, description: `${k}.description` }
}
