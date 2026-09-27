import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { EN_HOST, EN_URL, hostOf, MAIN_URL } from '@/lib/hosts'

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

/** each host names its own sitemap (app/sitemap.ts, D-132) */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = hostOf((await headers()).get('host')) === EN_HOST ? EN_URL : MAIN_URL
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE }],
    sitemap: `${base}/sitemap.xml`,
    host: `${base}/`,
  }
}
