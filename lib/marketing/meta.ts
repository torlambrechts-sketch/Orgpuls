import type { Metadata } from 'next'
import { absolute } from './site'

/**
 * A public page's metadata: its title and description, the canonical URL (there is one
 * address per page — no locale prefix, no query), and the card a link unfurls into on
 * LinkedIn, Teams or Slack.
 */
export function pageMeta(m: {
  title: string
  description: string
  path: string
  type?: 'website' | 'article'
  published?: string
  modified?: string
  /** the page's own card (public/og/<slug>.png, scripts/marketing/og-images.mjs); the site's otherwise */
  image?: string
}): Metadata {
  const url = absolute(m.path)
  const image = { url: absolute(m.image ?? '/og.png'), width: 1200, height: 630, alt: m.title }
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
      locale: 'nb_NO',
      images: [image],
      ...(m.type === 'article' ? { publishedTime: m.published, modifiedTime: m.modified } : {}),
    },
    twitter: { card: 'summary_large_image', title: m.title, description: m.description, images: [image.url] },
  }
}
