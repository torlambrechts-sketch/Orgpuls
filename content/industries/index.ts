import { barnehageOgSkole } from './barnehage-og-skole'
import { byggOgAnlegg } from './bygg-og-anlegg'
import { byggOgAnleggEn } from './bygg-og-anlegg.en'
import { helseOgOmsorg } from './helse-og-omsorg'
import { helseOgOmsorgEn } from './helse-og-omsorg.en'
import { handel } from './handel'
import { kunnskapOgKontor } from './kunnskap-og-kontor'
import type { PageLang } from './modules'
import type { IndustryPage } from './types'
import { LANDING_PAGES } from '@/lib/marketing/site'

/**
 * The industry pages (§ B1). An entry with a `page` is drawn by the industry template once
 * launched (or with ?forhandsvis=1); until then, and for an entry without one, the address
 * keeps the site's landing page and its messages (`seo.lp.*`) (D-118, D-122).
 *
 * `pageEn` is the same page for en.orgpuls.com (D-120). Each language launches on its own:
 * the English one needs its own law items reviewed, since they paraphrase Norwegian statute.
 */
export type IndustryEntry = { slug: IndustryPage['slug']; page: IndustryPage | null; pageEn: IndustryPage | null }

export const INDUSTRIES: IndustryEntry[] = [
  { slug: 'bygg-og-anlegg', page: byggOgAnlegg, pageEn: byggOgAnleggEn },
  { slug: 'helse-og-omsorg', page: helseOgOmsorg, pageEn: helseOgOmsorgEn },
  // Norwegian only: the module has no English translation (D-131)
  { slug: 'barnehage-og-skole', page: barnehageOgSkole, pageEn: null },
  // Norwegian only, and a preview until launched: the module is a provisional draft (D-137)
  { slug: 'kunnskap-og-kontor', page: kunnskapOgKontor, pageEn: null },
  // Norwegian only, and a preview until launched: the module is a provisional draft (D-138)
  { slug: 'handel', page: handel, pageEn: null },
]

export const getIndustry = (slug: string): IndustryEntry | null => INDUSTRIES.find((i) => i.slug === slug) ?? null

/** The entry's page in a language, launched or not */
export const pageIn = (entry: IndustryEntry | null, lang: PageLang) => (lang === 'en' ? entry?.pageEn : entry?.page) ?? null

/**
 * Whether the address shows a page to anyone in this language: the industry page once
 * launched, or the landing page it had before. An industry that never had a landing page
 * (barnehage og skole) is nowhere until its page launches, so the menu and the hub leave it out.
 */
export const hasPublicPage = (entry: IndustryEntry | null, lang: PageLang) =>
  !!entry && (!!pageIn(entry, lang)?.launched || (LANDING_PAGES as readonly string[]).includes(entry.slug))

/** Pages that are live, with a module: their question page is public and in the sitemap. */
export const liveQuestionPages = (lang: PageLang = 'no') =>
  INDUSTRIES.flatMap((i) => {
    const p = pageIn(i, lang)
    return p?.launched && p.module && p.questionPage ? [p.slug] : []
  })
