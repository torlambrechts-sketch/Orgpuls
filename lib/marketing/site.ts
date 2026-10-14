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
export const LANDING_PAGES = ['lovkrav', 'verneombud', 'smaa-bedrifter', 'verktoy-for-medarbeiderundersokelse', 'bygg-og-anlegg', 'helse-og-omsorg'] as const
export type LandingSlug = (typeof LANDING_PAGES)[number]

/** A landing page's message key: slugs with hyphens are camel-cased in the messages. */
export const landingKey = (slug: LandingSlug) => slug.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())

/**
 * The index's sections, in the order it shows them (D-250): where to start, the law, carrying a survey out, after the
 * results, and the eleven factors. The headings are messages (`seo.index.groups.<group>`).
 */
export const ARTICLE_GROUPS = ['start', 'lov', 'gjennomforing', 'etter', 'faktorer'] as const
export type ArticleGroup = (typeof ARTICLE_GROUPS)[number]

export type Article = {
  slug: string
  /** its message key under seo.articles */
  key: string
  /** its section on the index */
  group: ArticleGroup
  published: string
  modified: string
  /** two other articles, by slug, shown under "Les også" */
  related: [string, string]
  /**
   * the picture beside the title (D-237): a drawing by kind (components/marketing/art/ArticleArt), or
   * `factor:<key>` for a factor article, whose picture is its own three statements
   */
  art: string
  /** the free template that belongs with it (lib/marketing/templates, D-243): shown at the foot */
  template?: string
}

/** Newest first: the order the index lists them in within each section. */
export const ARTICLES: Article[] = [
  // two searches Search Console showed with no page to answer them (D-281)
  {
    slug: 'er-medarbeiderundersokelse-lovpalagt',
    key: 'lovpalagt',
    group: 'lov',
    published: '2026-10-12',
    modified: '2026-10-14',
    related: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'medarbeiderundersokelse'],
    art: 'law',
    template: 'kartleggingspakken',
  },
  {
    slug: 'arbeidsmiljokartlegging',
    key: 'arbeidsmiljokartlegging',
    group: 'start',
    published: '2026-10-12',
    modified: '2026-10-14',
    related: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'risikovurdering-av-psykososialt-arbeidsmiljo'],
    art: 'risk',
    template: 'kartleggingspakken',
  },
  // the three words people search that the site had no page for (D-249)
  {
    slug: 'medarbeiderundersokelse',
    key: 'medarbeiderundersokelse',
    group: 'start',
    published: '2026-10-08',
    modified: '2026-10-14',
    related: ['medarbeiderundersokelse-sporsmal', 'anonym-medarbeiderundersokelse'],
    art: 'survey',
    template: 'kartleggingspakken',
  },
  {
    slug: 'trivselsundersokelse',
    key: 'trivselsundersokelse',
    group: 'start',
    published: '2026-10-08',
    modified: '2026-10-14',
    related: ['medarbeiderundersokelse', 'slik-gar-dere-gjennom-resultatene-med-de-ansatte'],
    art: 'meeting',
    template: 'informasjonsskriv-og-sjekkliste',
  },
  {
    slug: 'pulsundersokelse',
    key: 'pulsundersokelse',
    group: 'start',
    published: '2026-10-08',
    modified: '2026-10-14',
    related: ['hvor-ofte-bor-dere-male-arbeidsmiljoet', 'fra-resultater-til-tiltak'],
    art: 'wheel',
    template: 'arshjul-arbeidsmiljo',
  },
  {
    slug: 'fra-resultater-til-tiltak',
    key: 'resultaterTilTiltak',
    group: 'etter',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['slik-gar-dere-gjennom-resultatene-med-de-ansatte', 'risikovurdering-av-psykososialt-arbeidsmiljo'],
    art: 'board',
    template: 'tiltaksbank',
  },
  {
    slug: 'slik-gar-dere-gjennom-resultatene-med-de-ansatte',
    key: 'gjennomgang',
    group: 'etter',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['fra-resultater-til-tiltak', 'anonym-medarbeiderundersokelse'],
    art: 'meeting',
    template: 'tiltaksbank',
  },
  {
    slug: 'risikovurdering-av-psykososialt-arbeidsmiljo',
    key: 'risikovurdering',
    group: 'lov',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'fra-resultater-til-tiltak'],
    art: 'risk',
    template: 'risikovurdering-psykososialt-arbeidsmiljo',
  },
  {
    slug: 'arbeidsmengde-og-tidspress',
    key: 'arbeidsmengde',
    group: 'faktorer',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['fra-resultater-til-tiltak', 'risikovurdering-av-psykososialt-arbeidsmiljo'],
    art: 'factor:mengde',
    template: 'tiltaksbank',
  },
  {
    slug: 'ytringsklima',
    key: 'faktorYtring',
    group: 'faktorer',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['integritet-og-verdighet', 'stotte-fra-leder'],
    art: 'factor:ytring',
    template: 'tiltaksbank',
  },
  {
    slug: 'rolleklarhet',
    key: 'faktorRolle',
    group: 'faktorer',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['motstridende-krav', 'stotte-fra-leder'],
    art: 'factor:rolle',
    template: 'tiltaksbank',
  },
  {
    slug: 'motstridende-krav',
    key: 'faktorMotstrid',
    group: 'faktorer',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['rolleklarhet', 'arbeidsmengde-og-tidspress'],
    art: 'factor:motstrid',
    template: 'tiltaksbank',
  },
  {
    slug: 'kontakt-og-kommunikasjon',
    key: 'faktorKontakt',
    group: 'faktorer',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['stotte-fra-kollegaer', 'emosjonelle-krav'],
    art: 'factor:kontakt',
    template: 'tiltaksbank',
  },
  {
    slug: 'emosjonelle-krav',
    key: 'faktorEmosjon',
    group: 'faktorer',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['stotte-fra-kollegaer', 'kontakt-og-kommunikasjon'],
    art: 'factor:emosjon',
    template: 'tiltaksbank',
  },
  {
    slug: 'stotte-fra-leder',
    key: 'faktorLeder',
    group: 'faktorer',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['stotte-fra-kollegaer', 'rolleklarhet'],
    art: 'factor:leder',
    template: 'tiltaksbank',
  },
  {
    slug: 'medvirkning-og-kontroll',
    key: 'faktorMedvirk',
    group: 'faktorer',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['arbeidsmengde-og-tidspress', 'anerkjennelse-og-mening'],
    art: 'factor:medvirk',
    template: 'tiltaksbank',
  },
  {
    slug: 'integritet-og-verdighet',
    key: 'faktorIntegritet',
    group: 'faktorer',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['ytringsklima', 'anonym-medarbeiderundersokelse'],
    art: 'factor:integritet',
    template: 'tiltaksbank',
  },
  {
    slug: 'stotte-fra-kollegaer',
    key: 'faktorKollega',
    group: 'faktorer',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['stotte-fra-leder', 'kontakt-og-kommunikasjon'],
    art: 'factor:kollega',
    template: 'tiltaksbank',
  },
  {
    slug: 'anerkjennelse-og-mening',
    key: 'faktorMening',
    group: 'faktorer',
    published: '2026-10-06',
    modified: '2026-10-14',
    related: ['medvirkning-og-kontroll', 'stotte-fra-leder'],
    art: 'factor:mening',
    template: 'tiltaksbank',
  },
  {
    slug: 'nye-regler-psykososialt-arbeidsmiljo-2026',
    key: 'nyeRegler2026',
    group: 'lov',
    published: '2026-09-25',
    modified: '2026-10-09',
    related: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'hvor-ofte-bor-dere-male-arbeidsmiljoet'],
    art: 'law',
    template: 'kartleggingspakken',
  },
  {
    slug: 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo',
    key: 'kravKartlegging',
    group: 'lov',
    published: '2026-09-25',
    modified: '2026-10-14',
    related: ['nye-regler-psykososialt-arbeidsmiljo-2026', 'verneombudets-rolle-i-kartleggingen'],
    art: 'law',
    template: 'kartleggingspakken',
  },
  {
    slug: 'medarbeiderundersokelse-sporsmal',
    key: 'sporsmal',
    group: 'gjennomforing',
    published: '2026-09-25',
    modified: '2026-10-14',
    related: ['anonym-medarbeiderundersokelse', 'hvor-ofte-bor-dere-male-arbeidsmiljoet'],
    art: 'survey',
    template: 'qpsnordic-sporreskjema',
  },
  {
    slug: 'hvor-ofte-bor-dere-male-arbeidsmiljoet',
    key: 'hvorOfte',
    group: 'gjennomforing',
    published: '2026-09-25',
    modified: '2026-10-14',
    related: ['medarbeiderundersokelse-sporsmal', 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo'],
    art: 'wheel',
    template: 'arshjul-arbeidsmiljo',
  },
  {
    slug: 'anonym-medarbeiderundersokelse',
    key: 'anonym',
    group: 'gjennomforing',
    published: '2026-09-25',
    modified: '2026-10-14',
    related: ['medarbeiderundersokelse-sporsmal', 'verneombudets-rolle-i-kartleggingen'],
    art: 'anon',
    template: 'informasjonsskriv-og-sjekkliste',
  },
  {
    slug: 'verneombudets-rolle-i-kartleggingen',
    key: 'verneombud',
    group: 'lov',
    published: '2026-09-25',
    modified: '2026-10-14',
    related: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'anonym-medarbeiderundersokelse'],
    art: 'rep',
    template: 'informasjonsskriv-og-sjekkliste',
  },
]

/**
 * Each article's own card (scripts/marketing/og-images.mjs, D-106): its H1 under the brand. A site of
 * its own keeps its cards under public/og/<key>/ (lib/marketing/meta.ts cardUrl, D-278).
 */
export const articleImage = (slug: string) => `/og/artikler/${slug}.png`

/** Which articles each landing page points to, so a reader who wants more has somewhere to go. */
export const LANDING_ARTICLES: Record<LandingSlug, [string, string]> = {
  lovkrav: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'nye-regler-psykososialt-arbeidsmiljo-2026'],
  verneombud: ['verneombudets-rolle-i-kartleggingen', 'anonym-medarbeiderundersokelse'],
  'smaa-bedrifter': ['anonym-medarbeiderundersokelse', 'medarbeiderundersokelse-sporsmal'],
  // the «which tool» page (D-281): what anonymity means, and whether a survey is required at all
  'verktoy-for-medarbeiderundersokelse': ['anonym-medarbeiderundersokelse', 'er-medarbeiderundersokelse-lovpalagt'],
  'bygg-og-anlegg': ['hvor-ofte-bor-dere-male-arbeidsmiljoet', 'medarbeiderundersokelse-sporsmal'],
  'helse-og-omsorg': ['medarbeiderundersokelse-sporsmal', 'anonym-medarbeiderundersokelse'],
}

/**
 * Landing pages that are informational, not sales pages (D-236): Lovkrav and Verneombud explain the
 * law to whoever asks, so they carry no signup, no product picture, no offer and no «how Orgpuls does
 * it». They sit under Artikler in the breadcrumb, with the articles.
 */
export const INFORMATIONAL_PAGES: readonly LandingSlug[] = ['lovkrav', 'verneombud']

/** the free template under a landing page's blocks (lib/marketing/templates, D-243) */
export const LANDING_TEMPLATE: Partial<Record<LandingSlug, string>> = {
  lovkrav: 'kartleggingspakken',
  verneombud: 'informasjonsskriv-og-sjekkliste',
  'smaa-bedrifter': 'kartleggingspakken',
}

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
  // the heatmap: results per group, a group under the threshold shown as a dash
  'verktoy-for-medarbeiderundersokelse': 'varmekart',
  'bygg-og-anlegg': 'sporsmal',
  'helse-og-omsorg': 'samtaler',
}

/**
 * The other landing pages each one points to, for the reader whose case is next door, in order of preference: a
 * page shows the first two its site serves (D-281), so a page Norway's site has and a site of its own does not
 * (the «which tool» page) gives way there to the next.
 */
export const LANDING_RELATED: Record<LandingSlug, readonly LandingSlug[]> = {
  lovkrav: ['verneombud', 'smaa-bedrifter'],
  verneombud: ['lovkrav', 'bygg-og-anlegg'],
  'smaa-bedrifter': ['lovkrav', 'verktoy-for-medarbeiderundersokelse', 'verneombud'],
  'verktoy-for-medarbeiderundersokelse': ['smaa-bedrifter', 'lovkrav'],
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
