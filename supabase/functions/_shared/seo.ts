/**
 * Search data for the admin (0061, D-106): Google Search Console's performance rows, and
 * IndexNow for the engines that take it (Bing, Yandex, Seznam, Naver — Google does not).
 *
 * Pure functions, so the unit tests can run them: the service-account token's JWT, the
 * Search Console request, the sitemap's URLs and what IndexNow is sent.
 */

/** Public by design: IndexNow proves ownership by this key being served at the site's root. */
export const INDEXNOW_KEY = 'e02fe48ed85b382dcc8f874a523afff5'

export interface ServiceAccount {
  client_email: string
  private_key: string
}

const b64url = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const utf8 = (s: string) => new TextEncoder().encode(s)

/** The signed assertion Google exchanges for an access token (RFC 7523), read-only scope. */
export async function serviceJwt(sa: ServiceAccount, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = b64url(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claims = b64url(
    utf8(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    ),
  )
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(`${header}.${claims}`)))
  return `${header}.${claims}.${b64url(sig)}`
}

export interface SearchRow {
  day: string
  page: string
  query: string
  country: string
  device: string
  clicks: number
  impressions: number
  position: number
}

/** One Search Console page of rows, by date, page, query, country and device. */
export function searchRequest(start: string, end: string, startRow: number) {
  return {
    startDate: start,
    endDate: end,
    dimensions: ['date', 'page', 'query', 'country', 'device'],
    rowLimit: 25000,
    startRow,
    dataState: 'final',
  }
}

/** Search Console's rows as the database keeps them: the page as a path, the rest as given. */
export function toRows(api: { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; position?: number }> }): SearchRow[] {
  return (api.rows ?? []).flatMap((r) => {
    const [day, url, query, country, device] = r.keys ?? []
    if (!day || !url || query === undefined || !country || !device) return []
    let page: string
    try {
      page = new URL(url).pathname.replace(/\/+$/, '') || '/'
    } catch {
      return []
    }
    return [{ day, page, query: query.slice(0, 200), country, device, clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? 0 }]
  })
}

/** Every <loc> of a sitemap with its <lastmod>, and each alternate's href. */
export function sitemapUrls(xml: string): Array<{ loc: string; lastmod: string | null; alternates: string[] }> {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
    const body = m[1] ?? ''
    return {
      loc: body.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim() ?? '',
      lastmod: body.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? null,
      alternates: [...body.matchAll(/href="([^"]+)"/g)].map((a) => a[1] ?? '').filter(Boolean),
    }
  }).filter((u) => u.loc)
}

/** What changed since `since`, as one IndexNow body per host (the protocol takes one host a request). */
export function indexNowBodies(urls: ReturnType<typeof sitemapUrls>, since: Date | null, key = INDEXNOW_KEY) {
  const picked = urls.filter((u) => since === null || (u.lastmod !== null && new Date(u.lastmod) >= since))
  const byHost = new Map<string, Set<string>>()
  for (const u of picked) {
    for (const href of [u.loc, ...u.alternates]) {
      try {
        const host = new URL(href).host
        if (!byHost.has(host)) byHost.set(host, new Set())
        byHost.get(host)!.add(href)
      } catch {
        // not a URL: nothing to announce
      }
    }
  }
  return [...byHost].map(([host, set]) => ({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: [...set].slice(0, 10000) }))
}
