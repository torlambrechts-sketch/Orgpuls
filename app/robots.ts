import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { addressOf, MAIN_URL, siteOf } from '@/lib/hosts'

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
  const host = (await headers()).get('host')
  // a market's host before its own public site (D-256): nothing there is for crawlers yet
  if (siteOf(host)?.publicSite === false) return { rules: [{ userAgent: '*', disallow: '/' }] }
  // a site of its own (D-270) names its own sitemap, and its sign-in and sign-up under their own addresses
  const own = siteOf(host)?.own
  const base = own ? siteOf(host)!.url : MAIN_URL
  const disallow = own ? [...new Set([...PRIVATE, ...PRIVATE.map((p) => addressOf(own.paths, p))])] : PRIVATE
  return {
    rules: [{ userAgent: '*', allow: '/', disallow }],
    sitemap: `${base}/sitemap.xml`,
    host: `${base}/`,
  }
}
