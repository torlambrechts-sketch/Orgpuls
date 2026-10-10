/**
 * The public site's menu and footers, from design-reference/orgpuls/nettside-v3 (D-190), mapped as
 * the v3 decision sheet's link table (G7/G8) sets them.
 *
 * The words are messages (`site.chrome.*`); this holds where each one goes. The design's links
 * point at its own files and at `#`: each is mapped here to the page or section that answers it.
 * A footer entry without `href` is text, not a link; «Vilkår» was one until /vilkar was published
 * (D-194).
 */
import { LANDINGS } from '@/content/industries/landing'

export type SiteLink = { key: string; href?: string }
export type FooterColumn = { head: string; links: SiteLink[] }

/**
 * The five pages drawn by the v3 design. Each continues the layout's mint top band with its own
 * hero (`SiteTop`) and ends in the start band (`#kom-i-gang`), which the header's primary button
 * targets there; every other public page gets the header band with a foot of its own.
 */
export const V3_ROUTES = ['/', '/plattform', '/bruksomrader', '/bransjer', '/priser'] as const
/**
 * The industry pages on the landing template (D-207) are built the same way: a hero in the band,
 * the start band near the end. The template is the registry's, so a page moved onto it joins here.
 */
const LANDING_ROUTES = LANDINGS.map((l) => `/${l.slug}`)
export const isV3Route = (pathname: string) => (V3_ROUTES as readonly string[]).includes(pathname) || LANDING_ROUTES.includes(pathname)

/**
 * The header's menu: Plattform (with Bruksområder and Hvorfor under it, D-243), Bransjer, Ressurser, Pris. Bransjer's pages are the industry
 * registry's (content/industries), so a new industry is a new entry there, not a change here.
 */
export const SITE_NAV: (SiteLink & { href: string; industries?: true; children?: (SiteLink & { href: string })[]; all?: string })[] = [
  // Plattform (D-243): the product, with what it is used for and why under it, so the bar has one item fewer
  {
    key: 'plattform',
    href: '/plattform',
    all: 'omPlattformen',
    children: [
      { key: 'bruksomrader', href: '/bruksomrader' },
      { key: 'hvorfor', href: '/hvorfor' },
    ],
  },
  { key: 'bransjer', href: '/bransjer', industries: true },
  // Ressurser (D-232): the articles, first in its panel, and the pages that explain the law and the product
  {
    key: 'ressurser',
    href: '/artikler',
    all: 'alleArtikler',
    children: [
      // the free templates (D-241), first after the articles (D-243)
      { key: 'maler', href: '/maler' },
      // the article for the word people search most (D-250); the questions article is linked from it, the start page and the footer
      { key: 'medarbeiderundersokelse', href: '/artikler/medarbeiderundersokelse' },
      { key: 'lovkrav', href: '/lovkrav' },
      { key: 'verneombud', href: '/verneombud' },
      { key: 'fraResultater', href: '/artikler/fra-resultater-til-tiltak' },
      { key: 'sikkerhet', href: '/sikkerhet' },
    ],
  },
  { key: 'pris', href: '/priser' },
]

/** Forside's footer: Produkt (7), Bruksområder (4), Ressurser (6, with the articles since D-232 and the templates since D-243), Om oss (3) */
const FOOTER_HOME: FooterColumn[] = [
  {
    head: 'produkt',
    links: [
      { key: 'plattform', href: '/plattform' },
      { key: 'malinger', href: '/plattform#malinger' },
      { key: 'resultater', href: '/plattform#resultater' },
      { key: 'kommentarer', href: '/plattform#kommentarer' },
      { key: 'tiltak', href: '/plattform#tiltak' },
      { key: 'pris', href: '/priser' },
      // the argument for the product had no way in but one link in a page's text (D-238)
      { key: 'hvorfor', href: '/hvorfor' },
    ],
  },
  {
    head: 'bruksomrader',
    links: [
      { key: 'kartleggingNoun', href: '/bruksomrader#kartlegging' },
      // the words have their own articles (D-249)
      { key: 'medarbeiderundersokelse', href: '/artikler/medarbeiderundersokelse' },
      { key: 'pulsmalinger', href: '/artikler/pulsundersokelse' },
      { key: 'rapportArbeidstilsynet', href: '/bruksomrader#tilsyn' },
    ],
  },
  {
    head: 'ressurser',
    links: [
      { key: 'alleArtikler', href: '/artikler' },
      { key: 'maler', href: '/maler' },
      { key: 'slikVirker', href: '/plattform' },
      { key: 'lovenForklart', href: '/lovkrav' },
      { key: 'sporsmalssettet', href: '/artikler/medarbeiderundersokelse-sporsmal' },
      { key: 'personvernAnonymitet', href: '/sikkerhet' },
    ],
  },
  {
    head: 'omOss',
    links: [
      { key: 'kontakt', href: '/kontakt#skriv' },
      { key: 'personvernerklaering', href: '/personvernerklaering' },
      { key: 'vilkar', href: '/vilkar' },
    ],
  },
]

/**
 * The subpages' footer: Produkt, Bruksområder, Bransjer, Om oss. Plattform and Bruksområder draw
 * the long form (Resultater; Verneombud og AMU), Bransjer and Pris the short one.
 */
const subpageFooter = (long: boolean): FooterColumn[] => [
  {
    head: 'produkt',
    links: [
      { key: 'plattform', href: '/plattform' },
      ...(long ? [{ key: 'resultater', href: '/plattform#resultater' }] : []),
      { key: 'pris', href: '/priser' },
      { key: 'hvorfor', href: '/hvorfor' },
    ],
  },
  {
    head: 'bruksomrader',
    links: [
      { key: 'utenHr', href: '/bruksomrader#uten-hr' },
      // the landing page for small businesses, linked until now only from the start page's footer (D-238)
      { key: 'smaaBedrifter', href: '/smaa-bedrifter' },
      { key: 'arlig', href: '/bruksomrader#kartlegging' },
      // the pulse article answers it, as the start page's footer already has it (D-249, D-250)
      { key: 'puls', href: '/artikler/pulsundersokelse' },
      { key: 'tilsyn', href: '/bruksomrader#tilsyn' },
      ...(long ? [{ key: 'amu', href: '/bruksomrader#amu' }] : []),
    ],
  },
  {
    head: 'bransjer',
    links: [
      { key: 'handel', href: '/bransjer#handel' },
      { key: 'kontor', href: '/bransjer#kontor' },
      { key: 'bygg', href: '/bransjer#bygg' },
      { key: 'skole', href: '/bransjer#skole' },
      { key: 'helse', href: '/bransjer#helse' },
    ],
  },
  {
    head: 'omOss',
    links: [
      { key: 'alleArtikler', href: '/artikler' },
      { key: 'maler', href: '/maler' },
      { key: 'personvernAnonymitet', href: '/sikkerhet' },
      { key: 'kontakt', href: '/kontakt#skriv' },
    ],
  },
]

export const FOOTERS = { home: FOOTER_HOME, long: subpageFooter(true), short: subpageFooter(false) } as const
export type FooterId = keyof typeof FOOTERS

/** Which footer a page carries: the one its design draws; every other public page the long one. */
export const footerFor = (pathname: string): FooterId =>
  pathname === '/' ? 'home' : pathname === '/bransjer' || pathname === '/priser' ? 'short' : 'long'

/**
 * A site of its own (Empvibe's, D-270): the pages it serves (lib/hosts.ts `Site.own`) and no others.
 * Its menu is Plattform with Bruksområder and Hvorfor under it, as Norway's; Ressurser opens on the
 * law, with safety representatives, small businesses and security under it, since the site has no
 * articles; Kontakt where Norway has Pris, until the United Kingdom has prices (UK-F). No Bransjer:
 * the industry modules are Norway's. The words are the market's (messages/market/gb).
 */
export const OWN_NAV: typeof SITE_NAV = [
  {
    key: 'plattform',
    href: '/plattform',
    all: 'omPlattformen',
    children: [
      { key: 'bruksomrader', href: '/bruksomrader' },
      { key: 'hvorfor', href: '/hvorfor' },
    ],
  },
  {
    key: 'ressurser',
    href: '/lovkrav',
    all: 'lovkrav',
    children: [
      { key: 'verneombud', href: '/verneombud' },
      { key: 'smaaBedrifter', href: '/smaa-bedrifter' },
      { key: 'sikkerhet', href: '/sikkerhet' },
    ],
  },
  { key: 'kontakt', href: '/kontakt' },
]

/** Its footer, the same on every page: the product, what it is used for, guidance, and the company */
const OWN_FOOTER: FooterColumn[] = [
  {
    head: 'produkt',
    links: [
      { key: 'plattform', href: '/plattform' },
      { key: 'malinger', href: '/plattform#malinger' },
      { key: 'resultater', href: '/plattform#resultater' },
      { key: 'kommentarer', href: '/plattform#kommentarer' },
      { key: 'tiltak', href: '/plattform#tiltak' },
      { key: 'hvorfor', href: '/hvorfor' },
    ],
  },
  {
    head: 'bruksomrader',
    links: [
      { key: 'utenHr', href: '/bruksomrader#uten-hr' },
      { key: 'smaaBedrifter', href: '/smaa-bedrifter' },
      { key: 'arlig', href: '/bruksomrader#kartlegging' },
      { key: 'tilsyn', href: '/bruksomrader#tilsyn' },
      { key: 'amu', href: '/bruksomrader#amu' },
    ],
  },
  {
    head: 'ressurser',
    links: [
      { key: 'lovenForklart', href: '/lovkrav' },
      { key: 'verneombud', href: '/verneombud' },
      { key: 'personvernAnonymitet', href: '/sikkerhet' },
    ],
  },
  {
    head: 'omOss',
    links: [
      { key: 'kontakt', href: '/kontakt#skriv' },
      // the UK privacy notice and terms (UK-F, D-274)
      { key: 'personvernerklaering', href: '/personvernerklaering' },
      { key: 'vilkar', href: '/vilkar' },
    ],
  },
]

export const OWN_FOOTERS: Record<FooterId, FooterColumn[]> = { home: OWN_FOOTER, long: OWN_FOOTER, short: OWN_FOOTER }
