import { EMPVIBE_ARTICLE_GROUPS, EMPVIBE_ARTICLES, EMPVIBE_LANDING_ARTICLES, EMPVIBE_QUESTIONS_ARTICLE } from './articles-empvibe'
import { ARTICLE_GROUPS, ARTICLES, LANDING_ARTICLES, type Article, type ArticleGroup, type LandingSlug } from './site'

/**
 * The articles a site publishes (UK-H, D-277): Norway's on Norway's hosts (lib/marketing/site.ts),
 * Empvibe's own on Empvibe's (lib/marketing/articles-empvibe.ts), none on Sweden's, which serves no
 * /artikler. Every page that lists, links or describes an article reads the request's set
 * (lib/site/own.ts siteArticles), so a site never links an article it does not serve.
 */
export type SiteArticles = {
  articles: readonly Article[]
  /** the index's sections, in order; their words are `seo.index.groups.<group>` */
  groups: readonly ArticleGroup[]
  /** the two articles under each landing page */
  landing: Partial<Record<LandingSlug, [string, string]>>
  /** the article on a survey's questions, which the start page and Plattform link to */
  questions: string | null
}

export const NORWAY_ARTICLES: SiteArticles = {
  articles: ARTICLES,
  groups: ARTICLE_GROUPS,
  landing: LANDING_ARTICLES,
  questions: 'medarbeiderundersokelse-sporsmal',
}

const NO_ARTICLES: SiteArticles = { articles: [], groups: [], landing: {}, questions: null }

/** A site of its own's articles, by its key (lib/hosts.ts `Site.own.key`) */
const OWN_ARTICLES: Readonly<Record<string, SiteArticles>> = {
  empvibe: {
    articles: EMPVIBE_ARTICLES,
    groups: EMPVIBE_ARTICLE_GROUPS,
    landing: EMPVIBE_LANDING_ARTICLES,
    questions: EMPVIBE_QUESTIONS_ARTICLE,
  },
}

/** The articles of the site with this key: Norway's where there is none (Norway's hosts, local, a preview) */
export const articlesOf = (key: string | null | undefined): SiteArticles => (key ? (OWN_ARTICLES[key] ?? NO_ARTICLES) : NORWAY_ARTICLES)

/** One of a site's articles by its slug, or null where the site does not publish it */
export const articleIn = (set: SiteArticles, slug: string): Article | null => set.articles.find((a) => a.slug === slug) ?? null
