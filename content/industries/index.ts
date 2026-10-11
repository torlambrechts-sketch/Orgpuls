import { barnehageOgSkole } from './barnehage-og-skole'
import { barnehageOgSkoleEn } from './barnehage-og-skole.en'
import { byggOgAnlegg } from './bygg-og-anlegg'
import { byggOgAnleggEn } from './bygg-og-anlegg.en'
import { helseOgOmsorg } from './helse-og-omsorg'
import { helseOgOmsorgEn } from './helse-og-omsorg.en'
import { handel } from './handel'
import { handelEn } from './handel.en'
import { kunnskapOgKontor } from './kunnskap-og-kontor'
import { kunnskapOgKontorEn } from './kunnskap-og-kontor.en'
import type { PageLang } from './modules'
import type { IndustryPage } from './types'
import { INDUSTRY_META } from './meta'

/**
 * The industries (§ B1): one entry per address, in Norwegian (`page`) and English (`pageEn`, D-120;
 * on www.orgpuls.com in English since en.orgpuls.com moved, D-275). The page at the address is the landing template
 * (content/industries/landing.ts, D-207); what an entry carries is what the rest of the site needs:
 * the menu name, whether it is live in that language, the module, and the question page.
 */
export type IndustryEntry = { slug: IndustryPage['slug']; page: IndustryPage | null; pageEn: IndustryPage | null }

const ENTRIES: IndustryEntry[] = [
  { slug: 'bygg-og-anlegg', page: byggOgAnlegg, pageEn: byggOgAnleggEn },
  { slug: 'helse-og-omsorg', page: helseOgOmsorg, pageEn: helseOgOmsorgEn },
  // English since D-214, when their module files gained their English translations
  { slug: 'barnehage-og-skole', page: barnehageOgSkole, pageEn: barnehageOgSkoleEn },
  { slug: 'kunnskap-og-kontor', page: kunnskapOgKontor, pageEn: kunnskapOgKontorEn },
  { slug: 'handel', page: handel, pageEn: handelEn },
]

/** In the registry's order (content/industries/meta.ts `sortOrder`): menu, cards, footer, sitemap */
export const INDUSTRIES: IndustryEntry[] = [...ENTRIES].sort(
  (a, b) => (INDUSTRY_META.find((m) => m.slug === a.slug)?.sortOrder ?? 99) - (INDUSTRY_META.find((m) => m.slug === b.slug)?.sortOrder ?? 99),
)

/** «Ny» on a card: the page is launched and its date has not passed (innstillinger-og-forside.md § 5.1) */
export const isNewIndustry = (page: IndustryPage | null, today: string) =>
  !!page?.launched && !!page.card?.newUntil && today <= page.card.newUntil

export const getIndustry = (slug: string): IndustryEntry | null => INDUSTRIES.find((i) => i.slug === slug) ?? null

/** The entry's page in a language, launched or not */
export const pageIn = (entry: IndustryEntry | null, lang: PageLang) => (lang === 'en' ? entry?.pageEn : entry?.page) ?? null

/** Whether the address shows a page to anyone in this language; the menu, the cards and the hub follow it */
export const hasPublicPage = (entry: IndustryEntry | null, lang: PageLang) => !!pageIn(entry, lang)?.launched

/** Pages that are live, with a module: their question page is public and in the sitemap. */
export const liveQuestionPages = (lang: PageLang = 'no') =>
  INDUSTRIES.flatMap((i) => {
    const p = pageIn(i, lang)
    return p?.launched && p.module && p.questionPage ? [p.slug] : []
  })
