import { absolute, SITE_URL } from './site'
import { plain, type FaqItem } from './blocks'
import { getTranslations } from 'next-intl/server'
import { PLAN_PRICES, planPrices, yearly, type PriceList } from '@/lib/site/pricing'
import { ownSite, serves } from '@/lib/site/own'
import { siteTag } from '@/lib/hosts'

/**
 * The site a page's schema.org objects describe: Orgpuls on Norway's hosts, or a site of its own
 * (Empvibe's, D-270; Sweden's, D-276) with its own address, name, country and language, and its
 * market's prices where it serves them (Empvibe since UK-G, D-275; Sweden not until SE-E). Every URL
 * is the site's own address for the route.
 */
export type SiteLd = {
  url: string
  name: string
  /** an absolute URL for a route on this site */
  absolute: (path: string) => string
  areaServed: string
  languages: readonly string[]
  /** a site of its own's pages' language (BCP 47): en-GB, sv-SE; null on Norway's, which says it per page */
  tag: string | null
  /** the prices the site publishes, and its plans' names as its price page shows them; null where it publishes none */
  offers: { prices: PriceList; names: { free: string; small: string; usual: string } } | null
}

export const ORGPULS_LD: SiteLd = {
  url: SITE_URL,
  name: 'Orgpuls',
  absolute,
  areaServed: 'NO',
  languages: ['nb', 'en'],
  tag: null,
  offers: { prices: PLAN_PRICES.no, names: { free: 'Gratis', small: 'Liten', usual: 'Vanlig' } },
}

/** This request's site, for its pages' schema.org objects */
export async function siteLd(): Promise<SiteLd> {
  const own = await ownSite()
  if (!own) return ORGPULS_LD
  // the plans' names in the site's own words, as its price page draws them, where it has one
  const offers = async () => {
    const t = await getTranslations({ locale: own.site.lang, namespace: 'site.pris' })
    const plans = t.raw('plans') as { name: string }[]
    return { prices: planPrices(own.site.market), names: { free: t('free.name'), small: plans[0]!.name, usual: plans[1]!.name } }
  }
  return {
    url: own.site.url,
    name: own.name,
    absolute: (path) => (path === '/' ? own.site.url : own.absolute(path)),
    areaServed: own.site.market.toUpperCase(),
    // the languages its pages are in: its own one (D-276)
    languages: [siteTag(own.site)],
    tag: siteTag(own.site),
    offers: serves(own, '/priser') ? await offers() : null,
  }
}

/** the page's language as schema.org wants it: nb-NO on the Norwegian site, en on the English one */
export const ldLanguage = (locale: string) => (locale === 'en' ? 'en' : 'nb-NO')

/** Pundit Invest AS's organisation number in the Brønnøysund register */
export const ORGNR = '922698422'

/**
 * schema.org objects for the public pages. Every value is copy the page itself shows —
 * the prices are the plans on the start page, the questions are the FAQ a reader can open —
 * so what a search engine is told and what a visitor reads cannot drift apart.
 */
export const organization = (site: SiteLd = ORGPULS_LD) => ({
  '@type': 'Organization',
  '@id': `${site.url}/#organization`,
  name: site.name,
  // the company that provides Orgpuls, as the site footer and /vilkar name it (D-197)
  legalName: 'Pundit Invest AS',
  // its organisation number and its entry in the Brønnøysund register, so a search engine or an AI answer can tell
  // which company this is (D-281); the number is the one the footer and /vilkar print
  identifier: { '@type': 'PropertyValue', propertyID: 'NO:ORGNR', value: ORGNR },
  sameAs: [`https://virksomhet.brreg.no/nb/oppslag/enheter/${ORGNR}`],
  url: site.url,
  logo: site.absolute('/apple-icon.png'),
  email: 'hjelp@orgpuls.no',
  areaServed: site.areaServed,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'hjelp@orgpuls.no',
    url: site.absolute('/kontakt'),
    availableLanguage: site.languages,
  },
})

export const website = (locale = 'no', site: SiteLd = ORGPULS_LD) => ({
  '@type': 'WebSite',
  '@id': `${site.url}/#website`,
  url: site.url,
  name: site.name,
  inLanguage: site.tag ?? ldLanguage(locale),
  publisher: { '@id': `${site.url}/#organization` },
})

/**
 * The published prices: the free plan, and Liten and Vanlig by the month and by the year (ten months'
 * price, D-217); "Flere selskaper" is by agreement and has no price to state.
 */
export const software = (description: string, site: SiteLd = ORGPULS_LD) => ({
  '@type': 'SoftwareApplication',
  name: site.name,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  // the product itself is in both; a site of its own, in its own
  inLanguage: site.tag ? [site.tag] : ['nb-NO', 'en'],
  // the description is in the page's language
  description,
  url: site.url,
  publisher: { '@id': `${site.url}/#organization` },
  // a site that publishes no prices states none (Sweden's until SE-E, D-276)
  ...(site.offers ? { offers: offers(site.offers, site) } : {}),
})

/** The site's published prices, as its price page shows them, in its market's currency */
const offers = ({ prices, names }: NonNullable<SiteLd['offers']>, site: SiteLd) => {
  const url = site.absolute('/priser')
  return [
    { '@type': 'Offer', name: names.free, url, price: '0', priceCurrency: prices.currency },
    ...[
      { name: names.small, price: prices.small, unitText: 'MON' },
      { name: names.usual, price: prices.usual, unitText: 'MON' },
      { name: names.small, price: yearly(prices.small).year, unitText: 'ANN' },
      { name: names.usual, price: yearly(prices.usual).year, unitText: 'ANN' },
    ].map((o) => ({
      '@type': 'Offer',
      name: o.name,
      url,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: String(o.price),
        priceCurrency: prices.currency,
        unitText: o.unitText,
        valueAddedTaxIncluded: false,
      },
    })),
  ]
}

export const faqPage = (items: FaqItem[]) => ({
  '@type': 'FAQPage',
  mainEntity: items.map((i) => ({
    '@type': 'Question',
    name: plain(i.q),
    acceptedAnswer: { '@type': 'Answer', text: plain(i.a) },
  })),
})

export const breadcrumbs = (trail: { name: string; path: string }[], site: SiteLd = ORGPULS_LD) => ({
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: site.absolute(c.path) })),
})

export const article = (a: {
  path: string
  headline: string
  description: string
  published: string
  modified: string
  words: number
  /** the page's card as an absolute URL, as its link preview names it (lib/marketing/meta.ts cardUrl) */
  image: string
  locale?: string
  /** the sources the article cites (its «Kilder»), so a reader — or a model — can check the claim */
  sources?: { label: string; url: string }[]
  /** the site that publishes it (D-278): its address, its name and its pages' language */
  site?: SiteLd
}) => {
  const site = a.site ?? ORGPULS_LD
  return {
    '@type': 'Article',
    // a heading may carry soft hyphens for the page's line breaks; the schema carries the plain words
    headline: a.headline.replace(/\u00ad/g, ''),
    description: a.description,
    inLanguage: site.tag ?? ldLanguage(a.locale ?? 'no'),
    datePublished: a.published,
    dateModified: a.modified,
    wordCount: a.words,
    mainEntityOfPage: site.absolute(a.path),
    image: a.image,
    author: { '@id': `${site.url}/#organization` },
    publisher: { '@id': `${site.url}/#organization` },
    ...(a.sources?.length ? { citation: a.sources.map((c) => ({ '@type': 'CreativeWork', name: c.label, url: c.url })) } : {}),
  }
}

export const graph = (...nodes: Record<string, unknown>[]) => ({ '@context': 'https://schema.org', '@graph': nodes })
