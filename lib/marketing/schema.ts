import { absolute, SITE_URL } from './site'
import { plain, type FaqItem } from './blocks'

/** the page's language as schema.org wants it: nb-NO on the Norwegian site, en on the English one */
export const ldLanguage = (locale: string) => (locale === 'en' ? 'en' : 'nb-NO')

/**
 * schema.org objects for the public pages. Every value is copy the page itself shows —
 * the prices are the plans on the start page, the questions are the FAQ a reader can open —
 * so what a search engine is told and what a visitor reads cannot drift apart.
 */
export const organization = () => ({
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: 'Orgpuls',
  legalName: 'Orgpuls AS',
  url: SITE_URL,
  logo: absolute('/apple-icon.png'),
  email: 'hjelp@orgpuls.no',
  areaServed: 'NO',
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'hjelp@orgpuls.no',
    url: absolute('/kontakt'),
    availableLanguage: ['nb', 'en'],
  },
})

export const website = (locale = 'no') => ({
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  url: SITE_URL,
  name: 'Orgpuls',
  inLanguage: ldLanguage(locale),
  publisher: { '@id': `${SITE_URL}/#organization` },
})

/** The two published plans; "Flere selskaper" is by agreement and has no price to state. */
export const software = (description: string) => ({
  '@type': 'SoftwareApplication',
  name: 'Orgpuls',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  // the product itself is in both
  inLanguage: ['nb-NO', 'en'],
  // the description is in the page's language
  description,
  url: SITE_URL,
  publisher: { '@id': `${SITE_URL}/#organization` },
  offers: [
    { name: 'Liten', price: '265' },
    { name: 'Vanlig', price: '565' },
  ].map((o) => ({
    '@type': 'Offer',
    name: o.name,
    url: `${SITE_URL}/priser`,
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: o.price,
      priceCurrency: 'NOK',
      unitText: 'MON',
      valueAddedTaxIncluded: false,
    },
  })),
})

export const faqPage = (items: FaqItem[]) => ({
  '@type': 'FAQPage',
  mainEntity: items.map((i) => ({
    '@type': 'Question',
    name: plain(i.q),
    acceptedAnswer: { '@type': 'Answer', text: plain(i.a) },
  })),
})

export const breadcrumbs = (trail: { name: string; path: string }[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absolute(c.path) })),
})

export const article = (a: {
  path: string
  headline: string
  description: string
  published: string
  modified: string
  words: number
  /** the page's own card (public/og/...); the site's otherwise */
  image?: string
  locale?: string
}) => ({
  '@type': 'Article',
  headline: a.headline,
  description: a.description,
  inLanguage: ldLanguage(a.locale ?? 'no'),
  datePublished: a.published,
  dateModified: a.modified,
  wordCount: a.words,
  mainEntityOfPage: absolute(a.path),
  image: absolute(a.image ?? '/og.png'),
  author: { '@id': `${SITE_URL}/#organization` },
  publisher: { '@id': `${SITE_URL}/#organization` },
})

export const graph = (...nodes: Record<string, unknown>[]) => ({ '@context': 'https://schema.org', '@graph': nodes })
