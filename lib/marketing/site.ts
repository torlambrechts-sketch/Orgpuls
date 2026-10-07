/**
 * The public site's registry: which landing pages and articles exist, where they live and
 * how they link to each other. The words are messages (`seo.*` in /messages); this file
 * holds only what is not words — slugs, dates, and the links between pages — so adding an
 * article is an entry here and a message key, never a component change.
 */
import type { ShotId } from './shot-ids'

export const SITE_URL = 'https://www.orgpuls.com'

export const absolute = (path: string) => `${SITE_URL}${path === '/' ? '' : path}`

/** Landing pages, one per search intent. The slug is the route and the message key. */
export const LANDING_PAGES = ['lovkrav', 'verneombud', 'smaa-bedrifter', 'bygg-og-anlegg', 'helse-og-omsorg'] as const
export type LandingSlug = (typeof LANDING_PAGES)[number]

/** A landing page's message key: slugs with hyphens are camel-cased in the messages. */
export const landingKey = (slug: LandingSlug) => slug.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())

export type Article = {
  slug: string
  /** its message key under seo.articles */
  key: string
  published: string
  modified: string
  /** two other articles, by slug, shown under "Les også" */
  related: [string, string]
  /**
   * the picture beside the title (D-237): a drawing by kind (components/marketing/art/ArticleArt), or
   * `factor:<key>` for a factor article, whose picture is its own three statements
   */
  art: string
}

/** Newest first: the order the index lists them in. */
export const ARTICLES: Article[] = [
  {
    slug: 'fra-resultater-til-tiltak',
    key: 'resultaterTilTiltak',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['slik-gar-dere-gjennom-resultatene-med-de-ansatte', 'risikovurdering-av-psykososialt-arbeidsmiljo'],
    art: 'board',
  },
  {
    slug: 'slik-gar-dere-gjennom-resultatene-med-de-ansatte',
    key: 'gjennomgang',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['fra-resultater-til-tiltak', 'anonym-medarbeiderundersokelse'],
    art: 'meeting',
  },
  {
    slug: 'risikovurdering-av-psykososialt-arbeidsmiljo',
    key: 'risikovurdering',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'fra-resultater-til-tiltak'],
    art: 'risk',
  },
  {
    slug: 'arbeidsmengde-og-tidspress',
    key: 'arbeidsmengde',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['fra-resultater-til-tiltak', 'risikovurdering-av-psykososialt-arbeidsmiljo'],
    art: 'factor:mengde',
  },
  {
    slug: 'ytringsklima',
    key: 'faktorYtring',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['integritet-og-verdighet', 'stotte-fra-leder'],
    art: 'factor:ytring',
  },
  {
    slug: 'rolleklarhet',
    key: 'faktorRolle',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['motstridende-krav', 'stotte-fra-leder'],
    art: 'factor:rolle',
  },
  {
    slug: 'motstridende-krav',
    key: 'faktorMotstrid',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['rolleklarhet', 'arbeidsmengde-og-tidspress'],
    art: 'factor:motstrid',
  },
  {
    slug: 'kontakt-og-kommunikasjon',
    key: 'faktorKontakt',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['stotte-fra-kollegaer', 'emosjonelle-krav'],
    art: 'factor:kontakt',
  },
  {
    slug: 'emosjonelle-krav',
    key: 'faktorEmosjon',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['stotte-fra-kollegaer', 'kontakt-og-kommunikasjon'],
    art: 'factor:emosjon',
  },
  {
    slug: 'stotte-fra-leder',
    key: 'faktorLeder',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['stotte-fra-kollegaer', 'rolleklarhet'],
    art: 'factor:leder',
  },
  {
    slug: 'medvirkning-og-kontroll',
    key: 'faktorMedvirk',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['arbeidsmengde-og-tidspress', 'anerkjennelse-og-mening'],
    art: 'factor:medvirk',
  },
  {
    slug: 'integritet-og-verdighet',
    key: 'faktorIntegritet',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['ytringsklima', 'anonym-medarbeiderundersokelse'],
    art: 'factor:integritet',
  },
  {
    slug: 'stotte-fra-kollegaer',
    key: 'faktorKollega',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['stotte-fra-leder', 'kontakt-og-kommunikasjon'],
    art: 'factor:kollega',
  },
  {
    slug: 'anerkjennelse-og-mening',
    key: 'faktorMening',
    published: '2026-10-06',
    modified: '2026-10-07',
    related: ['medvirkning-og-kontroll', 'stotte-fra-leder'],
    art: 'factor:mening',
  },
  {
    slug: 'nye-regler-psykososialt-arbeidsmiljo-2026',
    key: 'nyeRegler2026',
    published: '2026-09-25',
    modified: '2026-10-07',
    related: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'hvor-ofte-bor-dere-male-arbeidsmiljoet'],
    art: 'law',
  },
  {
    slug: 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo',
    key: 'kravKartlegging',
    published: '2026-09-25',
    modified: '2026-10-07',
    related: ['nye-regler-psykososialt-arbeidsmiljo-2026', 'verneombudets-rolle-i-kartleggingen'],
    art: 'law',
  },
  {
    slug: 'medarbeiderundersokelse-sporsmal',
    key: 'sporsmal',
    published: '2026-09-25',
    modified: '2026-10-07',
    related: ['anonym-medarbeiderundersokelse', 'hvor-ofte-bor-dere-male-arbeidsmiljoet'],
    art: 'survey',
  },
  {
    slug: 'hvor-ofte-bor-dere-male-arbeidsmiljoet',
    key: 'hvorOfte',
    published: '2026-09-25',
    modified: '2026-10-07',
    related: ['medarbeiderundersokelse-sporsmal', 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo'],
    art: 'wheel',
  },
  {
    slug: 'anonym-medarbeiderundersokelse',
    key: 'anonym',
    published: '2026-09-25',
    modified: '2026-10-07',
    related: ['medarbeiderundersokelse-sporsmal', 'verneombudets-rolle-i-kartleggingen'],
    art: 'anon',
  },
  {
    slug: 'verneombudets-rolle-i-kartleggingen',
    key: 'verneombud',
    published: '2026-09-25',
    modified: '2026-10-07',
    related: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'anonym-medarbeiderundersokelse'],
    art: 'rep',
  },
]

export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug) ?? null
/** Each article's own card (scripts/marketing/og-images.mjs, D-106): its H1 and its landing page's picture. */
export const articleImage = (slug: string) => `/og/artikler/${slug}.png`

/** Which articles each landing page points to, so a reader who wants more has somewhere to go. */
export const LANDING_ARTICLES: Record<LandingSlug, [string, string]> = {
  lovkrav: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'nye-regler-psykososialt-arbeidsmiljo-2026'],
  verneombud: ['verneombudets-rolle-i-kartleggingen', 'anonym-medarbeiderundersokelse'],
  'smaa-bedrifter': ['anonym-medarbeiderundersokelse', 'medarbeiderundersokelse-sporsmal'],
  'bygg-og-anlegg': ['hvor-ofte-bor-dere-male-arbeidsmiljoet', 'medarbeiderundersokelse-sporsmal'],
  'helse-og-omsorg': ['medarbeiderundersokelse-sporsmal', 'anonym-medarbeiderundersokelse'],
}

/**
 * Landing pages that are informational, not sales pages (D-236): Lovkrav and Verneombud explain the
 * law to whoever asks, so they carry no signup, no product picture, no offer and no «how Orgpuls does
 * it». They sit under Artikler in the breadcrumb, with the articles.
 */
export const INFORMATIONAL_PAGES: readonly LandingSlug[] = ['lovkrav', 'verneombud']

/**
 * The picture of the product each landing page shows beside its hero (D-85): the screen
 * that answers that reader's question — the report for the legal requirement, the heatmap
 * for the safety representative who sees the same numbers, the questionnaire on a phone for
 * people on site.
 */
export const LANDING_HERO: Record<LandingSlug, ShotId> = {
  lovkrav: 'rapport',
  verneombud: 'varmekart',
  'smaa-bedrifter': 'oversikt',
  'bygg-og-anlegg': 'sporsmal',
  'helse-og-omsorg': 'samtaler',
}

/** Two other landing pages each one points to, for the reader whose case is next door. */
export const LANDING_RELATED: Record<LandingSlug, [LandingSlug, LandingSlug]> = {
  lovkrav: ['verneombud', 'smaa-bedrifter'],
  verneombud: ['lovkrav', 'bygg-og-anlegg'],
  'smaa-bedrifter': ['lovkrav', 'verneombud'],
  'bygg-og-anlegg': ['helse-og-omsorg', 'smaa-bedrifter'],
  'helse-og-omsorg': ['bygg-og-anlegg', 'verneombud'],
}

/**
 * The site's own pages (D-83, D-88), besides the start page, the landing pages and the
 * articles, for the sitemap. The slug is the route.
 */
export const SITE_PAGES = [
  { slug: 'plattform', key: 'plattform' },
  { slug: 'bruksomrader', key: 'bruksomrader' },
  { slug: 'bransjer', key: 'bransjer' },
  { slug: 'hvorfor', key: 'hvorfor' },
  { slug: 'priser', key: 'priser' },
  { slug: 'sikkerhet', key: 'sikkerhet' },
  { slug: 'kontakt', key: 'kontakt' },
  { slug: 'personvernerklaering', key: 'personvernerklaering' },
  { slug: 'vilkar', key: 'vilkar' },
] as const
/** The support address the product already prints (messages: registrer, oppsett). */
export const CONTACT_MAIL = 'hjelp@orgpuls.no'
