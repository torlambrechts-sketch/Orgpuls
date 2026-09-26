import { byggOgAnlegg } from './bygg-og-anlegg'
import { byggOgAnleggEn } from './bygg-og-anlegg.en'
import type { PageLang } from './modules'
import type { IndustryPage } from './types'

/**
 * The industry pages (§ B1). An entry with a `page` is drawn by the industry template; one
 * without keeps the site's landing page and its messages (`seo.lp.*`), as /helse-og-omsorg
 * does until it has a module of its own (open decision 7, D-118).
 *
 * `pageEn` is the same page for en.orgpuls.com (D-120). Each language launches on its own:
 * the English one needs its own law items reviewed, since they paraphrase Norwegian statute.
 */
export type IndustryEntry = { slug: IndustryPage['slug']; page: IndustryPage | null; pageEn: IndustryPage | null }

export const INDUSTRIES: IndustryEntry[] = [
  { slug: 'bygg-og-anlegg', page: byggOgAnlegg, pageEn: byggOgAnleggEn },
  { slug: 'helse-og-omsorg', page: null, pageEn: null },
]

export const getIndustry = (slug: string): IndustryEntry | null => INDUSTRIES.find((i) => i.slug === slug) ?? null

/** The entry's page in a language, launched or not */
export const pageIn = (entry: IndustryEntry | null, lang: PageLang) => (lang === 'en' ? entry?.pageEn : entry?.page) ?? null

/** Pages that are live, with a module: their question page is public and in the sitemap. */
export const liveQuestionPages = (lang: PageLang = 'no') =>
  INDUSTRIES.flatMap((i) => {
    const p = pageIn(i, lang)
    return p?.launched && p.module && p.questionPage ? [p.slug] : []
  })
