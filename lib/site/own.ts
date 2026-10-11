import 'server-only'
import { headers } from 'next/headers'
import { cache } from 'react'
import { BRANDS, DEFAULT_BRAND } from '@/lib/brand'
import { addressOf, siteOf, type Site } from '@/lib/hosts'
import { BRAND_SHOTS } from '@/lib/marketing/shots'

/**
 * The site of its own this request is on (D-270, lib/hosts.ts `Site.own`): Empvibe's, open since
 * UK-G (D-275). Null on Norway's hosts and on any host that is not a site, where the public site is
 * canonical on www.orgpuls.com, in Norwegian or in English on the same address.
 *
 * What a page tells a search engine and a link preview follows from it: the address of each page
 * on this site, its canonical URL, its name, its language, and no twin on Orgpuls's hosts, whose
 * pages are another brand's and another market's.
 */
export type OwnSite = {
  site: Site & { own: NonNullable<Site['own']> }
  /** the brand's name, as the site's pages say it */
  name: string
  /** a route's address on this site */
  address: (href: string) => string
  /** a route's absolute URL on this site */
  absolute: (href: string) => string
}

export const ownSite = cache(async (): Promise<OwnSite | null> => {
  const site = siteOf((await headers()).get('host'))
  if (!site?.own) return null
  const own = site as OwnSite['site']
  const address = (href: string) => addressOf(own.own.paths, href)
  return { site: own, name: BRANDS[site.brand].name, address, absolute: (href) => `${site.url}${address(href)}` }
})

/** Whether this site serves the route (a site of its own serves its list; Norway's hosts every page) */
export const serves = (own: OwnSite | null, route: string) => !own || (own.site.own.pages as readonly string[]).includes(route)

/** The product pictures this site shows: its brand's on a site of its own, Orgpuls's elsewhere (D-272) */
export const siteShots = async () => BRAND_SHOTS[(await ownSite())?.site.brand ?? DEFAULT_BRAND]
