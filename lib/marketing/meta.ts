import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { EN_URL, MAIN_URL } from '@/lib/hosts'
import { absolute } from './site'

/**
 * A public page's metadata: its title and description, the canonical URL (one address per page
 * and language — no locale prefix, no query), the page's twin in the other language
 * (`hreflang`, D-98: www.orgpuls.com is Norwegian, en.orgpuls.com English), and the card a link
 * unfurls into on LinkedIn, Teams or Slack.
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
  /** a page written in Norwegian only (a newsletter issue): canonical on www, no English twin (D-104) */
  norwegianOnly?: boolean
  /** a page that exists in this language but whose twin is not live yet: canonical here, no hreflang (D-120) */
  noTwin?: boolean
}): Promise<Metadata> {
  const en = (await getLocale()) === 'en' && !m.norwegianOnly
  const path = m.path || '/'
  const url = `${en ? EN_URL : MAIN_URL}${path}`
  const image = { url: absolute(m.image ?? '/og.png'), width: 1200, height: 630, alt: m.title }
  return {
    title: { absolute: m.title },
    description: m.description,
    alternates: m.norwegianOnly || m.noTwin
      ? { canonical: url }
      : {
          canonical: url,
          languages: { nb: `${MAIN_URL}${path}`, en: `${EN_URL}${path}`, 'x-default': `${MAIN_URL}${path}` },
        },
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
