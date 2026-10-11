import 'server-only'
import { headers } from 'next/headers'
import { cache } from 'react'
import { BRANDS } from '@/lib/brand'
import { flag, FLAG_NAMES, type FlagName } from '@/lib/flags'
import { addressOf, siteOf, type Site } from '@/lib/hosts'
import { registryTexts, type Locale } from '@/lib/i18n/locales'
import { SHOTS, SITE_SHOTS } from '@/lib/marketing/shots'

/**
 * The site of its own this request is on (D-270, lib/hosts.ts `Site.own`): Empvibe's, open since
 * UK-G (D-275), and Sweden's since SE-F (D-276). Null on Norway's hosts and on any host that is not
 * a site, where the public site is canonical on www.orgpuls.com, in Norwegian or in English on the
 * same address.
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

/** The product pictures this site shows: a site of its own's where it has them (D-272, D-276), Norway's elsewhere */
export const siteShots = async () => {
  const key = (await ownSite())?.site.own.key
  return (key && SITE_SHOTS[key]) || SHOTS
}

/**
 * The language a site's picture of the survey is drawn in: a language its market's employees answer
 * in, and never two at once. On a site of its own in another language than English, the site's own
 * only where the survey offers it and the survey page's words are in its catalogue; English
 * otherwise, which every survey offers. Sweden's site therefore draws it in English (D-276): Swedish
 * is not switched on in the survey (`locale_sv`, still Tor's decision, X-109), and even once it is,
 * the Swedish survey page's words live in the translation registry (D-252), not in messages/sv.json,
 * so a drawing in Swedish would have English around Swedish statements.
 * Null where the page's own language is the survey's (Norway's site, Empvibe's).
 */
export const surveyPictureLocale = async (): Promise<Locale | null> => {
  const lang = (await ownSite())?.site.lang
  if (!lang || lang === 'en') return null
  const name = `locale_${lang}`
  const offered = (FLAG_NAMES as readonly string[]).includes(name) && flag(name as FlagName)
  return offered && !registryTexts(lang) ? null : 'en'
}
