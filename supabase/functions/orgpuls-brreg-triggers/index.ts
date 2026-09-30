/**
 * orgpuls-brreg-triggers — the Brønnøysund trigger engine's daily poll (0143, D-184).
 *
 * Called by pg_cron (app.brreg_cron, 05:10 Oslo) or by «Run poll now» (admin_brreg_poll_now), both
 * through pg_net with the dispatcher's secret in `x-dispatch-secret` and `{ poll_id }` in the body.
 *
 *   1. the update feed since the last update id (the first run: since yesterday), folded per entity;
 *   2. the entities flagged Ny or Endring re-fetched, 100 at a time, and handed to brreg_ingest, where
 *      the database raises threshold_5, threshold_30 and company_new, scores fit and queues outreach
 *      (dry run: queued, not assigned). Sole proprietorships and named addresses never leave this
 *      function (../_shared/brreg.ts);
 *   3. an entity flagged Fjernet, or missing from the search, fetched alone: 410 Gone is purged;
 *   4. the role feed: for the organisations the engine follows (5 or more employees) the daglig
 *      leder group's last change, which raises manager_changed — dates only;
 *   5. the general manager's name for outreach that will be a call or a letter, and for nothing else;
 *   6. the poll's end: the count of changes and the two feeds' positions, or a failure code.
 *
 * Enhetsregisteret is open data (NLOD 2.0) and needs no key. Log lines carry counts and codes only.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  changedCount,
  chunks,
  foldFeed,
  managerChangedOn,
  managerName,
  parseBegin,
  parseEntities,
  parseFeed,
  parseNameNeeds,
  parseOrgList,
  parseRoleFeed,
  replyCount,
  toRow,
  type Change,
} from '../_shared/brreg.ts'

const API = 'https://data.brreg.no/enhetsregisteret/api'
const FEED_SIZE = 1000 // the feed allows size × (page + 1) ≤ 10 000; the id moves forward instead of the page
const MAX_FEED_PAGES = 40
const MAX_ROLE_LOOKUPS = 300

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]
  return d === 0
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const get = (url: string) => fetch(url, { headers: { accept: 'application/json' } })
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) + 'T00:00:00.000Z'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const secret = Deno.env.get('ORGPULS_DISPATCH_SECRET') ?? ''
  if (!secret || !same(req.headers.get('x-dispatch-secret') ?? '', secret)) return json({ error: 'unauthorised' }, 403)
  const body = (await req.json().catch(() => ({}))) as { poll_id?: unknown }
  const pollId = Number.isSafeInteger(body.poll_id) ? (body.poll_id as number) : null

  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const begin = await svc.rpc('brreg_poll_begin', { p_poll: pollId })
  // parsed, not cast: the poll id and the feeds' places drive everything below
  const b = begin.error ? { error: 'begin_failed' } : parseBegin(begin.data)
  if ('error' in b) return json({ error: b.error }, 409)
  const poll = b.poll

  let feedCursor: number | null = b.feedCursor
  let rolesCursor: number | null = b.rolesCursor
  let error: string | null = null
  const changed = new Map<string, Change>()
  const counts = { changes: 0, ingested: 0, raised: 0, purged: 0, roles: 0, named: 0 }

  try {
    // ---------------------------------------------------------------- 1. the update feed
    let url = feedCursor === null
      ? `${API}/oppdateringer/enheter?dato=${yesterday()}&size=${FEED_SIZE}&includeChanges=true`
      : `${API}/oppdateringer/enheter?oppdateringsid=${feedCursor + 1}&size=${FEED_SIZE}&includeChanges=true`
    for (let page = 0; page < MAX_FEED_PAGES; page++) {
      const res = await get(url)
      if (!res.ok) {
        error = `feed_${res.status}`
        await res.body?.cancel()
        break
      }
      const items = parseFeed(await res.json())
      foldFeed(items, changed)
      for (const it of items) feedCursor = Math.max(feedCursor ?? 0, it.id)
      if (items.length < FEED_SIZE || feedCursor === null) break
      url = `${API}/oppdateringer/enheter?oppdateringsid=${feedCursor + 1}&size=${FEED_SIZE}&includeChanges=true`
    }
    counts.changes = changedCount(changed)

    // ---------------------------------------------------------------- 2. the changed entities
    const wanted = [...changed].filter(([, c]) => c.type === 'Ny' || c.type === 'Endring').map(([o]) => o)
    const gone = [...changed].filter(([, c]) => c.type === 'Fjernet').map(([o]) => o)
    for (const group of chunks(wanted, 100)) {
      if (error) break
      const res = await get(`${API}/enheter?organisasjonsnummer=${group.join(',')}&size=100`)
      if (!res.ok) {
        error = `entities_${res.status}`
        await res.body?.cancel()
        break
      }
      const found = new Set<string>()
      const rows = []
      for (const raw of parseEntities(await res.json())) {
        const org = String((raw as { organisasjonsnummer?: unknown }).organisasjonsnummer ?? '')
        found.add(org)
        const row = toRow(raw, changed.get(org))
        if (row) rows.push(row)
      }
      // not in the search: deleted, or removed — the single fetch says which
      for (const o of group) if (!found.has(o)) gone.push(o)
      if (rows.length) {
        const { data, error: e } = await svc.rpc('brreg_ingest', { p_poll: poll, p_rows: rows })
        if (e) {
          error = 'ingest_failed'
          break
        }
        counts.ingested += replyCount(data, 'seen')
        counts.raised += replyCount(data, 'raised')
      }
    }

    // ---------------------------------------------------------------- 3. HTTP 410: purge
    for (const o of error ? [] : gone.slice(0, 500)) {
      const res = await get(`${API}/enheter/${o}`)
      await res.body?.cancel()
      if (res.status === 410) {
        const { error: e } = await svc.rpc('brreg_purge', { p_org: o })
        if (!e) counts.purged++
      }
    }

    // ---------------------------------------------------------------- 4. the role feed: dates only
    if (!error) {
      const orgs = new Set<string>()
      let rurl = rolesCursor === null
        ? `${API}/oppdateringer/roller?afterTime=${yesterday()}&size=${FEED_SIZE}`
        : `${API}/oppdateringer/roller?afterId=${rolesCursor}&size=${FEED_SIZE}`
      for (let page = 0; page < MAX_FEED_PAGES; page++) {
        const res = await get(rurl)
        if (!res.ok) {
          error = `roles_feed_${res.status}`
          await res.body?.cancel()
          break
        }
        const events = parseRoleFeed(await res.json())
        for (const ev of events) {
          orgs.add(ev.org)
          rolesCursor = Math.max(rolesCursor ?? 0, ev.id)
        }
        if (events.length < FEED_SIZE || rolesCursor === null) break
        rurl = `${API}/oppdateringer/roller?afterId=${rolesCursor}&size=${FEED_SIZE}`
      }
      const cand = await svc.rpc('brreg_role_candidates', { p_orgs: [...orgs] })
      const follow = parseOrgList(cand.data).slice(0, MAX_ROLE_LOOKUPS)
      const rows: { org_number: string; manager_changed_on: string }[] = []
      for (const o of follow) {
        const res = await get(`${API}/enheter/${o}/roller`)
        if (!res.ok) {
          await res.body?.cancel()
          continue
        }
        const on = managerChangedOn(await res.json())
        if (on) rows.push({ org_number: o, manager_changed_on: on })
      }
      if (rows.length) {
        const { data } = await svc.rpc('brreg_roles_ingest', { p_poll: poll, p_rows: rows })
        counts.roles = replyCount(data, 'raised')
        counts.raised += counts.roles
      }
    }

    // ---------------------------------------------------------------- 5. names, for a call or a letter only
    if (!error) {
      const need = await svc.rpc('brreg_outreach_names_needed')
      const list = parseNameNeeds(need.data)
      const named: { id: string; name: string }[] = []
      for (const r of list) {
        const res = await get(`${API}/enheter/${r.org_number}/roller`)
        if (!res.ok) {
          await res.body?.cancel()
          continue
        }
        const name = managerName(await res.json())
        if (name) named.push({ id: r.id, name })
      }
      if (named.length) {
        const { data } = await svc.rpc('brreg_outreach_names', { p_rows: named })
        counts.named = replyCount(data, 'named')
      }
    }
  } catch {
    error = error ?? 'exception'
  }

  await svc.rpc('brreg_poll_end', {
    p_poll: poll,
    p_changes: counts.changes,
    // a failed poll keeps the feeds where they were, so the next one reads the same changes again
    // (ingesting is idempotent: a trigger is raised once per organisation and kind in 180 days)
    p_feed_cursor: error ? b.feedCursor : feedCursor,
    p_roles_cursor: error ? b.rolesCursor : rolesCursor,
    p_error: error,
  })
  console.log(JSON.stringify({ poll, ...counts, error }))
  return json({ ok: !error, poll, ...counts, error })
})
