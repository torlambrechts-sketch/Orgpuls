import type { Article, ArticleGroup, LandingSlug } from './site'

/**
 * Empvibe's articles (UK-H, D-277): written for the United Kingdom, in British English, on UK law
 * as docs/markets/uk-legal.md sets it out, for the searches a UK employer makes (the topic plan in
 * docs/markets/uk-articles.md). Their words are the gb pack's (messages/market/gb/en.json
 * `seo.articles.<key>`), so none of Norway's articles is shown on Empvibe's site, and none of these
 * on Norway's.
 *
 * Data only, edge-safe: lib/hosts.ts reads the slugs for the pages Empvibe's site serves and their
 * addresses (/articles/<slug>). Kept apart from lib/marketing/site.ts, whose entries
 * scripts/marketing/og-images.mjs reads as Norway's.
 */

/** The index's sections on Empvibe's site, in order: where to start, the law, carrying it out, after the results */
export const EMPVIBE_ARTICLE_GROUPS: readonly ArticleGroup[] = ['start', 'lov', 'gjennomforing', 'etter']

/** Newest first, as the index lists them within each section */
export const EMPVIBE_ARTICLES: Article[] = []

/** Which articles each of Empvibe's landing pages points to */
export const EMPVIBE_LANDING_ARTICLES: Partial<Record<LandingSlug, [string, string]>> = {}

/** The article on the questions a survey asks, linked from the start page's survey and the platform's */
export const EMPVIBE_QUESTIONS_ARTICLE: string | null = null
