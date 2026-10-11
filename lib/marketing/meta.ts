import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { MAIN_URL, siteTag } from '@/lib/hosts'
import { ownSite, type OwnSite } from '@/lib/site/own'
import { absolute } from './site'

/**
 * A page's card as an absolute URL, as its link preview and its schema.org image name it. On a site
 * of its own, its own cards, in its words (public/og/<key>/, og-images.mjs --brand/--market, D-272,
 * D-276): the page's where it has one (public/og/<slug>.png, an article's public/og/artikler/<slug>.png,
 * D-277), the site's default card otherwise. On Norway's, the page's or the site's (public/og.png).
 */
export function cardUrl(own: OwnSite | null, image: string | undefined): string {
  if (!own) return absolute(image ?? '/og.png')
  const card = image?.match(/^\/og\/((?:artikler\/)?[a-z0-9-]+\.png)$/)?.[1] ?? 'default.png'
  return `${own.site.url}/og/${own.site.own.key}/${card}`
}

/**
 * A public page's metadata: its title and description, the canonical URL (one address per page —
 * no locale prefix, no query), and the card a link unfurls into on LinkedIn, Teams or Slack.
 *
 * Norway's site has one address per page since the move (UK-G, D-275): en.orgpuls.com, the English
 * twin each page named as its `hreflang` alternate (D-98), now sends its readers to Empvibe or to
 * www.orgpuls.com in English, and an alternate that redirects is an error to a search engine. English
 * on www.orgpuls.com is the reader's choice on the same address, which a search engine reads in
 * Norwegian (D-96), so a page names no alternate there.
 */
export async function pageMeta(m: {
  title: string
  description: string
  path: string
  type?: 'website' | 'article'
  published?: string
  modified?: string
  /** the page's own card (public/og/<slug>.png, scripts/marketing/og-images.mjs); the site's otherwise */
  image?: string
  /** a page written in Norwegian only (a newsletter issue): its card says so whatever the reader chose (D-104) */
  norwegianOnly?: boolean
}): Promise<Metadata> {
  // a site of its own (D-270): canonical at its own address, in its own language in its market
  // (en-GB on Empvibe's, sv-SE on Sweden's, D-276), under its own name, and no twin on Orgpuls's
  // hosts, whose pages are another market's
  const own = await ownSite()
  if (own) {
    const url = own.absolute(m.path || '/')
    const tag = siteTag(own.site)
    const image = { url: cardUrl(own, m.image), width: 1200, height: 630, alt: m.title }
    return {
      title: { absolute: m.title },
      description: m.description,
      alternates: { canonical: url, languages: { [tag]: url, 'x-default': url } },
      openGraph: {
        type: m.type ?? 'website',
        url,
        title: m.title,
        description: m.description,
        siteName: own.name,
        locale: tag.replace('-', '_'),
        images: [image],
        ...(m.type === 'article' ? { publishedTime: m.published, modifiedTime: m.modified } : {}),
      },
      twitter: { card: 'summary_large_image', title: m.title, description: m.description, images: [image.url] },
    }
  }
  const en = (await getLocale()) === 'en' && !m.norwegianOnly
  const url = `${MAIN_URL}${m.path || '/'}`
  const image = { url: cardUrl(null, m.image), width: 1200, height: 630, alt: m.title }
  return {
    title: { absolute: m.title },
    description: m.description,
    alternates: { canonical: url },
    openGraph: {
      type: m.type ?? 'website',
      url,
      title: m.title,
      description: m.description,
      siteName: 'Orgpuls',
      locale: en ? 'en_GB' : 'nb_NO',
      images: [image],
      ...(m.type === 'article' ? { publishedTime: m.published, modifiedTime: m.modified } : {}),
    },
    twitter: { card: 'summary_large_image', title: m.title, description: m.description, images: [image.url] },
  }
}
