import { absolute, SITE_URL } from './site'
import { plain, type FaqItem } from './blocks'
import { PLAN_SIZES, yearly } from '@/lib/site/pricing'

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
  // the company that provides Orgpuls, as the site footer and /vilkar name it (D-197)
  legalName: 'Pundit Invest AS',
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

/**
 * The published prices: the free plan, and Liten and Vanlig by the month and by the year (ten months'
 * price, D-217); "Flere selskaper" is by agreement and has no price to state.
 */
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
    { '@type': 'Offer', name: 'Gratis', url: `${SITE_URL}/priser`, price: '0', priceCurrency: 'NOK' },
    ...[
      { name: 'Liten', price: PLAN_SIZES[0].monthly, unitText: 'MON' },
      { name: 'Vanlig', price: PLAN_SIZES[1].monthly, unitText: 'MON' },
      { name: 'Liten', price: yearly(PLAN_SIZES[0].monthly).year, unitText: 'ANN' },
      { name: 'Vanlig', price: yearly(PLAN_SIZES[1].monthly).year, unitText: 'ANN' },
    ].map((o) => ({
      '@type': 'Offer',
      name: o.name,
      url: `${SITE_URL}/priser`,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: String(o.price),
        priceCurrency: 'NOK',
        unitText: o.unitText,
        valueAddedTaxIncluded: false,
      },
    })),
  ],
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
  /** the sources the article cites (its «Kilder»), so a reader — or a model — can check the claim */
  sources?: { label: string; url: string }[]
}) => ({
  '@type': 'Article',
  // a heading may carry soft hyphens for the page's line breaks; the schema carries the plain words
  headline: a.headline.replace(/\u00ad/g, ''),
  description: a.description,
  inLanguage: ldLanguage(a.locale ?? 'no'),
  datePublished: a.published,
  dateModified: a.modified,
  wordCount: a.words,
  mainEntityOfPage: absolute(a.path),
  image: absolute(a.image ?? '/og.png'),
  author: { '@id': `${SITE_URL}/#organization` },
  publisher: { '@id': `${SITE_URL}/#organization` },
  ...(a.sources?.length ? { citation: a.sources.map((c) => ({ '@type': 'CreativeWork', name: c.label, url: c.url })) } : {}),
})

export const graph = (...nodes: Record<string, unknown>[]) => ({ '@context': 'https://schema.org', '@graph': nodes })
