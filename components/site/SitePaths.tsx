'use client'

import type { Route } from 'next'
import NextLink from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, type ComponentProps } from 'react'
import type { UrlObject } from 'url'
import { addressOf, changesLanguage, routeOf } from '@/lib/hosts'
import { DEFAULT_MARKET, type Market } from '@/lib/markets'

type Paths = Readonly<Record<string, string>> | undefined

type Pages = readonly string[] | undefined

const SitePathsContext = createContext<{ paths: Paths; market: Market; pages: Pages }>({ paths: undefined, market: DEFAULT_MARKET, pages: undefined })

/**
 * The addresses of a site of its own (D-270, lib/hosts.ts `Site.own`), for the public chrome and
 * pages under it: Empvibe's /platform is the route /plattform. The marketing layout provides them;
 * on Norway's hosts there are none, and every address is its route. With them, the market a
 * sign-up on this host joins, whose company number the site's forms ask for.
 */
export function SitePathsProvider({ paths, market, pages, children }: { paths: Paths; market: Market; pages?: Pages; children: React.ReactNode }) {
  const value = useMemo(() => ({ paths, market, pages }), [paths, market, pages])
  return <SitePathsContext.Provider value={value}>{children}</SitePathsContext.Provider>
}

/** A link's address on this site, and the route the address in the browser shows */
export function useSitePaths() {
  const { paths } = useContext(SitePathsContext)
  return useMemo(() => ({ address: (href: string) => addressOf(paths, href), route: (path: string) => routeOf(paths, path) }), [paths])
}

/** The market a sign-up on this host joins (lib/hosts.ts marketOfHost) */
export const useSiteMarket = (): Market => useContext(SitePathsContext).market

/** The route of the page in the browser: what a component compares its links with */
export function useRoute(): string {
  const { route } = useSitePaths()
  return route(usePathname())
}

/**
 * Go to a route of this site from code (a form's submit): a client-side navigation, or a page load
 * where the page's language changes (lib/hosts.ts changesLanguage, D-276)
 */
export function useSiteNavigate() {
  const router = useRouter()
  const { address } = useSitePaths()
  const { pages } = useContext(SitePathsContext)
  const here = useRoute()
  return useCallback(
    (href: string) => (changesLanguage(pages, here, href) ? window.location.assign(address(href)) : router.push(address(href) as Route)),
    [router, address, pages, here],
  )
}

/**
 * next/link under this site's addresses: the public site's components link to routes, and on a
 * site of its own each one is drawn as that site's address, so a crawler and a reader see one
 * address per page and nothing redirects.
 */
export default function SiteLink({ href, ...props }: Omit<ComponentProps<typeof NextLink>, 'href'> & { href: string | UrlObject }) {
  const { address } = useSitePaths()
  const { pages } = useContext(SitePathsContext)
  const here = useRoute()
  // a link that changes the page's language is a page load (lib/hosts.ts changesLanguage, D-276)
  if (typeof href === 'string' && changesLanguage(pages, here, href)) {
    const anchor: Record<string, unknown> = { ...props }
    for (const key of ['prefetch', 'replace', 'scroll', 'shallow', 'passHref', 'legacyBehavior', 'locale', 'onNavigate']) delete anchor[key]
    return <a {...(anchor as ComponentProps<'a'>)} href={address(href)} />
  }
  return <NextLink {...props} href={typeof href === 'string' ? (address(href) as Route) : href} />
}
