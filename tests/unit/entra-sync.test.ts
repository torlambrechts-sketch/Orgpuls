import { describe, expect, it } from 'vitest'
import {
  cleanName,
  emptyObservations,
  groupsDeltaUrls,
  mailboxOf,
  mapLanguage,
  needsAttributes,
  parseBegin,
  parseGroupDeltaPage,
  parseUserDeltaPage,
  plan,
  usersDeltaUrl,
  transitiveUsersUrl,
  type GraphUser,
  type Observations,
  type SyncState,
} from '@/supabase/functions/_shared/entra'
import { normalizePhone } from '@/supabase/functions/_shared/sms'

/**
 * The Entra import's planner (D-202): given the register, the mapping, the membership mirror and
 * what Graph said this run, the exact writes. The database re-checks every rule
 * (supabase/tests/entra_import_invariants.sql); these prove the computation.
 */

const G1 = '0000000a-0000-4000-8000-000000000001' // Drift, ranked first
const G2 = '0000000a-0000-4000-8000-000000000002' // Prosjekt
const DRIFT = '1111111a-0000-4000-8000-000000000001'
const PROSJEKT = '1111111a-0000-4000-8000-000000000002'
const oid = (n: number) => `0000000b-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n: number) => `2222222e-0000-4000-8000-${String(n).padStart(12, '0')}`

function state(over: Partial<SyncState> = {}): SyncState {
  return {
    orgId: '3333333c-0000-4000-8000-000000000001',
    runId: '4444444d-0000-4000-8000-000000000001',
    tenantId: '5555555f-0000-4000-8000-000000000001',
    includePhone: false,
    roundOpen: false,
    full: true,
    usersLink: null,
    groupLinks: [],
    mappings: [
      { entraGroupId: G1, groupId: DRIFT, priority: 0, nested: false, entraName: 'Drift' },
      { entraGroupId: G2, groupId: PROSJEKT, priority: 1, nested: false, entraName: 'Prosjekt' },
    ],
    members: [],
    employees: [],
    deferred: [],
    ...over,
  }
}

const user = (n: number, over: Partial<GraphUser> = {}): GraphUser => ({
  id: oid(n),
  displayName: `Person ${n}`,
  mail: `person${n}@firma.no`,
  userPrincipalName: `person${n}@firma.no`,
  accountEnabled: true,
  preferredLanguage: null,
  userType: 'Member',
  ...over,
})

function full(listed: Record<string, GraphUser[]>): Observations {
  const obs = emptyObservations(true)
  for (const [g, us] of Object.entries(listed)) {
    obs.listed[g] = us.map((u) => u.id)
    for (const u of us) obs.users[u.id] = u
  }
  return obs
}

const opts = { phoneOf: normalizePhone }

describe('mapping a directory person', () => {
  it('maps preferredLanguage onto the survey languages and leaves the rest alone', () => {
    expect(mapLanguage('nb-NO')).toBe('no')
    expect(mapLanguage('nn-NO')).toBe('no')
    expect(mapLanguage('en-US')).toBe('en')
    expect(mapLanguage('pl-PL')).toBe('pl')
    expect(mapLanguage('uk-UA')).toBe('uk')
    expect(mapLanguage('lt')).toBe('lt')
    expect(mapLanguage('sv-SE')).toBe('sv')
    expect(mapLanguage('da-DK')).toBe('da')
    expect(mapLanguage('de-DE')).toBeNull()
    expect(mapLanguage(null)).toBeNull()
  })

  it('takes mail, and the UPN only when it is a mailbox', () => {
    expect(mailboxOf({ mail: 'kari@firma.no', userPrincipalName: 'kari@firma.onmicrosoft.com' })).toBe('kari@firma.no')
    expect(mailboxOf({ mail: null, userPrincipalName: 'kari@firma.no' })).toBe('kari@firma.no')
    expect(mailboxOf({ mail: null, userPrincipalName: 'kari@firma.onmicrosoft.com' })).toBeNull()
    expect(mailboxOf({ mail: null, userPrincipalName: 'kari_gmail.com#EXT#@firma.no' })).toBeNull()
    expect(mailboxOf({ mail: 'ikke en adresse', userPrincipalName: null })).toBeNull()
  })

  it('keeps a name on one line, at most 120 characters', () => {
    expect(cleanName('  Kari \n Nordmann ')).toBe('Kari Nordmann')
    expect(cleanName('x'.repeat(200))).toHaveLength(120)
    expect(cleanName('   ')).toBeNull()
  })
})

describe('the Graph requests', () => {
  it('asks for the agreed fields only, mobilePhone only with the opt-in', () => {
    expect(usersDeltaUrl(false, false)).toBe(
      'https://graph.microsoft.com/v1.0/users/delta?$select=id,displayName,mail,userPrincipalName,accountEnabled,preferredLanguage,userType',
    )
    expect(usersDeltaUrl(true, true)).toContain(',mobilePhone&$deltatoken=latest')
    for (const u of [usersDeltaUrl(true, false), transitiveUsersUrl(G1, true)])
      expect(u).not.toMatch(/manager|jobTitle|employeeId|officeLocation|photo/)
  })

  it('filters groups/delta by id, at most 50 to a request', () => {
    const ids = Array.from({ length: 120 }, (_, i) => `0000000a-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const urls = groupsDeltaUrls(ids, false)
    expect(urls).toHaveLength(3)
    expect(decodeURIComponent(urls[0]!).match(/id eq '/g)).toHaveLength(50)
    expect(decodeURIComponent(urls[2]!).match(/id eq '/g)).toHaveLength(20)
    expect(groupsDeltaUrls(["x' or 1 eq 1"], false)).toHaveLength(0)
  })

  it('reads @removed users and members, and notices a nested group', () => {
    const users = parseUserDeltaPage({
      value: [{ id: oid(1), displayName: 'A', jobTitle: 'sjef' }, { id: oid(2), '@removed': { reason: 'deleted' } }],
      '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users/delta?$skiptoken=a',
    })
    expect(users.items).toEqual([{ user: { id: oid(1), displayName: 'A' }, removed: false }, { id: oid(2), removed: true }])
    expect(users.next).toContain('$skiptoken=a')
    const groups = parseGroupDeltaPage({
      value: [
        {
          id: G1,
          displayName: 'Drift',
          'members@delta': [
            { '@odata.type': '#microsoft.graph.user', id: oid(1) },
            { '@odata.type': '#microsoft.graph.user', id: oid(2), '@removed': { reason: 'deleted' } },
            { '@odata.type': '#microsoft.graph.group', id: G2 },
          ],
        },
      ],
      '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=z',
      // a link off Graph is never followed with a token
      '@odata.nextLink': 'https://evil.example/steal',
    })
    expect(groups.items[0]).toMatchObject({ addUsers: [oid(1)], removeUsers: [oid(2)], nestedChange: true })
    expect(groups.next).toBeNull()
    expect(groups.delta).toContain('$deltatoken=z')
  })
})

describe('the planner', () => {
  it('first run: matches the CSV-imported person by e-mail in any case, and adds the others', () => {
    const s = state({
      employees: [
        { id: eid(1), objectId: null, email: 'Person1@Firma.no', fullName: 'Person 1', groupId: DRIFT, active: true, pinned: false, language: null, phone: null },
      ],
    })
    const p = plan(s, full({ [G1]: [user(1), user(2)] }), opts)
    expect(p.people).toEqual([
      { objectId: oid(1), op: 'link', employeeId: eid(1), email: 'person1@firma.no' },
      { objectId: oid(2), op: 'add', fullName: 'Person 2', email: 'person2@firma.no' },
    ])
    expect(p.predicted).toMatchObject({ added: 1, linked: 1 })
    expect(p.place).toEqual([oid(1)])
    expect(p.members.replace[G1]).toEqual([oid(1), oid(2)])
  })

  it('never makes a second person: an address held by a linked person or two unlinked people is skipped', () => {
    const s = state({
      employees: [
        { id: eid(1), objectId: oid(9), email: 'person1@firma.no', fullName: 'X', groupId: DRIFT, active: true, pinned: false, language: null, phone: null },
        { id: eid(2), objectId: null, email: 'person2@firma.no', fullName: 'Y', groupId: null, active: true, pinned: false, language: null, phone: null },
        { id: eid(3), objectId: null, email: 'PERSON2@firma.no', fullName: 'Z', groupId: null, active: true, pinned: false, language: null, phone: null },
      ],
    })
    const p = plan(s, full({ [G1]: [user(1), user(2), user(9, { mail: 'p9@firma.no' })] }), opts)
    expect(p.people.filter((w) => w.op !== 'update')).toEqual([])
    expect(p.skips.set).toEqual([
      { objectId: oid(1), reason: 'email_taken' },
      { objectId: oid(2), reason: 'email_ambiguous' },
    ])
  })

  it('a disabled account is not added, and a synced one is deactivated', () => {
    const s = state({
      employees: [{ id: eid(1), objectId: oid(1), email: 'person1@firma.no', fullName: 'Person 1', groupId: DRIFT, active: true, pinned: false, language: null, phone: null }],
    })
    const p = plan(s, full({ [G1]: [user(1, { accountEnabled: false }), user(2, { accountEnabled: false })] }), opts)
    expect(p.deactivate).toEqual([{ objectId: oid(1), reason: 'disabled' }])
    expect(p.skips.set).toEqual([{ objectId: oid(2), reason: 'disabled' }])
    expect(p.people).toEqual([])
  })

  it('a user removed from the directory (@removed) is deactivated, never deleted', () => {
    const s = state({
      full: false,
      members: [[G1, oid(1)]],
      employees: [{ id: eid(1), objectId: oid(1), email: 'person1@firma.no', fullName: 'Person 1', groupId: DRIFT, active: true, pinned: false, language: null, phone: null }],
    })
    const obs = emptyObservations(false)
    obs.removedUsers.push(oid(1))
    const p = plan(s, obs, opts)
    expect(p.deactivate).toEqual([{ objectId: oid(1), reason: 'removed' }])
    expect(p.removedUsers).toEqual([oid(1)])
    expect(p.people).toEqual([])
  })

  it('someone who leaves every selected group is deactivated', () => {
    const s = state({
      full: false,
      members: [[G1, oid(1)]],
      employees: [{ id: eid(1), objectId: oid(1), email: 'person1@firma.no', fullName: 'Person 1', groupId: DRIFT, active: true, pinned: false, language: null, phone: null }],
    })
    const obs = emptyObservations(false)
    obs.memberRemoves.push([G1, oid(1)])
    const p = plan(s, obs, opts)
    expect(p.deactivate).toEqual([{ objectId: oid(1), reason: 'left_groups' }])
    expect(p.members.remove).toEqual([[G1, oid(1)]])
  })

  it('in a full run, a synced person in no listing is deactivated', () => {
    const s = state({
      employees: [{ id: eid(1), objectId: oid(1), email: 'person1@firma.no', fullName: 'Person 1', groupId: DRIFT, active: true, pinned: false, language: null, phone: null }],
    })
    const p = plan(s, full({ [G1]: [user(2)] }), opts)
    expect(p.deactivate).toEqual([{ objectId: oid(1), reason: 'left_groups' }])
  })

  it('a group move while a round is open is placed for the database to defer', () => {
    const s = state({
      full: false,
      roundOpen: true,
      members: [[G1, oid(1)]],
      employees: [{ id: eid(1), objectId: oid(1), email: 'person1@firma.no', fullName: 'Person 1', groupId: DRIFT, active: true, pinned: false, language: null, phone: null }],
    })
    const obs = emptyObservations(false)
    obs.memberRemoves.push([G1, oid(1)])
    obs.memberAdds.push([G2, oid(1)])
    obs.users[oid(1)] = user(1)
    const p = plan(s, obs, opts)
    expect(p.place).toEqual([oid(1)])
    expect(p.predicted).toMatchObject({ deferred: 1, moved: 0 })
    expect(p.deactivate).toEqual([])
  })

  it('a deferred move is placed again once no round is open, even when nothing else changed', () => {
    const s = state({
      full: false,
      roundOpen: false,
      members: [[G2, oid(1)]],
      employees: [{ id: eid(1), objectId: oid(1), email: 'person1@firma.no', fullName: 'Person 1', groupId: DRIFT, active: true, pinned: false, language: null, phone: null }],
      deferred: [{ employeeId: eid(1), groupId: PROSJEKT }],
    })
    const p = plan(s, emptyObservations(false), opts)
    expect(p.place).toEqual([oid(1)])
    expect(p.predicted.moved).toBe(1)
  })

  it('a person in two selected groups gets the one ranked first, and the conflict is reported', () => {
    const p = plan(state(), full({ [G2]: [user(1)], [G1]: [user(1)] }), opts)
    expect(p.people).toHaveLength(1)
    expect(p.conflicts).toEqual([{ objectId: oid(1), employeeId: null, groupIds: [DRIFT, PROSJEKT], chosen: DRIFT }])
    // the order is the daglig leder's: reversed priority, reversed result
    const s = state()
    s.mappings[0]!.priority = 5
    expect(plan(s, full({ [G1]: [user(1)], [G2]: [user(1)] }), opts).conflicts[0]!.chosen).toBe(PROSJEKT)
  })

  it('guests are left out by default', () => {
    const p = plan(state(), full({ [G1]: [user(1, { userType: 'Guest' })] }), opts)
    expect(p.people).toEqual([])
    expect(p.skips.set).toEqual([{ objectId: oid(1), reason: 'guest' }])
  })

  it('a UPN that is not a mailbox is skipped with a reason; the person is not guessed at', () => {
    const p = plan(state(), full({ [G1]: [user(1, { mail: null, userPrincipalName: 'person1@firma.onmicrosoft.com' }), user(2, { mail: null })] }), opts)
    expect(p.skips.set).toEqual([{ objectId: oid(1), reason: 'no_mailbox' }])
    expect(p.people).toEqual([{ objectId: oid(2), op: 'add', fullName: 'Person 2', email: 'person2@firma.no' }])
  })

  it('takes the mobile number only with the opt-in, normalised, and drops one that is not a number', () => {
    const us = [user(1, { mobilePhone: '+47 912 34 567' }), user(2, { mobilePhone: '22 33 44 55' })]
    expect(plan(state(), full({ [G1]: us }), opts).people.map((w) => w.phone)).toEqual([undefined, undefined])
    const p = plan(state({ includePhone: true }), full({ [G1]: us }), opts)
    expect(p.people.map((w) => w.phone)).toEqual(['+4791234567', undefined])
    expect(p.people).toHaveLength(2) // the person stays without the number
  })

  it('maps preferredLanguage onto the person, and leaves an unsupported one as it is', () => {
    const s = state({
      employees: [{ id: eid(1), objectId: oid(1), email: 'person1@firma.no', fullName: 'Person 1', groupId: DRIFT, active: true, pinned: false, language: 'pl', phone: null }],
    })
    const p = plan(s, full({ [G1]: [user(1, { preferredLanguage: 'de-DE' }), user(2, { preferredLanguage: 'uk-UA' })] }), opts)
    expect(p.people).toEqual([{ objectId: oid(2), op: 'add', fullName: 'Person 2', email: 'person2@firma.no', language: 'uk' }])
  })

  it("updates a synced person's name and address from the directory, but not onto someone else's address", () => {
    const s = state({
      employees: [
        { id: eid(1), objectId: oid(1), email: 'person1@firma.no', fullName: 'Gammelt Navn', groupId: DRIFT, active: true, pinned: false, language: null, phone: null },
        { id: eid(2), objectId: null, email: 'opptatt@firma.no', fullName: 'Y', groupId: null, active: true, pinned: false, language: null, phone: null },
      ],
    })
    const p = plan(s, full({ [G1]: [user(1, { mail: 'opptatt@firma.no' })] }), opts)
    expect(p.people).toEqual([{ objectId: oid(1), op: 'update', employeeId: eid(1), fullName: 'Person 1' }])
    expect(p.skips.set).toEqual([{ objectId: oid(1), reason: 'email_taken' }])
  })

  it('a pinned group is not predicted to move', () => {
    const s = state({
      employees: [{ id: eid(1), objectId: oid(1), email: 'person1@firma.no', fullName: 'Person 1', groupId: PROSJEKT, active: true, pinned: true, language: null, phone: null }],
    })
    const p = plan(s, full({ [G1]: [user(1)] }), opts)
    expect(p.predicted.moved).toBe(0)
    expect(p.place).toEqual([oid(1)])
  })

  it('a nested group read whole replaces its mirror; a group gone from the directory empties it', () => {
    const s = state({ full: false, members: [[G1, oid(1)], [G2, oid(3)]] })
    const obs = emptyObservations(false)
    obs.listed[G1] = [oid(2)]
    obs.users[oid(2)] = user(2)
    obs.nested[G1] = true
    obs.goneGroups.push(G2)
    const p = plan(s, obs, opts)
    expect(p.members.replace).toEqual({ [G1]: [oid(2)], [G2]: [] })
    expect(p.groups).toEqual([{ id: G1, nested: true }, { id: G2, gone: true }])
    expect(p.people.map((w) => w.objectId)).toEqual([oid(2)])
  })

  it('a renamed group is reported by its new name', () => {
    const obs = full({ [G1]: [] })
    obs.groupNames[G1] = 'Drift Nord'
    obs.groupNames[G2] = 'Prosjekt'
    expect(plan(state(), obs, opts).groups).toEqual([{ id: G1, name: 'Drift Nord' }])
  })

  it('asks Graph for the attributes of people who joined a group and are not known this run', () => {
    const s = state({ full: false, members: [[G1, oid(1)]] })
    const obs = emptyObservations(false)
    obs.memberAdds.push([G1, oid(2)], [G2, oid(3)])
    obs.users[oid(3)] = user(3)
    expect(needsAttributes(s, obs)).toEqual([oid(2)])
  })

  it('an inactive synced person comes back on attributes read this run', () => {
    const s = state({
      full: false,
      employees: [{ id: eid(1), objectId: oid(1), email: 'person1@firma.no', fullName: 'Person 1', groupId: DRIFT, active: false, pinned: false, language: null, phone: null }],
    })
    const obs = emptyObservations(false)
    obs.memberAdds.push([G1, oid(1)])
    obs.users[oid(1)] = user(1)
    expect(plan(s, obs, opts).people).toEqual([{ objectId: oid(1), op: 'update', employeeId: eid(1), activate: true }])
  })
})

describe("the database's state", () => {
  it('is parsed, not cast: a bad reply is a refusal', () => {
    expect(parseBegin(null)).toEqual({ error: 'begin_failed' })
    expect(parseBegin({ ok: false, error: 'busy' })).toEqual({ error: 'busy' })
    expect(parseBegin({ ok: true, org_id: 'x' })).toEqual({ error: 'begin_failed' })
    const s = parseBegin({
      ok: true,
      org_id: '3333333c-0000-4000-8000-000000000001',
      run_id: '4444444d-0000-4000-8000-000000000001',
      tenant_id: '5555555f-0000-4000-8000-000000000001',
      users_link: 'https://evil.example/x',
      group_links: ['https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=a'],
      members: [[G1, oid(1)], ['bad', oid(2)]],
      mappings: [{ entra_group_id: G1, group_id: DRIFT, priority: 0 }],
    })
    expect(s).toMatchObject({ usersLink: null, groupLinks: ['https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=a'], members: [[G1, oid(1)]] })
  })
})
