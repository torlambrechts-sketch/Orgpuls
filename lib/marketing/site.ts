/**
 * The public site's registry: which landing pages and articles exist, where they live and
 * how they link to each other. The words are messages (`seo.*` in /messages); this file
 * holds only what is not words — slugs, dates, and the links between pages — so adding an
 * article is an entry here and a message key, never a component change.
 */
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
  /** the landing page the article sends its reader to */
  landing: LandingSlug
  /** two other articles, by slug, shown under "Les også" */
  related: [string, string]
}

/** Newest first: the order the index lists them in. */
export const ARTICLES: Article[] = [
  {
    slug: 'nye-regler-psykososialt-arbeidsmiljo-2026',
    key: 'nyeRegler2026',
    published: '2026-09-25',
    modified: '2026-09-25',
    landing: 'lovkrav',
    related: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'hvor-ofte-bor-dere-male-arbeidsmiljoet'],
  },
  {
    slug: 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo',
    key: 'kravKartlegging',
    published: '2026-09-25',
    modified: '2026-09-25',
    landing: 'lovkrav',
    related: ['nye-regler-psykososialt-arbeidsmiljo-2026', 'verneombudets-rolle-i-kartleggingen'],
  },
  {
    slug: 'medarbeiderundersokelse-sporsmal',
    key: 'sporsmal',
    published: '2026-09-25',
    modified: '2026-09-25',
    landing: 'smaa-bedrifter',
    related: ['anonym-medarbeiderundersokelse', 'hvor-ofte-bor-dere-male-arbeidsmiljoet'],
  },
  {
    slug: 'hvor-ofte-bor-dere-male-arbeidsmiljoet',
    key: 'hvorOfte',
    published: '2026-09-25',
    modified: '2026-09-25',
    landing: 'smaa-bedrifter',
    related: ['medarbeiderundersokelse-sporsmal', 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo'],
  },
  {
    slug: 'anonym-medarbeiderundersokelse',
    key: 'anonym',
    published: '2026-09-25',
    modified: '2026-09-25',
    landing: 'smaa-bedrifter',
    related: ['medarbeiderundersokelse-sporsmal', 'verneombudets-rolle-i-kartleggingen'],
  },
  {
    slug: 'verneombudets-rolle-i-kartleggingen',
    key: 'verneombud',
    published: '2026-09-25',
    modified: '2026-09-25',
    landing: 'verneombud',
    related: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'anonym-medarbeiderundersokelse'],
  },
]

export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug) ?? null

/** Which articles each landing page points to, so a reader who wants more has somewhere to go. */
export const LANDING_ARTICLES: Record<LandingSlug, [string, string]> = {
  lovkrav: ['krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'nye-regler-psykososialt-arbeidsmiljo-2026'],
  verneombud: ['verneombudets-rolle-i-kartleggingen', 'anonym-medarbeiderundersokelse'],
  'smaa-bedrifter': ['anonym-medarbeiderundersokelse', 'medarbeiderundersokelse-sporsmal'],
  'bygg-og-anlegg': ['hvor-ofte-bor-dere-male-arbeidsmiljoet', 'medarbeiderundersokelse-sporsmal'],
  'helse-og-omsorg': ['medarbeiderundersokelse-sporsmal', 'anonym-medarbeiderundersokelse'],
}

/**
 * The site's own pages (D-83), besides the start page, the landing pages and the articles.
 * The slug is the route; the message key is `seo.pages.<key>`.
 */
export const SITE_PAGES = [
  { slug: 'plattform', key: 'plattform' },
  { slug: 'bruksomrader', key: 'bruksomrader' },
  { slug: 'priser', key: 'priser' },
  { slug: 'om-oss', key: 'omOss' },
  { slug: 'sikkerhet', key: 'sikkerhet' },
  { slug: 'kontakt', key: 'kontakt' },
] as const
export type SitePageSlug = (typeof SITE_PAGES)[number]['slug']
export const sitePageKey = (slug: SitePageSlug) => SITE_PAGES.find((p) => p.slug === slug)!.key

/** The public header's menu, in order: what it is, who it is for, what it costs, reading, who we are. */
export const SITE_NAV: { href: string; key: string }[] = [
  { href: '/plattform', key: 'plattform' },
  { href: '/bruksomrader', key: 'bruksomrader' },
  { href: '/priser', key: 'priser' },
  { href: '/artikler', key: 'artikler' },
  { href: '/om-oss', key: 'omOss' },
]

/** The public footer's columns; each link's label is `seo.nav.<key>` or a page's crumb. */
export const SITE_FOOTER: { head: string; links: { href: string; label: string }[] }[] = [
  {
    head: 'produkt',
    links: [
      { href: '/plattform', label: 'seo.nav.plattform' },
      { href: '/priser', label: 'seo.nav.priser' },
      { href: '/sikkerhet', label: 'seo.nav.sikkerhet' },
    ],
  },
  {
    head: 'bruksomrader',
    links: landingFooterLinks(),
  },
  {
    head: 'ressurser',
    links: [
      { href: '/artikler', label: 'seo.nav.artikler' },
      { href: '/artikler/nye-regler-psykososialt-arbeidsmiljo-2026', label: 'seo.footer.newRules' },
    ],
  },
  {
    head: 'selskap',
    links: [
      { href: '/om-oss', label: 'seo.nav.omOss' },
      { href: '/kontakt', label: 'seo.nav.kontakt' },
    ],
  },
]

function landingFooterLinks() {
  return LANDING_PAGES.map((s) => ({ href: `/${s}`, label: `seo.lp.${landingKey(s)}.crumb` }))
}

/** The support address the product already prints (messages: registrer, oppsett). */
export const CONTACT_MAIL = 'hjelp@orgpuls.no'
