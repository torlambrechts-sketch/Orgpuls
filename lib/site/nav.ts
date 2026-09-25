/**
 * The public site's menu and footers (D-88), from design-reference/orgpuls/nettside.
 *
 * The words are messages (`site.chrome.*`); this holds where each one goes. The design's
 * links point at its own files and at `#`: each is mapped here to the page or section that
 * answers it. Two footer entries have nowhere to go yet — there is no privacy statement and
 * no terms page — so they have no `href` and render as text, not as links to nothing.
 *
 * The design gives the pages two footers. Forside and Plattform carry the first (Produkt,
 * Bruksområder, Ressurser, Om oss); Hvorfor, Bruksområder and Om oss the second, whose
 * columns link into the new pages' sections, and Bruksområder's own adds "Verneombud og
 * AMU". Each page gets the footer its design draws; every other public page gets the second.
 */
export type SiteLink = { key: string; href?: string }
export type FooterColumn = { head: string; links: SiteLink[] }

export const SITE_NAV_V2: SiteLink[] = [
  { key: 'plattform', href: '/plattform' },
  { key: 'bruksomrader', href: '/bruksomrader' },
  { key: 'hvorfor', href: '/hvorfor' },
  { key: 'omOss', href: '/om-oss' },
  { key: 'pris', href: '/#pris' },
]

const FOOTER_FIRST: FooterColumn[] = [
  {
    head: 'produkt',
    links: [
      { key: 'plattform', href: '/plattform' },
      { key: 'malinger', href: '/plattform#malinger' },
      { key: 'resultater', href: '/plattform#resultater' },
      { key: 'kommentarer', href: '/plattform#kommentarer' },
      { key: 'tiltak', href: '/plattform#tiltak' },
      { key: 'pris', href: '/#pris' },
    ],
  },
  {
    head: 'bruksomrader',
    links: [
      { key: 'kartleggingNoun', href: '/bruksomrader#kartlegging' },
      { key: 'medarbeiderundersokelse', href: '/smaa-bedrifter' },
      { key: 'pulsmalinger', href: '/bruksomrader#puls' },
      { key: 'rapportArbeidstilsynet', href: '/bruksomrader#tilsyn' },
      { key: 'amu', href: '/bruksomrader#amu' },
    ],
  },
  {
    head: 'ressurser',
    links: [
      { key: 'slikVirker', href: '/plattform' },
      { key: 'lovenForklart', href: '/lovkrav' },
      { key: 'sporsmalssettet', href: '/artikler/medarbeiderundersokelse-sporsmal' },
      { key: 'personvernAnonymitet', href: '/sikkerhet' },
      { key: 'faq', href: '/hvorfor#sporsmal' },
    ],
  },
  {
    head: 'omOss',
    links: [
      { key: 'hvorfor', href: '/hvorfor' },
      { key: 'teamet', href: '/om-oss#team' },
      { key: 'kontakt', href: '/om-oss#kontakt' },
      { key: 'personvernerklaering' },
      { key: 'vilkar' },
    ],
  },
]

const secondFooter = (withAmu: boolean): FooterColumn[] => [
  {
    head: 'produkt',
    links: [
      { key: 'plattform', href: '/plattform' },
      { key: 'malinger', href: '/plattform#malinger' },
      { key: 'resultater', href: '/plattform#resultater' },
      { key: 'tiltak', href: '/plattform#tiltak' },
      { key: 'pris', href: '/#pris' },
    ],
  },
  {
    head: 'bruksomrader',
    links: [
      { key: 'arlig', href: '/bruksomrader#kartlegging' },
      { key: 'puls', href: '/bruksomrader#puls' },
      { key: 'utenHr', href: '/bruksomrader#uten-hr' },
      { key: 'tilsyn', href: '/bruksomrader#tilsyn' },
      ...(withAmu ? [{ key: 'amu', href: '/bruksomrader#amu' }] : []),
    ],
  },
  {
    head: 'hvorfor',
    links: [
      { key: 'positivt', href: '/hvorfor#positivt' },
      { key: 'anonymitet', href: '/hvorfor#anonymitet' },
      { key: 'forskning', href: '/hvorfor#forskning' },
      { key: 'sammenlignet', href: '/hvorfor#sammenlignet' },
    ],
  },
  {
    head: 'omOss',
    links: [
      { key: 'oppdraget', href: '/om-oss#oppdrag' },
      { key: 'lofter', href: '/om-oss#lofter' },
      { key: 'teamet', href: '/om-oss#team' },
      { key: 'kontakt', href: '/om-oss#kontakt' },
    ],
  },
]

export const FOOTERS = {
  first: FOOTER_FIRST,
  second: secondFooter(false),
  bruksomrader: secondFooter(true),
} as const
export type FooterId = keyof typeof FOOTERS

/** The pages the design draws, and which footer each carries. */
export const DESIGNED_FOOTER: Record<string, FooterId> = {
  '/': 'first',
  '/plattform': 'first',
  '/hvorfor': 'second',
  '/bruksomrader': 'bruksomrader',
  '/om-oss': 'second',
}
