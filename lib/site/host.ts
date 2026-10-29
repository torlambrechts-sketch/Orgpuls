import 'server-only'
import { headers } from 'next/headers'
import { cache } from 'react'
import { SITE_HOST_HEADER, siteOf, type Site } from '@/lib/hosts'

/**
 * The host this request is answered as: the one the middleware decided on (lib/hosts.ts
 * `effectiveHost`, SITE_HOST_HEADER), else the forwarded host, else the host header, in the
 * middleware's own order. Every server reader of the site goes through here, so the gate, the
 * texts, the market and the pages never disagree about which site a request is on.
 */
export const requestHost = cache(async (): Promise<string | null> => {
  const h = await headers()
  return h.get(SITE_HOST_HEADER) ?? h.get('x-forwarded-host') ?? h.get('host')
})

/** The site this request is on (lib/hosts.ts SITES), or null on a host that is not one */
export const requestSite = cache(async (): Promise<Site | null> => siteOf(await requestHost()))
