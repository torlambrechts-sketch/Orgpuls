import { byggOgAnlegg } from './bygg-og-anlegg'
import type { IndustryPage } from './types'

/**
 * The industry pages (§ B1). An entry with a `page` is drawn by the industry template; one
 * without keeps the site's landing page and its messages (`seo.lp.*`), as /helse-og-omsorg
 * does until it has a module of its own (open decision 7, D-118).
 */
export type IndustryEntry = { slug: IndustryPage['slug']; page: IndustryPage | null }

export const INDUSTRIES: IndustryEntry[] = [
  { slug: 'bygg-og-anlegg', page: byggOgAnlegg },
  { slug: 'helse-og-omsorg', page: null },
]

export const getIndustry = (slug: string): IndustryEntry | null => INDUSTRIES.find((i) => i.slug === slug) ?? null

/** Pages that are live, with a module: their question page is public and in the sitemap. */
export const liveQuestionPages = () =>
  INDUSTRIES.flatMap((i) => (i.page?.launched && i.page.module ? [i.page.slug] : []))
