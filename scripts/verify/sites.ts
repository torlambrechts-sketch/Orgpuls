/**
 * Every site, rendered. One server answers every market's site (lib/hosts.ts SITES), and every
 * end-to-end, pixel and screen check before this ran on localhost, which is always Norway's: nothing
 * looked at Sweden's, Germany's or Empvibe's pages as a reader gets them. A non-production server
 * shows another market's site on `?site=<market>` (lib/hosts.ts effectiveHost), so this asks each
 * site for each page it serves, at its own addresses, and checks what a reader and a search engine get:
 *
 *   the page answers 200                     no 404 for a page the site's own menu links to
 *   <html lang> is the site's language       Swedish on Sweden's, German on Germany's, English on Empvibe's
 *   the canonical URL is the site's own      never www.orgpuls.com on another market's page
 *   hreflang and JSON-LD say the site's tag  sv-SE, de-DE, en-GB (D-276, D-291); never another's
 *   no message key shows as text             `site.home.title` where a text is missing
 *   Empvibe's pages never say «Orgpuls»      the brand's name (lib/brand.ts), addresses aside
 *   the sitemap names only the site's host   where indexing is on
 *
 *   npx tsx scripts/verify/sites.ts [--base http://localhost:3000] [--markets no,se,gb,de]
 *
 * A market whose site the registry does not open yet (lib/markets.ts MarketConfig.site) is skipped.
 */
import { addressOf, MAIN_URL, SITES, siteTag, type Site } from '@/lib/hosts'
import { bcp47 } from '@/lib/i18n/locales'
import { MARKETS, type Market } from '@/lib/markets'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1]! : fallback
}
const BASE = arg('base', 'http://localhost:3000')
const ASKED = arg('markets', MARKETS.join(',')).split(',') as Market[]

/** Norway's pages the other sites have twins of, and its own price, terms and article pages */
const NORWAY_PAGES = ['/', '/plattform', '/bruksomrader', '/hvorfor', '/lovkrav', '/verneombud', '/smaa-bedrifter', '/sikkerhet', '/kontakt', '/personvernerklaering', '/priser', '/vilkar', '/artikler']
/** what a missing message renders as (lib/i18n/request.ts getMessageFallback) */
const MISSING_KEY = /\b(site|seo|start|app|brand|mail)\.[a-z][A-Za-z0-9]*\.[A-Za-z0-9.]*[A-Za-z0-9]\b/
const OTHER_TAGS = ['sv-SE', 'de-DE', 'en-GB', 'nb-NO']

const failures: string[] = []
const fail = (site: string, path: string, what: string) => failures.push(`${site} ${path}: ${what}`)

/** the visible text of a page: no scripts, no styles, no tags */
const visible = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1]

/** every inLanguage the page's JSON-LD states */
function ldLanguages(html: string): string[] {
  const out: string[] = []
  for (const [, body] of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    for (const [, v] of (body ?? '').matchAll(/"inLanguage":(\[[^\]]*\]|"[^"]*")/g)) {
      const value = JSON.parse(v!) as string | string[]
      out.push(...(Array.isArray(value) ? value : [value]))
    }
  }
  return out
}

async function check(site: Site, route: string) {
  const own = site.own
  const address = addressOf(own?.paths, route)
  const url = `${BASE}${address}${address.includes('?') ? '&' : '?'}site=${site.market}`
  const res = await fetch(url, { redirect: 'manual' })
  const where = site.host
  if (res.status !== 200) return fail(where, address, `answered ${res.status}${res.headers.get('location') ? ` → ${res.headers.get('location')}` : ''}`)
  const html = await res.text()

  const lang = html.match(/<html[^>]*\slang="([^"]+)"/)?.[1]
  const wanted = bcp47(site.lang)
  if (lang !== wanted) fail(where, address, `<html lang="${lang}">, not ${wanted}`)

  const canonical = [...html.matchAll(/<link[^>]+rel="canonical"[^>]*>/g)].map((m) => attr(m[0], 'href'))[0]
  const home = own ? site.url : MAIN_URL
  if (!canonical) fail(where, address, 'no canonical URL')
  else if (new URL(canonical).host !== new URL(home).host) fail(where, address, `canonical on ${new URL(canonical).host}, not ${new URL(home).host}`)

  const tag = siteTag(site)
  if (own) {
    const langs = [...html.matchAll(/<link[^>]+rel="alternate"[^>]*hrefLang="([^"]+)"[^>]*>|<link[^>]+hrefLang="([^"]+)"[^>]+rel="alternate"[^>]*>/gi)].map((m) => m[1] ?? m[2])
    for (const l of langs) if (l !== tag && l !== 'x-default') fail(where, address, `hreflang ${l} on a site written in ${tag}`)
    for (const l of ldLanguages(html)) if (l !== tag) fail(where, address, `JSON-LD says ${l}, not ${tag}`)
  } else for (const l of ldLanguages(html)) if (OTHER_TAGS.includes(l) && l !== 'nb-NO') fail(where, address, `JSON-LD says ${l} on Norway's site`)

  const text = visible(html)
  // a host name the page prints (app.orgpuls.no) has the shape of a key and is not one
  const key = [...text.matchAll(new RegExp(MISSING_KEY, 'g'))].map((m) => m[0]).find((k) => !/\.(no|com|se|de|uk)$/.test(k))
  if (key) fail(where, address, `shows the message key ${key}`)
  if (site.brand === 'empvibe' && /\bOrgpuls\b/.test(text)) fail(where, address, `says «Orgpuls» on Empvibe's site: …${text.slice(Math.max(0, text.search(/\bOrgpuls\b/) - 40), text.search(/\bOrgpuls\b/) + 40).trim()}…`)
}

async function sitemap(site: Site) {
  const res = await fetch(`${BASE}/sitemap.xml?site=${site.market}`)
  if (res.status !== 200) return fail(site.host, '/sitemap.xml', `answered ${res.status}`)
  const hosts = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).host)
  const home = new URL(site.own ? site.url : MAIN_URL).host
  for (const h of new Set(hosts)) if (h !== home) fail(site.host, '/sitemap.xml', `names ${h}, not only ${home}`)
}

async function main() {
  for (const market of ASKED) {
    // a market's site as a reader reaches it: the first host the registry names for it
    const site = SITES.find((s) => s.market === market)
    if (!site) {
      console.log(`${market}: no site served (its site is not open in lib/markets.ts); skipped`)
      continue
    }
    const pages = site.own ? [...site.own.pages] : NORWAY_PAGES
    for (const route of pages) await check(site, route)
    await sitemap(site)
    console.log(`${market}: ${site.host}, ${pages.length} pages checked`)
  }

  if (failures.length) {
    console.error(`sites: ${failures.length} problems\n  ${failures.join('\n  ')}`)
    process.exit(1)
  }
  console.log('sites: every site answers in its own language, at its own addresses, under its own name')
}

void main()
