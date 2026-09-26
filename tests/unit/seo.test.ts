import { generateKeyPairSync, createVerify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { INDEXNOW_KEY, indexNowBodies, searchRequest, serviceJwt, sitemapUrls, toRows } from '@/supabase/functions/_shared/seo'

/** Search data (D-106): the service-account token, Search Console's rows, the sitemap and IndexNow. */
describe('search data (D-106)', () => {
  it('signs a read-only RS256 assertion Google can verify', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const jwt = await serviceJwt({ client_email: 'sync@orgpuls.iam.gserviceaccount.com', private_key: pem }, 1_790_000_000)
    const [h, c, s] = jwt.split('.')
    const claims = JSON.parse(Buffer.from(c!, 'base64url').toString())
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(claims).toMatchObject({ iss: 'sync@orgpuls.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/webmasters.readonly', exp: 1_790_003_600 })
    const ok = createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s!, 'base64url'))
    expect(ok).toBe(true)
  })

  it('asks for rows by date, page, query, country and device, final data only', () => {
    expect(searchRequest('2026-09-01', '2026-09-24', 25000)).toMatchObject({ dimensions: ['date', 'page', 'query', 'country', 'device'], rowLimit: 25000, startRow: 25000, dataState: 'final' })
  })

  it('keeps a page as its path and drops a row it cannot read', () => {
    const rows = toRows({
      rows: [
        { keys: ['2026-09-20', 'https://www.orgpuls.com/artikler/x/', 'kartlegging arbeidsmiljø', 'nor', 'MOBILE'], clicks: 3, impressions: 40, position: 7.25 },
        { keys: ['2026-09-20', 'not a url', 'q', 'nor', 'DESKTOP'] },
        { keys: ['2026-09-20'] },
      ],
    })
    expect(rows).toEqual([{ day: '2026-09-20', page: '/artikler/x', query: 'kartlegging arbeidsmiljø', country: 'nor', device: 'MOBILE', clicks: 3, impressions: 40, position: 7.25 }])
  })

  it('announces what changed, one body per host, with the key the site serves', () => {
    const xml = `<urlset><url><loc>https://www.orgpuls.com/artikler/a</loc><xhtml:link rel="alternate" hreflang="en" href="https://en.orgpuls.com/artikler/a"/><lastmod>2026-09-25</lastmod></url>
      <url><loc>https://www.orgpuls.com/priser</loc></url></urlset>`
    const urls = sitemapUrls(xml)
    expect(urls).toHaveLength(2)
    const recent = indexNowBodies(urls, new Date('2026-09-24'))
    expect(recent.map((b) => [b.host, b.urlList])).toEqual([
      ['www.orgpuls.com', ['https://www.orgpuls.com/artikler/a']],
      ['en.orgpuls.com', ['https://en.orgpuls.com/artikler/a']],
    ])
    expect(indexNowBodies(urls, null)[0]!.urlList).toHaveLength(2)
    expect(recent[0]!.keyLocation).toBe(`https://www.orgpuls.com/${INDEXNOW_KEY}.txt`)
    expect(readFileSync(`public/${INDEXNOW_KEY}.txt`, 'utf8')).toBe(INDEXNOW_KEY)
    // served without a session: the middleware lists it among the public paths
    expect(readFileSync('lib/supabase/middleware.ts', 'utf8')).toContain(`'/${INDEXNOW_KEY}.txt'`)
  })
})
