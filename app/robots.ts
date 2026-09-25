import type { MetadataRoute } from 'next'
import { absolute } from '@/lib/marketing/site'

/**
 * The public site is open to crawlers. What is not: the respondent survey and its
 * conversation (a capability in the URL), invitation and password links, the auth
 * callbacks, the component gallery, the application itself, which answers every
 * anonymous request with a redirect to sign-in, and the sign-in and sign-up forms, which
 * are steps, not pages anyone searches for.
 */
const PRIVATE = [
  '/logg-inn',
  '/registrer',
  '/s/',
  '/bli-med/',
  '/auth/',
  '/nytt-passord',
  '/primitives',
  '/innsikt',
  '/resultater',
  '/kommentarer',
  '/malinger',
  '/tiltak',
  '/oppsett',
  '/rapport',
  '/maleoppsett',
  '/hjelp',
  '/integrasjoner',
  '/forhandsvis',
  '/arshjulet',
  '/samtaler',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE }],
    sitemap: absolute('/sitemap.xml'),
    host: absolute('/'),
  }
}
