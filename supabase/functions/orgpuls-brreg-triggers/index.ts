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
 * Steps 1–3 run one feed page at a time, and the feed's position moves past a page only once its
 * entities are ingested and its removals purged; step 4 runs the role feed the same way. Every call to the register has a time limit, and the
 * run as a whole has a budget well under the platform's wall-clock limit: a run that reaches it stops
 * between pages, keeps what it finished and ends as `deadline`, so the next run continues from there
 * instead of starting the same backlog again.
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
const ROLE_PAGE = 200 // a role page's lookups fit the budget; the feed's position moves a page at a time
const CALL_MS = 15_000 // one call to the register
const BUDGET_MS = 100_000 // new work starts only within this; the Edge wall-clock limit is 150 s on the smallest plan

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]
  return d === 0
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const get = (url: string) => fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(CALL_MS) })
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

  const started = Date.now()
  const late = () => Date.now() - started > BUDGET_MS
  // the feeds' positions as far as the work is finished: only these are saved
  let feedDone: number | null = b.feedCursor
  let rolesDone: number | null = b.rolesCursor
  let error: string | null = null
  const counts = { changes: 0, ingested: 0, raised: 0, purged: 0, roles: 0, named: 0 }

  /** one feed page's entities: re-fetched and ingested, the removed ones purged; an error code or null */
  async function ingestPage(changed: Map<string, Change>): Promise<string | null> {
    const wanted = [...changed].filter(([, c]) => c.type === 'Ny' || c.type === 'Endring').map(([o]) => o)
    const gone = [...changed].filter(([, c]) => c.type === 'Fjernet').map(([o]) => o)
    for (const group of chunks(wanted, 100)) {
      if (late()) return 'deadline'
      const res = await get(`${API}/enheter?organisasjonsnummer=${group.join(',')}&size=100`)
      if (!res.ok) {
        await res.body?.cancel()
        return `entities_${res.status}`
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
        if (e) return 'ingest_failed'
        counts.ingested += replyCount(data, 'seen')
        counts.raised += replyCount(data, 'raised')
      }
    }
    // HTTP 410: removed for legal reasons, purged. Any answer that does not settle it keeps the page
    // unfinished, so the organisation is asked again next run rather than skipped for good.
    for (const o of gone) {
      if (late()) return 'deadline'
      const res = await get(`${API}/enheter/${o}`)
      if (res.status === 410) {
        await res.body?.cancel()
        const { error: e } = await svc.rpc('brreg_purge', { p_org: o })
        if (e) return 'purge_failed'
        counts.purged++
      } else if (res.ok) {
        // still registered, only missing from the search (its index lags): ingested from the single fetch
        const row = toRow(await res.json(), changed.get(o))
        if (row) {
          const { data, error: e } = await svc.rpc('brreg_ingest', { p_poll: poll, p_rows: [row] })
          if (e) return 'ingest_failed'
          counts.ingested += replyCount(data, 'seen')
          counts.raised += replyCount(data, 'raised')
        }
      } else {
        await res.body?.cancel()
        if (res.status !== 404) return `purge_${res.status}`
      }
    }
    return null
  }

  try {
    // ---------------------------------------------------------------- 1–3. the update feed, a page at a time
    let url = feedDone === null
      ? `${API}/oppdateringer/enheter?dato=${yesterday()}&size=${FEED_SIZE}&includeChanges=true`
      : `${API}/oppdateringer/enheter?oppdateringsid=${feedDone + 1}&size=${FEED_SIZE}&includeChanges=true`
    for (let page = 0; page < MAX_FEED_PAGES; page++) {
      if (late()) {
        error = 'deadline'
        break
      }
      const res = await get(url)
      if (!res.ok) {
        error = `feed_${res.status}`
        await res.body?.cancel()
        break
      }
      const items = parseFeed(await res.json())
      if (!items.length) break
      const changed = new Map<string, Change>()
      foldFeed(items, changed)
      const pageEnd = items.reduce((m, it) => Math.max(m, it.id), feedDone ?? 0)
      error = await ingestPage(changed)
      if (error) break
      feedDone = pageEnd
      counts.changes += changedCount(changed)
      if (items.length < FEED_SIZE) break
      url = `${API}/oppdateringer/enheter?oppdateringsid=${pageEnd + 1}&size=${FEED_SIZE}&includeChanges=true`
    }

    // ---------------------------------------------------------------- 4. the role feed: dates only, a page at a time
    // The role feed's position moves past a page only once every organisation on it the engine follows
    // was looked up and ingested; a page that does not finish is read again next run.
    let rurl = rolesDone === null
      ? `${API}/oppdateringer/roller?afterTime=${yesterday()}&size=${ROLE_PAGE}`
      : `${API}/oppdateringer/roller?afterId=${rolesDone}&size=${ROLE_PAGE}`
    for (let page = 0; !error && page < MAX_FEED_PAGES; page++) {
      if (late()) {
        error = 'deadline'
        break
      }
      const res = await get(rurl)
      if (!res.ok) {
        error = `roles_feed_${res.status}`
        await res.body?.cancel()
        break
      }
      const events = parseRoleFeed(await res.json())
      if (!events.length) break
      const pageEnd = events.reduce((m, ev) => Math.max(m, ev.id), rolesDone ?? 0)
      const cand = await svc.rpc('brreg_role_candidates', { p_orgs: [...new Set(events.map((ev) => ev.org))] })
      if (cand.error) {
        error = 'candidates_failed'
        break
      }
      const rows: { org_number: string; manager_changed_on: string }[] = []
      for (const o of parseOrgList(cand.data)) {
        if (late()) {
          error = 'deadline'
          break
        }
        const r = await get(`${API}/enheter/${o}/roller`)
        if (!r.ok) {
          await r.body?.cancel()
          if (r.status === 404) continue
          error = `roles_${r.status}`
          break
        }
        const on = managerChangedOn(await r.json())
        if (on) rows.push({ org_number: o, manager_changed_on: on })
      }
      if (error) break
      if (rows.length) {
        const { data, error: e } = await svc.rpc('brreg_roles_ingest', { p_poll: poll, p_rows: rows })
        if (e) {
          error = 'roles_ingest_failed'
          break
        }
        const raised = replyCount(data, 'raised')
        counts.roles += raised
        counts.raised += raised
      }
      rolesDone = pageEnd
      if (events.length < ROLE_PAGE) break
      rurl = `${API}/oppdateringer/roller?afterId=${pageEnd}&size=${ROLE_PAGE}`
    }

    // ---------------------------------------------------------------- 5. names, for a call or a letter only
    if (!error) {
      const need = await svc.rpc('brreg_outreach_names_needed')
      const list = parseNameNeeds(need.data)
      const named: { id: string; name: string }[] = []
      for (const r of list) {
        if (late()) break // names are asked for again next run: nothing is lost
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

  const end = await svc.rpc('brreg_poll_end', {
    p_poll: poll,
    p_changes: counts.changes,
    // the feeds move only past work that finished, so the next run reads the rest again
    // (ingesting is idempotent: a trigger is raised once per organisation and kind in 180 days)
    p_feed_cursor: feedDone,
    p_roles_cursor: rolesDone,
    p_error: error,
  })
  // a poll whose end is not recorded stays «running» and its feeds' positions unsaved: say so
  const ended = !end.error && typeof end.data === 'object' && end.data !== null && 'ok' in end.data && end.data.ok === true
  if (!ended) error = error ?? 'end_failed'
  console.log(JSON.stringify({ poll, ...counts, error, ended }))
  return json({ ok: !error, poll, ...counts, error })
})
