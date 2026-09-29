import { hasPublicPage, INDUSTRIES, pageIn } from '@/content/industries'
import { ARTICLES, LANDING_PAGES, landingKey, SITE_PAGES, type LandingSlug } from '@/lib/marketing/site'

/**
 * Every page of the public site that is code (X-094): the start page, the site's own pages, the
 * landing and industry pages, the articles and the indexes. Their layout is the design's and is
 * pixel-gated, so the CMS does not draw them; it lists them beside its own pages, scores their
 * title and description, shows their traffic, and edits their words where the words are messages
 * (the overrides of 0101). An industry page's words are its content file, reviewed with its module.
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
  /** an industry page's words, from content/industries, per language, where the page is live */
  industry?: { no: { title: string; description: string } | null; en: { title: string; description: string } | null }
}

/** the site's pages whose metadata is not under seo.pages.<key> */
const OWN: Partial<Record<(typeof SITE_PAGES)[number]['key'], { title: string; description: string }>> = {
  hvorfor: { title: 'site.hvorfor.seoTitle', description: 'site.hvorfor.seoDescription' },
}

export function designedPages(): DesignedPage[] {
  const industries = new Set(INDUSTRIES.map((i) => i.slug as string))
  const pages: DesignedPage[] = [
    { path: '/', group: 'home', title: 'seo.home.title', description: 'seo.home.description' },
    ...SITE_PAGES.map((p) => ({
      path: `/${p.slug}`,
      group: 'site' as const,
      ...(OWN[p.key] ?? { title: `seo.pages.${p.key}.title`, description: `seo.pages.${p.key}.description` }),
    })),
    ...LANDING_PAGES.filter((s) => !industries.has(s)).map((s) => landing(s)),
    ...INDUSTRIES.filter((i) => hasPublicPage(i, 'no') || hasPublicPage(i, 'en')).map((i): DesignedPage => {
      const meta = (lang: 'no' | 'en') => {
        const p = pageIn(i, lang)
        return p?.launched ? p.seo : null
      }
      const no = meta('no')
      const en = meta('en')
      // before launch an industry's address shows the landing page it had, whose words are messages
      if (!no && !en && (LANDING_PAGES as readonly string[]).includes(i.slug)) return { ...landing(i.slug as LandingSlug), group: 'industry' }
      return { path: `/${i.slug}`, group: 'industry', industry: { no, en } }
    }),
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
