/**
 * The Entra ID import (step 2 of the integration plan, D-202): employees and groups from
 * Microsoft Graph, kept in sync. Pure like mail.ts and brreg.ts — no imports, no runtime
 * globals but `fetch`-shaped functions and Web Crypto, which Deno and Node both have — so the
 * Edge Function runs it and tests/unit/entra-*.test.ts prove it against the same code.
 *
 * Three layers:
 *   1. Graph: the URLs this import asks for (and nothing else), the parsing of what comes back,
 *      the certificate client assertion and the token request, retries on 429/503/504.
 *   2. The planner: given the organisation's current state (as entra_sync_begin returns it) and
 *      what Graph said this run, the exact writes — people to add, link, update, deactivate and
 *      place, the membership mirror's changes, group renames, skips with a reason, conflicts.
 *      The database applies the plan in one transaction (entra_sync_apply) and enforces the
 *      lifecycle rules itself; the planner's job is to compute, the database's to refuse.
 *   3. The run: one organisation, begin → token → delta or full read → plan → apply, or fail
 *      with a code. Every side effect is a function handed in, so a test can run it whole.
 *
 * Only these fields are ever read for a person: id, displayName, mail, userPrincipalName,
 * accountEnabled, preferredLanguage, userType, and mobilePhone when the organisation opted in.
 * Never manager, jobTitle, employeeId, officeLocation or a photo. Nothing here logs a name,
 * an address, a number or a Graph payload: the log callback receives ids, codes and counts.
 */

// ---------------------------------------------------------------------------------------
// Constants and small helpers
// ---------------------------------------------------------------------------------------

export const GRAPH = 'https://graph.microsoft.com/v1.0'
export const LOGIN = 'https://login.microsoftonline.com'
export const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'
/** the survey languages the employee register accepts (employees_language_check) */
export const LANGS = ['no', 'en', 'pl', 'uk', 'lt', 'sv', 'da'] as const
export type Lang = (typeof LANGS)[number]
/** groups/delta takes at most 50 ids in one filter (learn.microsoft.com/graph/api/group-delta) */
export const DELTA_FILTER_MAX = 50
/** delta tokens of directory objects live seven days (delta-query-overview, «Token duration»);
 *  a link older than six is not trusted and the run reads everything again */
export const LINK_MAX_AGE_MS = 6 * 86_400_000

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const isGuid = (s: unknown): s is string => typeof s === 'string' && GUID.test(s)
const MAILBOX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** the reasons a person in a selected group is not imported (counted, never named in a log) */
export const SKIP_REASONS = ['guest', 'disabled', 'no_mailbox', 'no_name', 'email_taken', 'email_ambiguous', 'no_data'] as const
export type SkipReason = (typeof SKIP_REASONS)[number]
export const DEACTIVATE_REASONS = ['removed', 'left_groups', 'disabled', 'guest'] as const
export type DeactivateReason = (typeof DEACTIVATE_REASONS)[number]

/** an error the run ends with, as a code the database stores and the screen translates */
export class SyncError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

// ---------------------------------------------------------------------------------------
// Mapping a directory person onto the register
// ---------------------------------------------------------------------------------------

/** Entra's preferredLanguage («nb-NO», «en-US», «pl») onto the supported set; anything else is null (left as is). */
export function mapLanguage(pref: string | null | undefined): Lang | null {
  if (!pref) return null
  const base = pref.trim().toLowerCase().split(/[-_]/)[0] ?? ''
  if (base === 'nb' || base === 'nn' || base === 'no') return 'no'
  return (LANGS as readonly string[]).includes(base) ? (base as Lang) : null
}

/**
 * The address invitations go to: `mail` when it is an address; otherwise the UPN, but only
 * when it looks like a mailbox — an address shape, not a guest's «#EXT#» UPN, and not on an
 * *.onmicrosoft.com domain, which is a sign-in name rather than somewhere mail is read.
 */
export function mailboxOf(u: { mail?: string | null; userPrincipalName?: string | null }): string | null {
  const mail = (u.mail ?? '').trim()
  if (mail && mail.length <= 254 && MAILBOX.test(mail)) return mail
  const upn = (u.userPrincipalName ?? '').trim()
  if (upn && upn.length <= 254 && MAILBOX.test(upn) && !upn.includes('#EXT#') && !/\.onmicrosoft\.com$/i.test(upn)) return upn
  return null
}

/** a display name as the register keeps it: one line, trimmed, at most 120 characters (as the CSV import) */
export function cleanName(s: string | null | undefined): string | null {
  const v = (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 120).trim()
  return v === '' ? null : v
}

/** a group name as app.groups requires it (0130): trimmed, 1..60 characters */
export function cleanGroupName(s: string | null | undefined): string | null {
  const v = (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 60).trim()
  return v === '' ? null : v
}

// ---------------------------------------------------------------------------------------
// Graph URLs — the only requests this import makes
// ---------------------------------------------------------------------------------------

export const USER_FIELDS = ['id', 'displayName', 'mail', 'userPrincipalName', 'accountEnabled', 'preferredLanguage', 'userType'] as const

export function userSelect(includePhone: boolean): string {
  return [...USER_FIELDS, ...(includePhone ? ['mobilePhone'] : [])].join(',')
}

export function usersDeltaUrl(includePhone: boolean, latest: boolean): string {
  return `${GRAPH}/users/delta?$select=${userSelect(includePhone)}${latest ? '&$deltatoken=latest' : ''}`
}

/** one groups/delta round per 50 selected groups, membership included */
export function groupsDeltaUrls(groupIds: string[], latest: boolean): string[] {
  const ids = groupIds.filter(isGuid)
  const urls: string[] = []
  for (let i = 0; i < ids.length; i += DELTA_FILTER_MAX) {
    const filter = ids.slice(i, i + DELTA_FILTER_MAX).map((id) => `id eq '${id}'`).join(' or ')
    urls.push(`${GRAPH}/groups/delta?$select=displayName,members&$filter=${encodeURIComponent(filter)}${latest ? '&$deltatoken=latest' : ''}`)
  }
  return urls
}

/** a group's users, nested groups resolved (needs ConsistencyLevel: eventual for the cast and $select) */
export function transitiveUsersUrl(groupId: string, includePhone: boolean): string {
  if (!isGuid(groupId)) throw new SyncError('bad_group_id')
  return `${GRAPH}/groups/${groupId}/transitiveMembers/microsoft.graph.user?$select=${userSelect(includePhone)}&$top=999&$count=true`
}

/** how many groups a group has as direct members: more than none, and delta cannot follow it */
export function nestedCountUrl(groupId: string): string {
  if (!isGuid(groupId)) throw new SyncError('bad_group_id')
  return `${GRAPH}/groups/${groupId}/members/microsoft.graph.group/$count`
}

export function groupUrl(groupId: string): string {
  if (!isGuid(groupId)) throw new SyncError('bad_group_id')
  return `${GRAPH}/groups/${groupId}?$select=id,displayName`
}

export function userUrl(objectId: string, includePhone: boolean): string {
  if (!isGuid(objectId)) throw new SyncError('bad_user_id')
  return `${GRAPH}/users/${objectId}?$select=${userSelect(includePhone)}`
}

/** the tenant's groups for the picker: id and name only; a search is on the name */
export function groupSearchUrl(q: string): string {
  const term = q.replace(/["\\]/g, '').trim().slice(0, 60)
  return term === ''
    ? `${GRAPH}/groups?$select=id,displayName&$top=999`
    : `${GRAPH}/groups?$select=id,displayName&$top=999&$count=true&$search=${encodeURIComponent(`"displayName:${term}"`)}`
}

export const tokenUrl = (tenant: string) => {
  if (!isGuid(tenant)) throw new SyncError('bad_tenant')
  return `${LOGIN}/${tenant}/oauth2/v2.0/token`
}

/** a link Graph handed back must stay on Graph: it is followed with an access token */
export const isGraphLink = (u: unknown): u is string => typeof u === 'string' && u.startsWith(`${GRAPH}/`)

// ---------------------------------------------------------------------------------------
// Graph parsing
// ---------------------------------------------------------------------------------------

export interface GraphUser {
  id: string
  displayName?: string | null
  mail?: string | null
  userPrincipalName?: string | null
  accountEnabled?: boolean | null
  preferredLanguage?: string | null
  userType?: string | null
  mobilePhone?: string | null
}

const str = (v: unknown): string | null | undefined => (typeof v === 'string' ? v : v === null ? null : undefined)

/** one user object, only the fields this import reads; anything else in it is dropped here */
export function parseUser(raw: unknown): GraphUser | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!isGuid(r.id)) return null
  const u: GraphUser = { id: r.id }
  for (const k of ['displayName', 'mail', 'userPrincipalName', 'preferredLanguage', 'userType', 'mobilePhone'] as const) {
    const v = str(r[k])
    if (v !== undefined) u[k] = v
  }
  if (typeof r.accountEnabled === 'boolean') u.accountEnabled = r.accountEnabled
  return u
}

export interface Page<T> {
  items: T[]
  next: string | null
  delta: string | null
}

const links = (j: Record<string, unknown>) => ({
  next: isGraphLink(j['@odata.nextLink']) ? (j['@odata.nextLink'] as string) : null,
  delta: isGraphLink(j['@odata.deltaLink']) ? (j['@odata.deltaLink'] as string) : null,
})

export type UserDeltaItem = { user: GraphUser; removed: false } | { id: string; removed: true }

export function parseUserDeltaPage(json: unknown): Page<UserDeltaItem> {
  const j = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const items: UserDeltaItem[] = []
  for (const raw of Array.isArray(j.value) ? j.value : []) {
    const r = raw as Record<string, unknown>
    if (!isGuid(r?.id)) continue
    if (r['@removed'] !== undefined) items.push({ id: r.id as string, removed: true })
    else {
      const u = parseUser(r)
      if (u) items.push({ user: u, removed: false })
    }
  }
  return { items, ...links(j) }
}

export function parseUserListPage(json: unknown): Page<GraphUser> {
  const j = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const items = (Array.isArray(j.value) ? j.value : []).map(parseUser).filter((u): u is GraphUser => u !== null)
  return { items, ...links(j) }
}

export interface GroupDeltaItem {
  id: string
  displayName?: string
  removed: boolean
  addUsers: string[]
  removeUsers: string[]
  /** a group was added to or removed from this group: it nests, and delta cannot follow it */
  nestedChange: boolean
}

export function parseGroupDeltaPage(json: unknown): Page<GroupDeltaItem> {
  const j = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const items: GroupDeltaItem[] = []
  for (const raw of Array.isArray(j.value) ? j.value : []) {
    const r = raw as Record<string, unknown>
    if (!isGuid(r?.id)) continue
    const g: GroupDeltaItem = { id: r.id as string, removed: r['@removed'] !== undefined, addUsers: [], removeUsers: [], nestedChange: false }
    if (typeof r.displayName === 'string') g.displayName = r.displayName
    for (const m of Array.isArray(r['members@delta']) ? r['members@delta'] : []) {
      const mm = m as Record<string, unknown>
      if (!isGuid(mm?.id)) continue
      const type = String(mm['@odata.type'] ?? '')
      if (type === '#microsoft.graph.group') g.nestedChange = true
      else if (type === '#microsoft.graph.user' || type === '') (mm['@removed'] !== undefined ? g.removeUsers : g.addUsers).push(mm.id as string)
    }
    items.push(g)
  }
  return { items, ...links(j) }
}

export function parseGroupList(json: unknown): Page<{ id: string; name: string }> {
  const j = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const items: { id: string; name: string }[] = []
  for (const raw of Array.isArray(j.value) ? j.value : []) {
    const r = raw as Record<string, unknown>
    if (isGuid(r?.id) && typeof r.displayName === 'string' && r.displayName.trim() !== '') items.push({ id: r.id as string, name: r.displayName.trim() })
  }
  return { items, ...links(j) }
}

// ---------------------------------------------------------------------------------------
// The state the database hands the run, parsed (not cast)
// ---------------------------------------------------------------------------------------

export interface StateEmployee {
  id: string
  objectId: string | null
  email: string | null
  fullName: string
  groupId: string | null
  active: boolean
  pinned: boolean
  language: string | null
  phone: string | null
}
export interface StateMapping {
  entraGroupId: string
  groupId: string
  priority: number
  nested: boolean
  entraName: string | null
}
export interface SyncState {
  orgId: string
  runId: string
  tenantId: string
  includePhone: boolean
  roundOpen: boolean
  full: boolean
  usersLink: string | null
  groupLinks: string[]
  mappings: StateMapping[]
  /** the membership mirror: [entra group id, object id] */
  members: [string, string][]
  employees: StateEmployee[]
  deferred: { employeeId: string; groupId: string }[]
}

const uuidish = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)

/** entra_sync_begin's reply. Anything out of shape is a refusal, never a guess. */
export function parseBegin(data: unknown): SyncState | { error: string } {
  if (typeof data !== 'object' || data === null) return { error: 'begin_failed' }
  const d = data as Record<string, unknown>
  if (d.ok !== true) return { error: typeof d.error === 'string' && /^[a-z0-9_]{1,40}$/.test(d.error) ? d.error : 'begin_failed' }
  if (!uuidish(d.org_id) || !uuidish(d.run_id) || !isGuid(d.tenant_id)) return { error: 'begin_failed' }
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  const mappings: StateMapping[] = []
  for (const m of arr(d.mappings)) {
    const r = m as Record<string, unknown>
    if (isGuid(r?.entra_group_id) && uuidish(r.group_id) && Number.isInteger(r.priority))
      mappings.push({
        entraGroupId: r.entra_group_id as string,
        groupId: r.group_id as string,
        priority: r.priority as number,
        nested: r.nested === true,
        entraName: typeof r.entra_name === 'string' ? r.entra_name : null,
      })
  }
  const members: [string, string][] = []
  for (const m of arr(d.members)) if (Array.isArray(m) && isGuid(m[0]) && isGuid(m[1])) members.push([m[0], m[1]])
  const employees: StateEmployee[] = []
  for (const e of arr(d.employees)) {
    const r = e as Record<string, unknown>
    if (!uuidish(r?.id) || typeof r.full_name !== 'string') continue
    employees.push({
      id: r.id as string,
      objectId: isGuid(r.object_id) ? (r.object_id as string) : null,
      email: typeof r.email === 'string' ? r.email : null,
      fullName: r.full_name,
      groupId: uuidish(r.group_id) ? (r.group_id as string) : null,
      active: r.active === true,
      pinned: r.pinned === true,
      language: typeof r.language === 'string' ? r.language : null,
      phone: typeof r.phone === 'string' ? r.phone : null,
    })
  }
  const deferred: { employeeId: string; groupId: string }[] = []
  for (const x of arr(d.deferred)) {
    const r = x as Record<string, unknown>
    if (uuidish(r?.employee_id) && uuidish(r.group_id)) deferred.push({ employeeId: r.employee_id as string, groupId: r.group_id as string })
  }
  return {
    orgId: d.org_id as string,
    runId: d.run_id as string,
    tenantId: d.tenant_id as string,
    includePhone: d.include_phone === true,
    roundOpen: d.round_open === true,
    full: d.full === true,
    usersLink: isGraphLink(d.users_link) ? (d.users_link as string) : null,
    groupLinks: arr(d.group_links).filter(isGraphLink),
    mappings,
    members,
    employees,
    deferred,
  }
}

// ---------------------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------------------

/** What Graph said this run. */
export interface Observations {
  /** every mapped group's whole membership was read (first run, 410, an old link, a new selection) */
  full: boolean
  /** groups whose transitive membership was listed whole this run: their mirror is replaced */
  listed: Record<string, string[]>
  /** direct membership changes from groups/delta, for groups not listed whole */
  memberAdds: [string, string][]
  memberRemoves: [string, string][]
  /** attributes seen this run, by object id */
  users: Record<string, GraphUser>
  /** users Graph reported removed (users/delta @removed, or a 404 on a single read) */
  removedUsers: string[]
  /** a mapped group's current display name */
  groupNames: Record<string, string>
  /** whether a mapped group has groups as members (only for groups checked this run) */
  nested: Record<string, boolean>
  /** mapped groups that no longer exist in the directory */
  goneGroups: string[]
}

export const emptyObservations = (full: boolean): Observations => ({
  full,
  listed: {},
  memberAdds: [],
  memberRemoves: [],
  users: {},
  removedUsers: [],
  groupNames: {},
  nested: {},
  goneGroups: [],
})

export interface PersonWrite {
  objectId: string
  op: 'add' | 'link' | 'update'
  employeeId?: string
  fullName?: string
  email?: string
  language?: Lang
  phone?: string
  activate?: boolean
}

export interface Plan {
  groups: { id: string; name?: string; nested?: boolean; gone?: boolean }[]
  members: { replace: Record<string, string[]>; add: [string, string][]; remove: [string, string][] }
  removedUsers: string[]
  people: PersonWrite[]
  deactivate: { objectId: string; reason: DeactivateReason }[]
  /** linked people whose group the database re-derives from the mirror (it defers while a round is open) */
  place: string[]
  skips: { set: { objectId: string; reason: SkipReason }[]; clear: string[] }
  conflicts: { objectId: string; employeeId: string | null; groupIds: string[]; chosen: string }[]
  /** what the planner expects; the database's own counts are what the run reports */
  predicted: { added: number; linked: number; updated: number; deactivated: number; moved: number; deferred: number; skipped: Record<string, number> }
}

export interface PlanOptions {
  /** the register's phone rule (../_shared/sms.ts normalizePhone), handed in so this file has no imports */
  phoneOf: (raw: string | null | undefined) => string | null
}

/** the object ids whose attributes the run must read one by one before planning: people who joined a group, unknown this run */
export function needsAttributes(state: SyncState, obs: Observations): string[] {
  const known = new Set(Object.keys(obs.users))
  const removed = new Set(obs.removedUsers)
  const prev = new Set(state.members.map(([, o]) => o))
  const want = new Set<string>()
  for (const [, o] of obs.memberAdds) if (!known.has(o) && !removed.has(o)) want.add(o)
  // a whole listing carries attributes; a person in it is known
  for (const oids of Object.values(obs.listed)) for (const o of oids) if (!known.has(o) && !removed.has(o) && !prev.has(o)) want.add(o)
  return [...want]
}

export function plan(state: SyncState, obs: Observations, opts: PlanOptions): Plan {
  const mapped = new Map(state.mappings.map((m) => [m.entraGroupId, m]))
  const gone = new Set(obs.goneGroups.filter((g) => mapped.has(g)))
  const removed = new Set(obs.removedUsers)

  // ---- the mirror after this run
  const mirror = new Map<string, Set<string>>() // object id -> entra group ids
  const add = (o: string, g: string) => (mirror.get(o) ?? mirror.set(o, new Set()).get(o)!).add(g)
  const listedGroups = new Set(Object.keys(obs.listed).filter((g) => mapped.has(g)))
  for (const [g, o] of state.members) if (mapped.has(g) && !listedGroups.has(g) && !gone.has(g)) add(o, g)
  for (const g of listedGroups) for (const o of obs.listed[g] ?? []) add(o, g)
  for (const [g, o] of obs.memberRemoves) if (mapped.has(g) && !listedGroups.has(g)) mirror.get(o)?.delete(g)
  for (const [g, o] of obs.memberAdds) if (mapped.has(g) && !listedGroups.has(g) && !gone.has(g)) add(o, g)
  for (const o of removed) mirror.delete(o)
  const groupsOf = (o: string) =>
    [...(mirror.get(o) ?? [])].map((g) => mapped.get(g)!).sort((a, b) => a.priority - b.priority || a.entraGroupId.localeCompare(b.entraGroupId))

  // ---- who this run looks at
  const byObject = new Map(state.employees.filter((e) => e.objectId).map((e) => [e.objectId as string, e]))
  const before = new Map<string, Set<string>>()
  for (const [g, o] of state.members) (before.get(o) ?? before.set(o, new Set()).get(o)!).add(g)
  const touched = new Set<string>()
  if (obs.full) {
    for (const o of mirror.keys()) touched.add(o)
    for (const o of byObject.keys()) touched.add(o)
  }
  for (const o of Object.keys(obs.users)) if (mirror.has(o) || byObject.has(o) || before.has(o)) touched.add(o)
  for (const o of removed) if (byObject.has(o) || before.has(o)) touched.add(o)
  for (const [, o] of [...obs.memberAdds, ...obs.memberRemoves]) touched.add(o)
  for (const g of [...listedGroups, ...gone]) {
    for (const [gg, o] of state.members) if (gg === g) touched.add(o)
    for (const o of obs.listed[g] ?? []) touched.add(o)
  }

  const out: Plan = {
    groups: [],
    members: { replace: {}, add: [], remove: [] },
    removedUsers: [...removed],
    people: [],
    deactivate: [],
    place: [],
    skips: { set: [], clear: [] },
    conflicts: [],
    predicted: { added: 0, linked: 0, updated: 0, deactivated: 0, moved: 0, deferred: 0, skipped: {} },
  }
  const skip = (o: string, reason: SkipReason) => {
    out.skips.set.push({ objectId: o, reason })
    out.predicted.skipped[reason] = (out.predicted.skipped[reason] ?? 0) + 1
  }

  // ---- groups: names, nesting, gone
  for (const m of state.mappings) {
    const g: Plan['groups'][number] = { id: m.entraGroupId }
    const name = obs.groupNames[m.entraGroupId]
    if (name !== undefined && cleanGroupName(name) && name !== m.entraName) g.name = name
    if (obs.nested[m.entraGroupId] !== undefined) g.nested = obs.nested[m.entraGroupId]
    if (gone.has(m.entraGroupId)) g.gone = true
    if (g.name !== undefined || g.nested !== undefined || g.gone) out.groups.push(g)
  }

  // ---- membership writes
  for (const g of listedGroups) out.members.replace[g] = [...new Set(obs.listed[g] ?? [])]
  for (const g of gone) out.members.replace[g] = []
  for (const [g, o] of obs.memberAdds) if (mapped.has(g) && !listedGroups.has(g) && !gone.has(g)) out.members.add.push([g, o])
  for (const [g, o] of obs.memberRemoves) if (mapped.has(g) && !listedGroups.has(g)) out.members.remove.push([g, o])

  // e-mail lookups for first-run matching: never a duplicate person
  const byEmail = new Map<string, StateEmployee[]>()
  for (const e of state.employees) if (e.email) (byEmail.get(e.email.toLowerCase()) ?? byEmail.set(e.email.toLowerCase(), []).get(e.email.toLowerCase())!).push(e)
  const claimed = new Set<string>() // e-mails taken by this run's own adds and links
  const deferredOf = new Map(state.deferred.map((d) => [d.employeeId, d.groupId]))

  for (const o of [...touched].sort()) {
    const emp = byObject.get(o) ?? null
    const groups = groupsOf(o)

    if (removed.has(o)) {
      if (emp?.active) out.deactivate.push({ objectId: o, reason: 'removed' })
      out.skips.clear.push(o)
      continue
    }
    if (groups.length === 0) {
      if (emp?.active) out.deactivate.push({ objectId: o, reason: 'left_groups' })
      out.skips.clear.push(o)
      continue
    }
    const u = obs.users[o]
    if (!u && !emp) {
      skip(o, 'no_data')
      continue
    }
    if (u && u.userType != null && u.userType !== 'Member') {
      if (emp?.active) out.deactivate.push({ objectId: o, reason: 'guest' })
      if (!emp) skip(o, 'guest')
      continue
    }
    if (u && u.accountEnabled === false) {
      if (emp?.active) out.deactivate.push({ objectId: o, reason: 'disabled' })
      if (!emp) skip(o, 'disabled')
      continue
    }
    // an inactive linked person comes back only on attributes read this run: left as they are
    if (!u && emp && !emp.active) continue

    const chosen = groups[0]!
    let target = emp
    const conflict = () => {
      if (groups.length > 1)
        out.conflicts.push({ objectId: o, employeeId: target?.id ?? null, groupIds: groups.map((g) => g.groupId), chosen: chosen.groupId })
    }

    const email = u ? mailboxOf(u) : null
    const name = u ? cleanName(u.displayName) : null
    const language = u ? mapLanguage(u.preferredLanguage) : null
    const phone = u && state.includePhone ? opts.phoneOf(u.mobilePhone) : null

    if (!emp) {
      if (!email) {
        skip(o, 'no_mailbox')
        continue
      }
      if (!name) {
        skip(o, 'no_name')
        continue
      }
      const key = email.toLowerCase()
      const same = byEmail.get(key) ?? []
      const free = same.filter((e) => !e.objectId)
      if (claimed.has(key) || same.some((e) => e.objectId)) {
        skip(o, 'email_taken')
        continue
      }
      if (free.length > 1) {
        skip(o, 'email_ambiguous')
        continue
      }
      claimed.add(key)
      out.skips.clear.push(o)
      if (free.length === 1) {
        // the CSV-imported person this directory account is: linked, never duplicated
        target = free[0]!
        // the address is the match: the database links only if the person it names still has it
        const w: PersonWrite = { objectId: o, op: 'link', employeeId: target.id, email }
        if (name !== target.fullName) w.fullName = name
        if (language && language !== target.language) w.language = language
        if (phone && phone !== target.phone) w.phone = phone
        if (!target.active) w.activate = true
        out.people.push(w)
        out.predicted.linked++
      } else {
        const w: PersonWrite = { objectId: o, op: 'add', fullName: name, email }
        if (language) w.language = language
        if (phone) w.phone = phone
        out.people.push(w)
        out.predicted.added++
        conflict()
        continue // a new person's group is set as they are added
      }
    } else if (u) {
      out.skips.clear.push(o)
      const w: PersonWrite = { objectId: o, op: 'update', employeeId: emp.id }
      let changed = false
      if (name && name !== emp.fullName) ((w.fullName = name), (changed = true))
      if (email && email !== emp.email) {
        const holders = (byEmail.get(email.toLowerCase()) ?? []).filter((e) => e.id !== emp.id)
        if (holders.length || claimed.has(email.toLowerCase())) skip(o, 'email_taken')
        else ((w.email = email), (changed = true), claimed.add(email.toLowerCase()))
      }
      if (language && language !== emp.language) ((w.language = language), (changed = true))
      if (phone && phone !== emp.phone) ((w.phone = phone), (changed = true))
      if (!emp.active) ((w.activate = true), (changed = true))
      if (changed) {
        out.people.push(w)
        out.predicted.updated++
      }
    }

    // the group: re-derived by the database from the mirror; moved now, or deferred while a round is open
    if (target) {
      conflict()
      out.place.push(o)
      const current = target.groupId
      if (!target.pinned && current !== chosen.groupId) {
        if (state.roundOpen) out.predicted.deferred++
        else out.predicted.moved++
      }
    }
  }

  // moves held back by an open round, for people this run did not otherwise look at
  if (!state.roundOpen) for (const [emp] of deferredOf) {
    const e = state.employees.find((x) => x.id === emp)
    if (e?.objectId && !out.place.includes(e.objectId)) {
      out.place.push(e.objectId)
      out.predicted.moved++
    }
  }
  out.predicted.deactivated = out.deactivate.length
  return out
}

// ---------------------------------------------------------------------------------------
// The certificate client assertion and the token
// ---------------------------------------------------------------------------------------

const b64url = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const b64urlText = (t: string) => b64url(new TextEncoder().encode(t))

function hexBytes(hex: string): Uint8Array | null {
  const h = hex.replace(/[\s:]/g, '').toLowerCase()
  if (!/^[0-9a-f]+$/.test(h) || h.length % 2) return null
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** a PKCS#8 PEM («BEGIN PRIVATE KEY») as Web Crypto takes it; a PKCS#1 key is refused with a code */
export function pemBody(pem: string): ArrayBuffer {
  const m = /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/.exec(pem.replace(/\\n/g, '\n'))
  if (!m) throw new SyncError('cert_format')
  let bin: string
  try {
    bin = atob(m[1]!.replace(/\s+/g, ''))
  } catch {
    throw new SyncError('cert_format')
  }
  const buf = new ArrayBuffer(bin.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return buf
}

export interface AppCredentials {
  clientId: string
  privateKeyPem: string
  /** the certificate's thumbprint in hex: SHA-1 (40 characters, as the Entra admin centre shows it) or SHA-256 (64) */
  thumbprint: string
}

/** RS256, the thumbprint in x5t (SHA-1) or x5t#S256 (SHA-256); five minutes' life */
export async function clientAssertion(cred: AppCredentials, tenant: string, nowSec: number, jti: string): Promise<string> {
  const thumb = hexBytes(cred.thumbprint)
  if (!thumb || (thumb.length !== 20 && thumb.length !== 32)) throw new SyncError('cert_thumbprint')
  const header: Record<string, string> = { alg: 'RS256', typ: 'JWT' }
  header[thumb.length === 20 ? 'x5t' : 'x5t#S256'] = b64url(thumb)
  const claims = { aud: tokenUrl(tenant), iss: cred.clientId, sub: cred.clientId, jti, nbf: nowSec, iat: nowSec, exp: nowSec + 300 }
  const input = `${b64urlText(JSON.stringify(header))}.${b64urlText(JSON.stringify(claims))}`
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey('pkcs8', pemBody(cred.privateKeyPem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  } catch (e) {
    throw e instanceof SyncError ? e : new SyncError('cert_format')
  }
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input)))
  return `${input}.${b64url(sig)}`
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** the token endpoint's refusals, as codes the screen can explain; the body is never logged or stored */
export function tokenErrorCode(status: number, body: unknown): string {
  const d = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const codes = Array.isArray(d.error_codes) ? d.error_codes.map(Number) : []
  // AADSTS700016: the app is not in the tenant; 65001: no consent; 7000112: the app is disabled there
  if (codes.some((c) => c === 700016 || c === 65001 || c === 7000112)) return 'consent_missing'
  // AADSTS700027 / 700024: the assertion's signature or certificate was not accepted
  if (codes.some((c) => c === 700027 || c === 700024 || c === 7000274)) return 'cert_rejected'
  if (d.error === 'invalid_client') return 'cert_rejected'
  return `token_${status}`
}

export async function getToken(f: Fetch, cred: AppCredentials, tenant: string, nowSec: number, jti: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: cred.clientId,
    scope: GRAPH_SCOPE,
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: await clientAssertion(cred, tenant, nowSec, jti),
  })
  const res = await f(tokenUrl(tenant), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof json.access_token !== 'string') throw new SyncError(tokenErrorCode(res.status, json))
  return json.access_token
}

// ---------------------------------------------------------------------------------------
// Calling Graph
// ---------------------------------------------------------------------------------------

export interface GraphDeps {
  fetch: Fetch
  sleep: (ms: number) => Promise<void>
  /** milliseconds left in the run's budget */
  left: () => number
}

/** a Graph GET with the advanced-query header, retried on 429/503/504 after Retry-After */
export async function graphGet(deps: GraphDeps, token: string, url: string, advanced = false): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await deps.fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(advanced ? { consistencylevel: 'eventual' } : {}) },
    })
    if (res.status !== 429 && res.status !== 503 && res.status !== 504) return res
    await res.body?.cancel()
    const after = Number(res.headers.get('retry-after'))
    const wait = Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * (attempt + 1), 30_000)
    if (attempt >= 4 || deps.left() < wait + 5_000) throw new SyncError(res.status === 429 ? 'throttled' : `graph_${res.status}`)
    await deps.sleep(wait)
  }
}

/** a failed Graph answer as a code; the body is read for its code and dropped */
export async function graphError(res: Response): Promise<SyncError> {
  const j = (await res.json().catch(() => ({}))) as { error?: { code?: unknown } }
  const code = typeof j.error?.code === 'string' ? j.error.code : ''
  if (res.status === 410 || code === 'syncStateNotFound' || code === 'resyncRequired' || code === 'syncStateInvalid') return new SyncError('resync')
  if (res.status === 403 || code === 'Authorization_RequestDenied') return new SyncError('permission_missing')
  if (res.status === 401) return new SyncError('graph_401')
  return new SyncError(`graph_${res.status}`)
}

/** follow @odata.nextLink to the end of a delta round; the deltaLink to save is returned */
async function deltaRound<T>(deps: GraphDeps, token: string, start: string, parse: (j: unknown) => Page<T>, each: (items: T[]) => void): Promise<string> {
  let url: string | null = start
  for (let page = 0; url; page++) {
    if (page > 2000 || deps.left() < 5_000) throw new SyncError('deadline')
    const res = await graphGet(deps, token, url)
    if (!res.ok) throw await graphError(res)
    const p = parse(await res.json())
    each(p.items)
    if (p.delta) return p.delta
    url = p.next
  }
  throw new SyncError('delta_incomplete')
}

async function listAll<T>(deps: GraphDeps, token: string, start: string, parse: (j: unknown) => Page<T>, advanced: boolean): Promise<T[] | 'gone'> {
  const out: T[] = []
  let url: string | null = start
  for (let page = 0; url; page++) {
    if (page > 500 || deps.left() < 5_000) throw new SyncError('deadline')
    const res = await graphGet(deps, token, url, advanced)
    if (res.status === 404) {
      await res.body?.cancel()
      return 'gone'
    }
    if (!res.ok) throw await graphError(res)
    const p = parse(await res.json())
    out.push(...p.items)
    url = p.next
  }
  return out
}

/** whether a group has groups as members; a Microsoft 365 group cannot, and Graph answers the cast with 400 */
async function hasNestedGroups(deps: GraphDeps, token: string, groupId: string): Promise<boolean> {
  const res = await graphGet(deps, token, nestedCountUrl(groupId), true)
  if (res.status === 400 || res.status === 404) {
    await res.body?.cancel()
    return false
  }
  if (!res.ok) throw await graphError(res)
  return Number((await res.text()).trim()) > 0
}

// ---------------------------------------------------------------------------------------
// One organisation's run
// ---------------------------------------------------------------------------------------

export interface RunDeps extends GraphDeps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  credentials: AppCredentials | null
  phoneOf: PlanOptions['phoneOf']
  now: () => number
  uuid: () => string
  /** ids, codes and counts only */
  log: (line: Record<string, string | number | boolean | null>) => void
}

export interface RunResult {
  org: string
  ok: boolean
  error: string | null
  mode: 'full' | 'delta' | null
  counts: Record<string, number>
}

const countsOf = (data: unknown): Record<string, number> => {
  const c = (typeof data === 'object' && data !== null ? (data as Record<string, unknown>).counts : null) ?? {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(c as Record<string, unknown>)) if (/^[a-z_]{1,40}$/.test(k) && Number.isInteger(v)) out[k] = v as number
  return out
}

/** read everything again: links first (so a change made while listing is replayed next run), then each group whole */
async function readFull(deps: GraphDeps, token: string, s: SyncState, obs: Observations): Promise<{ users: string; groups: string[] }> {
  const usersLink = await deltaRound(deps, token, usersDeltaUrl(s.includePhone, true), parseUserDeltaPage, () => {})
  const groupLinks: string[] = []
  for (const u of groupsDeltaUrls(s.mappings.map((m) => m.entraGroupId), true)) groupLinks.push(await deltaRound(deps, token, u, parseGroupDeltaPage, () => {}))
  for (const m of s.mappings) await readGroupWhole(deps, token, s, m.entraGroupId, obs)
  return { users: usersLink, groups: groupLinks }
}

async function readGroupWhole(deps: GraphDeps, token: string, s: SyncState, g: string, obs: Observations): Promise<void> {
  const head = await graphGet(deps, token, groupUrl(g))
  if (head.status === 404) {
    await head.body?.cancel()
    obs.goneGroups.push(g)
    return
  }
  if (!head.ok) throw await graphError(head)
  const gj = (await head.json()) as { displayName?: unknown }
  if (typeof gj.displayName === 'string') obs.groupNames[g] = gj.displayName
  const users = await listAll(deps, token, transitiveUsersUrl(g, s.includePhone), parseUserListPage, true)
  if (users === 'gone') {
    obs.goneGroups.push(g)
    return
  }
  obs.listed[g] = users.map((u) => u.id)
  for (const u of users) obs.users[u.id] = u
  obs.nested[g] = await hasNestedGroups(deps, token, g)
}

export async function runOrg(org: string, deps: RunDeps): Promise<RunResult> {
  const begin = await deps.rpc('entra_sync_begin', { p_org: org })
  const s = begin.error ? { error: 'begin_failed' } : parseBegin(begin.data)
  if ('error' in s) {
    deps.log({ org, error: s.error, stage: 'begin' })
    return { org, ok: false, error: s.error, mode: null, counts: {} }
  }
  let mode: 'full' | 'delta' = s.full || !s.usersLink || s.groupLinks.length === 0 ? 'full' : 'delta'
  try {
    if (!deps.credentials) throw new SyncError('not_configured')
    const token = await getToken(deps.fetch, deps.credentials, s.tenantId, Math.floor(deps.now() / 1000), deps.uuid())

    let obs = emptyObservations(mode === 'full')
    let links: { users: string; groups: string[] }
    if (mode === 'delta') {
      try {
        const nestedGroups = new Set(s.mappings.filter((m) => m.nested).map((m) => m.entraGroupId))
        const mapped = new Set(s.mappings.map((m) => m.entraGroupId))
        const toList = new Set(nestedGroups)
        const users = await deltaRound(deps, token, s.usersLink!, parseUserDeltaPage, (items) => {
          for (const it of items) {
            if (it.removed) obs.removedUsers.push(it.id)
            else obs.users[it.user.id] = it.user
          }
        })
        const groups: string[] = []
        for (const link of s.groupLinks)
          groups.push(
            await deltaRound(deps, token, link, parseGroupDeltaPage, (items) => {
              for (const g of items) {
                if (!mapped.has(g.id)) continue
                if (g.removed) obs.goneGroups.push(g.id)
                if (g.displayName !== undefined) obs.groupNames[g.id] = g.displayName
                if (g.nestedChange) toList.add(g.id)
                if (toList.has(g.id)) continue
                for (const o of g.addUsers) obs.memberAdds.push([g.id, o])
                for (const o of g.removeUsers) obs.memberRemoves.push([g.id, o])
              }
            }),
          )
        // delta reports direct membership only: a group that nests is read whole, transitively, every run
        for (const g of toList) if (!obs.goneGroups.includes(g)) await readGroupWhole(deps, token, s, g, obs)
        obs.memberAdds = obs.memberAdds.filter(([g]) => !toList.has(g))
        obs.memberRemoves = obs.memberRemoves.filter(([g]) => !toList.has(g))
        links = { users, groups }
      } catch (e) {
        if (!(e instanceof SyncError) || e.code !== 'resync') throw e
        // 410 Gone or an expired token: start over with a full read
        mode = 'full'
        obs = emptyObservations(true)
        links = await readFull(deps, token, s, obs)
      }
    } else links = await readFull(deps, token, s, obs)

    // people who joined a group and whose attributes this run has not seen: read one by one
    for (const o of needsAttributes(s, obs)) {
      if (deps.left() < 5_000) throw new SyncError('deadline')
      const res = await graphGet(deps, token, userUrl(o, s.includePhone))
      if (res.status === 404) {
        await res.body?.cancel()
        obs.removedUsers.push(o)
        continue
      }
      if (!res.ok) throw await graphError(res)
      const u = parseUser(await res.json())
      if (u) obs.users[u.id] = u
    }

    const p = plan(s, obs, { phoneOf: deps.phoneOf })
    const applied = await deps.rpc('entra_sync_apply', {
      p_org: org,
      p_run: s.runId,
      p_plan: { ...p, links: { users: links.users, groups: links.groups, full: mode === 'full' } },
    })
    const ok = !applied.error && typeof applied.data === 'object' && applied.data !== null && (applied.data as { ok?: unknown }).ok === true
    if (!ok) throw new SyncError('apply_failed')
    const counts = countsOf(applied.data)
    deps.log({ org, run: s.runId, mode, ...counts, error: null })
    return { org, ok: true, error: null, mode, counts }
  } catch (e) {
    const code = e instanceof SyncError ? e.code : 'exception'
    await deps.rpc('entra_sync_fail', { p_org: org, p_run: s.runId, p_error: code })
    deps.log({ org, run: s.runId, mode, error: code })
    return { org, ok: false, error: code, mode, counts: {} }
  }
}

// ---------------------------------------------------------------------------------------
// The tenant's groups, for the picker
// ---------------------------------------------------------------------------------------

export async function searchGroups(
  deps: GraphDeps,
  cred: AppCredentials,
  tenant: string,
  q: string,
  now: () => number,
  uuid: () => string,
): Promise<{ groups: { id: string; name: string }[]; more: boolean }> {
  const token = await getToken(deps.fetch, cred, tenant, Math.floor(now() / 1000), uuid())
  const out: { id: string; name: string }[] = []
  let url: string | null = groupSearchUrl(q)
  let pages = 0
  while (url && pages < 5) {
    const res = await graphGet(deps, token, url, q.trim() !== '')
    if (!res.ok) throw await graphError(res)
    const p = parseGroupList(await res.json())
    out.push(...p.items)
    url = p.next
    pages++
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'nb'))
  return { groups: out, more: url !== null }
}

// ---------------------------------------------------------------------------------------
// The function's request handling (index.ts hands in the real clients)
// ---------------------------------------------------------------------------------------

export interface HandlerDeps extends Omit<RunDeps, 'left'> {
  /** the dispatcher's secret (ORGPULS_DISPATCH_SECRET), or '' */
  secret: string
  /** the caller's own session: the picker's role check runs as them, never as the service role */
  userRpc: (jwt: string, fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  budgetMs: number
}

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x[i]! ^ y[i]!
  return d === 0
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 *   POST                     (x-dispatch-secret) the due organisations: nightly ones, and «Synkroniser nå»
 *   POST {org_id}            (x-dispatch-secret) one organisation, as «Synkroniser nå» asks for it
 *   POST ?op=groups&org=&q=  (the daglig leder's own access token) the tenant's groups, id and name only
 */
export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== 'POST') return reply({ error: 'method' }, 405)
  const url = new URL(req.url)

  if (url.searchParams.get('op') === 'groups') {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const org = url.searchParams.get('org') ?? ''
    if (!jwt || !/^[0-9a-f-]{36}$/.test(org)) return reply({ ok: false, error: 'unauthorised' }, 403)
    // the role check is the database's, as the caller: a daglig leder of this organisation, its tenant bound
    const t = await deps.userRpc(jwt, 'entra_group_search_target', { p_org: org })
    const d = (typeof t.data === 'object' && t.data !== null ? t.data : {}) as Record<string, unknown>
    if (t.error || d.ok !== true || !isGuid(d.tenant_id)) {
      const code = typeof d.error === 'string' && /^[a-z_]{1,30}$/.test(d.error) ? d.error : 'not_allowed'
      return reply({ ok: false, error: code }, 403)
    }
    if (!deps.credentials) return reply({ ok: false, error: 'not_configured' })
    const started = deps.now()
    try {
      const r = await searchGroups(
        { ...deps, left: () => 25_000 - (deps.now() - started) },
        deps.credentials,
        d.tenant_id,
        url.searchParams.get('q') ?? '',
        deps.now,
        deps.uuid,
      )
      deps.log({ op: 'groups', org, found: r.groups.length, error: null })
      return reply({ ok: true, ...r })
    } catch (e) {
      const code = e instanceof SyncError ? e.code : 'exception'
      deps.log({ op: 'groups', org, error: code })
      return reply({ ok: false, error: code })
    }
  }

  if (!deps.secret || !same(req.headers.get('x-dispatch-secret') ?? '', deps.secret)) return reply({ error: 'unauthorised' }, 403)
  const body = (await req.json().catch(() => ({}))) as { org_id?: unknown }
  const one = typeof body.org_id === 'string' && /^[0-9a-f-]{36}$/.test(body.org_id) ? body.org_id : null
  const due = await deps.rpc('entra_sync_due', { p_org: one })
  const list = (typeof due.data === 'object' && due.data !== null ? (due.data as { orgs?: unknown }).orgs : null) ?? []
  const orgs = (Array.isArray(list) ? list : []).filter((o): o is string => typeof o === 'string' && /^[0-9a-f-]{36}$/.test(o))
  const started = deps.now()
  const left = () => deps.budgetMs - (deps.now() - started)
  const results: RunResult[] = []
  for (const org of orgs) {
    if (left() < 20_000) break // the rest stay due, and the next call takes them
    results.push(await runOrg(org, { ...deps, left }))
  }
  deps.log({ op: 'sync', due: orgs.length, ran: results.length, failed: results.filter((r) => !r.ok).length })
  return reply({ ok: true, due: orgs.length, ran: results.length, results: results.map((r) => ({ org: r.org, ok: r.ok, error: r.error, mode: r.mode })) })
}
