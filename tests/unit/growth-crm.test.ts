import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  changedCount,
  chunks,
  foldFeed,
  GENERIC_LOCAL_PARTS,
  isGenericEmail,
  managerChangedOn,
  managerName,
  parseEntities,
  parseFeed,
  parseRoleFeed,
  toRow,
} from '../../supabase/functions/_shared/brreg'
import { autoTask } from '@/lib/admin/crm'
import { dayLabel, fmt, initials, isRecent, pct, per100, shortHash, slaState, stamp, stampAfter, strongestSignals } from '@/lib/admin/growthCrmView'
import { refFrom } from '@/lib/marketing/utm'
import { ENTITIES, g3Sql, PARTNERS, POLL_ID } from '../../scripts/seed/sentral-fixture.g3.mjs'
import { fixtureSql } from '../../scripts/seed/sentral-fixture.mjs'

/** Sentral › Growth G3 (0143, D-184): the parsing and the small calculations the pages and the edge function make. */

describe('the generic-address rule (markedsføringsloven § 15)', () => {
  it('keeps a role address and never a named one', () => {
    for (const ok of ['post@firma.no', 'Firmapost@Firma.no', ' kontakt@x.no ', 'postmottak@kommune.no', 'info@a-b.no']) expect(isGenericEmail(ok), ok).toBe(true)
    for (const no of ['ola.nordmann@firma.no', 'fornavn@firma.no', 'olan@firma.no', 'post.ola@firma.no', 'post@', 'post', '', null, undefined, 'post@firma'])
      expect(isGenericEmail(no), String(no)).toBe(false)
  })

  it('is the same list as the database’s app.brreg_generic_email', () => {
    const sql = readFileSync('supabase/migrations/0143_growth_crm.sql', 'utf8')
    const body = sql.slice(sql.indexOf('create function app.brreg_generic_email'), sql.indexOf("comment on function app.brreg_generic_email"))
    const list = [...body.matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
    expect(list).toEqual([...GENERIC_LOCAL_PARTS])
  })
})

describe('the Enhetsregisteret update feed', () => {
  const feed = {
    _embedded: {
      oppdaterteEnheter: [
        { oppdateringsid: 10, organisasjonsnummer: '931204118', endringstype: 'Endring', endringer: [{ op: 'replace', path: '/antallAnsatte', value: 6 }] },
        { oppdateringsid: 11, organisasjonsnummer: '933018442', endringstype: 'Ny' },
        { oppdateringsid: 12, organisasjonsnummer: '933018442', endringstype: 'Endring', endringer: [{ op: 'add', path: '/antallAnsatte', value: 7 }] },
        { oppdateringsid: 13, organisasjonsnummer: '921555908', endringstype: 'Fjernet' },
        { oppdateringsid: 14, organisasjonsnummer: 'x', endringstype: 'Ny' },
        { oppdateringsid: 'n', organisasjonsnummer: '925118330', endringstype: 'Ny' },
        { oppdateringsid: 15, organisasjonsnummer: '925118330', endringstype: 'Rart' },
      ],
    },
  }

  it('reads id, number, type and how the employee count changed; drops what is malformed', () => {
    const items = parseFeed(feed)
    expect(items.map((i) => [i.id, i.org, i.type, i.employeesOp])).toEqual([
      [10, '931204118', 'Endring', 'replace'],
      [11, '933018442', 'Ny', null],
      [12, '933018442', 'Endring', 'add'],
      [13, '921555908', 'Fjernet', null],
      [15, '925118330', 'Ukjent', null],
    ])
    expect(parseFeed(null)).toEqual([])
    expect(parseFeed({ _embedded: {} })).toEqual([])
  })

  it('folds per organisation: a new entity stays new, an added count stays added; counts Ny and Endring', () => {
    const m = foldFeed(parseFeed(feed))
    expect(m.get('933018442')).toEqual({ type: 'Ny', employeesOp: 'add' })
    expect(m.get('931204118')).toEqual({ type: 'Endring', employeesOp: 'replace' })
    expect(changedCount(m)).toBe(2)
  })

  it('reads a role feed of CloudEvents', () => {
    expect(parseRoleFeed([{ id: '4677263', data: { organisasjonsnummer: '938580480' } }, { id: 'x', data: {} }, 'junk'])).toEqual([{ id: 4677263, org: '938580480' }])
    expect(parseRoleFeed({})).toEqual([])
  })

  it('asks for at most 100 numbers at a time', () => {
    expect(chunks(Array.from({ length: 250 }, (_, i) => i), 100).map((c) => c.length)).toEqual([100, 100, 50])
  })
})

describe('an entity as the engine keeps it', () => {
  const as = {
    organisasjonsnummer: '919440217',
    navn: 'Barnehagene Vest AS',
    organisasjonsform: { kode: 'AS' },
    naeringskode1: { kode: '88.911' },
    antallAnsatte: 32,
    forretningsadresse: { adresse: ['Vestveien 1', ''], postnummer: '5003', poststed: 'BERGEN', kommune: 'BERGEN' },
    epostadresse: 'post@barnehagenevest.no',
    telefon: '55 00 00 00',
    registreringsdatoEnhetsregisteret: '2019-03-01',
    konkurs: false,
    underAvvikling: false,
  }

  it('keeps an organisation’s facts, its generic address and whether it is active', () => {
    expect(toRow(as, { type: 'Endring', employeesOp: 'replace' })).toEqual({
      org_number: '919440217',
      name: 'Barnehagene Vest AS',
      form_code: 'AS',
      nace_code: '88.911',
      employees: 32,
      employees_op: 'replace',
      is_new: false,
      municipality: 'BERGEN',
      address: 'Vestveien 1, 5003 BERGEN',
      phone: '55 00 00 00',
      email: 'post@barnehagenevest.no',
      registered_on: '2019-03-01',
      active: true,
    })
  })

  it('drops a named address before anything can store it', () => {
    expect(toRow({ ...as, epostadresse: 'kari.nordmann@barnehagenevest.no' }, undefined)?.email).toBeNull()
  })

  it('never keeps a sole proprietorship, or anything without a number, name or form', () => {
    expect(toRow({ ...as, organisasjonsform: { kode: 'ENK' } }, undefined)).toBeNull()
    expect(toRow({ ...as, organisasjonsnummer: '12' }, undefined)).toBeNull()
    expect(toRow({ ...as, navn: ' ' }, undefined)).toBeNull()
    expect(toRow({ ...as, organisasjonsform: {} }, undefined)).toBeNull()
  })

  it('reads none registered as 0, an unknown count as unknown, and liquidation as not active', () => {
    expect(toRow({ ...as, antallAnsatte: undefined, harRegistrertAntallAnsatte: false }, undefined)?.employees).toBe(0)
    expect(toRow({ ...as, antallAnsatte: undefined }, undefined)?.employees).toBeNull()
    expect(toRow({ ...as, underAvvikling: true }, undefined)?.active).toBe(false)
    expect(toRow({ ...as, slettedato: '2026-01-01' }, undefined)?.active).toBe(false)
    expect(toRow(as, { type: 'Ny', employeesOp: 'add' })).toMatchObject({ is_new: true, employees_op: 'add' })
  })

  it('reads a search answer’s entities', () => {
    expect(parseEntities({ _embedded: { enheter: [as] } })).toHaveLength(1)
    expect(parseEntities({ page: {} })).toEqual([])
  })
})

describe('roles: a date to detect a new manager, a name only for a call or a letter', () => {
  const roles = {
    rollegrupper: [
      { type: { kode: 'STYR' }, sistEndret: '2026-09-01', roller: [{ type: { kode: 'LEDE' }, person: { navn: { fornavn: 'Styre', etternavn: 'Leder' } } }] },
      {
        type: { kode: 'DAGL' },
        sistEndret: '2026-09-28',
        roller: [
          { type: { kode: 'DAGL' }, avregistrert: true, person: { fodselsdato: '1960-01-01', navn: { fornavn: 'Gammel', etternavn: 'Leder' } } },
          { type: { kode: 'DAGL' }, avregistrert: false, person: { fodselsdato: '1980-05-04', navn: { fornavn: 'Anne', mellomnavn: 'M.', etternavn: 'Hansen' } } },
        ],
      },
    ],
  }
  it('reads when the daglig leder group changed', () => {
    expect(managerChangedOn(roles)).toBe('2026-09-28')
    expect(managerChangedOn({ rollegrupper: [] })).toBeNull()
  })
  it('reads the current manager’s name and never the birth date', () => {
    expect(managerName(roles)).toBe('Anne M. Hansen')
    expect(JSON.stringify(managerName(roles))).not.toMatch(/1980/)
    expect(managerName({})).toBeNull()
  })
})

describe('the pages’ arithmetic', () => {
  it('groups thousands with a space and never divides by nothing', () => {
    expect(fmt(2742)).toBe('2 742')
    expect(fmt(1804)).toBe('1 804')
    expect(pct(97, 100)).toBe(97)
    expect(pct(3, 0)).toBeNull()
    expect(per100(2, 42)).toBe('4,8')
    expect(per100(3, 120)).toBe('2,5')
    expect(per100(0, 0)).toBeNull()
  })

  it('picks the strongest signals as the design does: two of intent, one of fit, then how many more', () => {
    const fit = ['industry', 'size', 'crossed', 'manager', 'active'].map((key) => ({ key, on: key !== 'manager' }))
    const intent = ['tool', 'pdf', 'pricing', 'industry_twice', 'webinar', 'hand_raise'].map((key) => ({ key, on: ['tool', 'pdf', 'pricing'].includes(key) }))
    expect(strongestSignals(fit, intent)).toEqual({ keys: ['tool', 'pdf', 'industry'], more: 3 })
    expect(strongestSignals(fit.map((f) => ({ ...f, on: f.key === 'active' })), intent.map((i) => ({ ...i, on: false })))).toEqual({ keys: [], more: 0 })
  })

  it('says the SLA in minutes up to an hour and a half, then hours; peach under 15 or over', () => {
    expect(slaState(38, null)).toEqual({ kind: 'left', h: 0, m: 38, urgent: false })
    expect(slaState(12, null)).toMatchObject({ kind: 'left', m: 12, urgent: true })
    expect(slaState(60, null)).toMatchObject({ kind: 'left', h: 0, m: 60 })
    expect(slaState(125, null)).toMatchObject({ kind: 'left', h: 2, m: 5 })
    expect(slaState(-20, null)).toMatchObject({ kind: 'over', m: 20, urgent: true })
    expect(slaState(null, true)).toEqual({ kind: 'met' })
    expect(slaState(-5, false)).toEqual({ kind: 'missed' })
    expect(slaState(null, null)).toBeNull()
  })

  it('writes days as the design does, in Oslo', () => {
    const now = new Date('2026-09-30T10:00:00Z')
    expect(stamp('2026-09-30T06:41:00Z', now)).toBe('today 08:41')
    expect(stamp('2026-09-12T07:02:00Z', now)).toBe('12 Sep 09:02')
    expect(stamp('2024-03-03T09:00:00Z', now)).toBe('3 Mar 2024 10:00')
    expect(stampAfter('2026-09-12T07:02:00Z', '2026-09-12T07:05:00Z', now)).toBe('09:05')
    expect(dayLabel('2026-09-29T10:00:00Z', { today: 'Today', yesterday: 'Yesterday' }, now)).toBe('Yesterday')
    expect(dayLabel('2026-09-03T10:00:00Z', { today: 'Today', yesterday: 'Yesterday' }, now)).toBe('3 Sep 2026')
    expect(isRecent('2026-09-30T03:10:00Z', now)).toBe(true)
    expect(isRecent('2026-09-27T03:10:00Z', now)).toBe(false)
    expect(shortHash('a91f', '3c')).toBe('a91f…3c')
    expect(initials('Silje Moen')).toBe('SM')
  })

  it('knows a rule’s task by its key, and nothing else', () => {
    expect(autoTask('auto:callback_hand_raise')).toBe('callback_hand_raise')
    expect(autoTask('auto:outreach_letter')).toBe('outreach_letter')
    expect(autoTask('auto:something_else')).toBeNull()
    expect(autoTask('Call Silje')).toBeNull()
  })
})

describe('the referral code from the address', () => {
  it('upper-cases a code and refuses anything that is not one', () => {
    expect(refFrom('?ref=regnvest')).toBe('REGNVEST')
    expect(refFrom('?utm_source=x&ref=%20pbl%20')).toBe('PBL')
    expect(refFrom('?ref=a')).toBeUndefined()
    expect(refFrom('?ref=<script>')).toBeUndefined()
    expect(refFrom('?ref=' + 'x'.repeat(21))).toBeUndefined()
    expect(refFrom('')).toBeUndefined()
  })
})

describe('the QA fixture’s G3 rows', () => {
  it('is registered in the fixture’s transaction, after its own rows and before the commit', () => {
    const sql = fixtureSql()
    const at = sql.indexOf('-- ---------------------------------------------------------------- G3')
    expect(at).toBeGreaterThan(sql.indexOf('insert into app.crm_suppression'))
    expect(at).toBeLessThan(sql.lastIndexOf('commit;'))
    expect(sql.indexOf('raise exception \'sentral-fixture: this database is not marked')).toBeLessThan(at)
  })

  it('deletes its own rows before it writes them, and writes the same SQL every time', () => {
    const helpers = { id: (n: string) => createHash('md5').update(n).digest('hex').replace(/^(.{8})(.{4}).(.{3}).(.{3})(.{12}).*$/, '$1-$2-4$3-8$4-$5'), q: (v: unknown) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`), today: (t: string) => `'${t}'`, company: (k: string) => `'${k}'`, contact: (k: string) => `'${k}'`, task: (k: string) => `'${k}'` }
    const sql = g3Sql(helpers)
    for (const t of ['brreg_entities', 'brreg_polls', 'partners', 'demo_requests']) expect(sql.indexOf(`delete from app.${t}`), t).toBeLessThan(sql.indexOf(`insert into app.${t}`))
    expect(g3Sql(helpers)).toBe(sql)
    expect(sql).toContain(`id = ${POLL_ID}`)
  })

  it('raises its triggers through the engine, never writing a status or a holdout itself', () => {
    const sql = g3Sql({ id: String, q: (v: unknown) => `'${v}'`, today: String, company: String, contact: String, task: String })
    expect(sql).not.toMatch(/insert into app\.brreg_(triggers|outreach)/)
    expect((sql.match(/select app\.brreg_raise\(/g) ?? []).length).toBe(ENTITIES.length)
  })

  it('uses organisation numbers no real undertaking holds, and addresses no send can reach', () => {
    const mod11 = (n: string) => {
      const w = [3, 2, 7, 6, 5, 4, 3, 2]
      const r = 11 - (w.reduce((s, x, i) => s + x * Number(n[i]), 0) % 11)
      return (r === 11 ? 0 : r) === Number(n[8])
    }
    for (const e of ENTITIES) expect(mod11(e[2] as string), e[2] as string).toBe(false)
    for (const e of ENTITIES) if (e[9]) expect(e[9]).toMatch(/\.example$/)
    expect(PARTNERS.map((p) => p[4]).filter(Boolean).every((c) => /^[A-Z0-9]{2,20}$/.test(c as string))).toBe(true)
  })
})
