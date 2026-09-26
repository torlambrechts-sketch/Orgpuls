/**
 * orgpuls-seo — search data for the admin, once a day (0061, D-106).
 *
 * Called by pg_cron through pg_net with the dispatcher's secret in `x-dispatch-secret`.
 *
 * 1. **Google Search Console.** With GSC_SERVICE_ACCOUNT (the service account's JSON key) and
 *    GSC_SITE (the property, e.g. `sc-domain:orgpuls.com`) set, it signs a read-only token and
 *    pulls the last days' rows by date, page, query, country and device into app.seo_search.
 *    Without them it records `not_configured` and stops: the admin shows how to connect it.
 * 2. **IndexNow.** It reads the site's sitemap and announces what changed in the last two
 *    days (every URL with ?indexnow=all) to api.indexnow.org, one request per host. The key
 *    is public by design and served at the site's root.
 *
 *   POST                  both, the last 5 days of Search Console
 *   POST ?days=90         backfill up to 480 days (Search Console keeps 16 months)
 *   POST ?indexnow=all    announce every URL in the sitemap
 *   POST ?probe=status    whether Search Console is configured and reachable; nothing written
 *
 * Log lines carry counts and HTTP codes, never a query.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { indexNowBodies, searchRequest, serviceJwt, sitemapUrls, toRows, type ServiceAccount } from '../_shared/seo.ts'

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]
  return d === 0
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

async function googleToken(sa: ServiceAccount): Promise<string | { error: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await serviceJwt(sa) }),
  })
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string }
  return body.access_token ?? { error: `token_${res.status}_${(body.error ?? 'unknown').replace(/[^a-z_]/g, '')}` }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const secret = Deno.env.get('ORGPULS_DISPATCH_SECRET') ?? ''
  if (!secret || !same(req.headers.get('x-dispatch-secret') ?? '', secret)) return json({ error: 'unauthorised' }, 403)

  const url = new URL(req.url)
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const site = Deno.env.get('GSC_SITE') ?? ''
  let sa: ServiceAccount | null = null
  try {
    const raw = JSON.parse(Deno.env.get('GSC_SERVICE_ACCOUNT') ?? 'null')
    if (raw?.client_email && raw?.private_key) sa = raw
  } catch {
    sa = null
  }

  // ---------------------------------------------------------------- status
  if (url.searchParams.get('probe') === 'status') {
    if (!sa || !site) return json({ configured: false, site: site || null })
    const token = await googleToken(sa)
    if (typeof token !== 'string') return json({ configured: true, reachable: false, code: token.error })
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}`, { headers: { authorization: `Bearer ${token}` } })
    await res.body?.cancel()
    return json({ configured: true, reachable: res.ok, code: res.status, account: sa.client_email.replace(/^[^@]+/, '…') })
  }

  // ---------------------------------------------------------------- Search Console
  const gsc = { rows: 0, code: 'ok' }
  if (!sa || !site) {
    gsc.code = 'not_configured'
    await svc.rpc('seo_run_record', { p_kind: 'gsc', p_ok: false, p_count: 0, p_error: 'not_configured' })
  } else {
    const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 5) || 5, 1), 480)
    const end = new Date(Date.now() - 2 * 86_400_000) // Search Console's final data lags about two days
    const start = new Date(end.getTime() - (days - 1) * 86_400_000)
    const token = await googleToken(sa)
    if (typeof token !== 'string') {
      gsc.code = token.error
    } else {
      for (let startRow = 0; startRow < 500_000; startRow += 25000) {
        const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(searchRequest(isoDay(start), isoDay(end), startRow)),
        })
        if (!res.ok) {
          gsc.code = `gsc_${res.status}`
          await res.body?.cancel()
          break
        }
        const rows = toRows(await res.json())
        for (let i = 0; i < rows.length; i += 1000) {
          const { data, error } = await svc.rpc('seo_search_upsert', { p_rows: rows.slice(i, i + 1000) })
          if (error) {
            gsc.code = 'db_error'
            break
          }
          gsc.rows += Number(data ?? 0)
        }
        if (rows.length < 25000 || gsc.code !== 'ok') break
      }
    }
    await svc.rpc('seo_run_record', { p_kind: 'gsc', p_ok: gsc.code === 'ok', p_count: gsc.rows, p_error: gsc.code === 'ok' ? null : gsc.code })
    console.log(`[seo] search console: ${gsc.code}, ${gsc.rows} rows`)
  }

  // ---------------------------------------------------------------- IndexNow
  const siteUrl = (Deno.env.get('ORGPULS_SITE_URL') ?? 'https://www.orgpuls.com').replace(/\/+$/, '')
  const indexnow = { urls: 0, code: 'ok' }
  const map = await fetch(`${siteUrl}/sitemap.xml`)
  if (!map.ok) {
    indexnow.code = `sitemap_${map.status}`
    await map.body?.cancel()
  } else {
    const all = url.searchParams.get('indexnow') === 'all'
    const bodies = indexNowBodies(sitemapUrls(await map.text()), all ? null : new Date(Date.now() - 2 * 86_400_000))
    for (const body of bodies) {
      if (body.urlList.length === 0) continue
      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      })
      await res.body?.cancel()
      // 200 accepted, 202 accepted pending the key check
      if (res.status === 200 || res.status === 202) indexnow.urls += body.urlList.length
      else indexnow.code = `indexnow_${res.status}`
    }
  }
  await svc.rpc('seo_run_record', { p_kind: 'indexnow', p_ok: indexnow.code === 'ok', p_count: indexnow.urls, p_error: indexnow.code === 'ok' ? null : indexnow.code })
  console.log(`[seo] indexnow: ${indexnow.code}, ${indexnow.urls} urls`)

  return json({ gsc, indexnow })
})
