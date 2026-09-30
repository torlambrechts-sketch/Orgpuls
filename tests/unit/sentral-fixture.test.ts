import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GROWTH_VIEWS } from '@/lib/admin/growth'
import { ALLOWED_PARAMS, assertLocalDb, CONTACTS, DEFAULT_DB, fixtureSql, psqlConnection, psqlEnv, QA_GUARD } from '../../scripts/seed/sentral-fixture.mjs'
import { assertLocalBase, judgeView, verdict } from '../../scripts/verify/sentral-judge.mjs'
import { baselineFile, pageFile, REPO, routeExists, slug, VIEW_ROUTES } from '../../scripts/verify/sentral-routes.mjs'

/** The Sentral QA fixture never runs against a hosted database, and the admin gate's route map (D-181). */
describe('the fixture’s local-only guard', () => {
  it('accepts this machine', () => {
    expect(assertLocalDb(DEFAULT_DB).hostname).toBe('127.0.0.1')
    expect(assertLocalDb('postgresql://postgres:postgres@localhost:54322/postgres').hostname).toBe('localhost')
    expect(() => assertLocalDb('postgres://u:p@127.0.0.1/db?sslmode=disable')).not.toThrow()
  })

  it('refuses a hosted project, another host, or a URL that is not one', () => {
    for (const url of [
      'postgresql://postgres.abcdefgh:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
      'postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres',
      'postgresql://postgres:pw@10.0.0.5:5432/postgres',
      'postgresql://postgres:pw@127.0.0.2:5432/postgres',
      'postgresql://postgres:pw@localhost.evil.example:5432/postgres',
      'postgresql://postgres:pw@localhost,db.example.com:5432/postgres',
      'http://127.0.0.1:54322/postgres',
      'not a url',
      '',
      undefined,
    ]) {
      expect(() => assertLocalDb(url), String(url)).toThrow(/refusing/)
    }
  })

  it('refuses a local-looking URL whose parameters would connect elsewhere or set the QA mark', () => {
    for (const p of [
      'host=db.example.com',
      'hostaddr=10.1.2.3',
      'service=prod',
      // libpq's `options` sets any setting at session start: it could forge app.environment = 'qa'
      'options=-c%20app.environment%3Dqa',
      'sslmode=disable&options=-c%20app.environment%3Dqa',
      'HOST=db.example.com',
      'dbname=postgresql://evil/x',
    ]) {
      expect(() => assertLocalDb(`postgresql://postgres:pw@127.0.0.1:54322/postgres?${p}`), p).toThrow(/refusing/)
    }
  })

  it('refuses a URL that WHATWG reads as local and libpq as remote', () => {
    // each of these passed the WHATWG parse as 127.0.0.1; psql dialled the other host
    for (const url of [
      'postgresql://127.0.0.1#@db.xyz.supabase.co/postgres',
      'postgresql://postgres:postgres@db.xyz.supabase.co,x@127.0.0.1/postgres',
      'postgresql://postgres:postgres@nonexistent-remote.invalid:5432,x@127.0.0.1:1/postgres',
      'postgresql://postgres:postgres@localhost:54322,x@127.0.0.1:1/postgres',
      'postgresql://a@b@127.0.0.1/postgres',
      'postgresql://postgres:p%40ss@127.0.0.1:54322/postgres',
      'postgresql://postgres:pw@127.0.0.1:54322/post%2Fgres',
      'postgresql://postgres:pw@127.0.0.1:54322/postgres ',
    ]) {
      expect(() => assertLocalDb(url), url).toThrow(/refusing/)
      expect(() => psqlConnection(url), url).toThrow(/refusing/)
    }
  })

  it('connects psql to the host it checked, never by handing it the URL', () => {
    const c = psqlConnection('postgresql://postgres:secret@127.0.0.1:54322/postgres?sslmode=disable&connect_timeout=5', { PATH: '/usr/bin', PGHOST: 'db.example.com', PGPASSFILE: '/root/.pgpass' })
    expect(c.args.slice(0, 8)).toEqual(['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres'])
    expect(c.args.join(' ')).not.toMatch(/postgres(ql)?:\/\//)
    expect(c.env).toEqual({ PATH: '/usr/bin', PGPASSFILE: '/dev/null', PGPASSWORD: 'secret', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '5' })
    expect(psqlConnection('postgresql://localhost/postgres', {}).args.slice(0, 8)).toEqual(['-h', 'localhost', '-p', '5432', '-U', 'postgres', '-d', 'postgres'])
    // a database or user name psql would read as a conninfo string
    for (const url of ['postgresql://postgres:pw@127.0.0.1:54322/host=db.example.com', 'postgresql://postgres:pw@127.0.0.1:54322/-h']) {
      expect(() => psqlConnection(url), url).toThrow(/refusing/)
    }
  })

  it('allows only the parameters a local run needs', () => {
    expect(ALLOWED_PARAMS).toEqual(['sslmode', 'connect_timeout'])
    expect(() => assertLocalDb('postgresql://postgres:pw@127.0.0.1:54322/postgres?sslmode=disable&connect_timeout=5')).not.toThrow()
  })

  it('hands psql no PG* variable that could override the URL', () => {
    const env = psqlEnv({ PGHOST: 'db.example.com', PGHOSTADDR: '10.1.2.3', PGSERVICE: 'prod', PATH: '/usr/bin' })
    expect(Object.keys(env)).toEqual(['PATH'])
  })

  it('refuses in SQL too, unless the database is the QA stack by its own catalog', () => {
    const sql = fixtureSql()
    const guard = sql.indexOf("current_setting('app.environment', true)")
    expect(guard).toBeGreaterThan(-1)
    // the session setting alone can come from the URL; the database's own setting cannot
    expect(QA_GUARD).toMatch(/pg_db_role_setting/)
    expect(QA_GUARD).toMatch(/'app\.environment=qa' = any\(s\.setconfig\)/)
    expect(sql).toContain(`if not (${QA_GUARD})`)
    expect(guard).toBeLessThan(sql.indexOf('insert into'))
    expect(sql.indexOf('begin;')).toBeLessThan(guard)
    expect(sql.trimEnd().endsWith('commit;')).toBe(true)
  })

  it('is idempotent: it deletes its own ids before it writes them', () => {
    const sql = fixtureSql()
    for (const t of ['crm_activities', 'crm_contacts', 'crm_companies', 'crm_suppression']) {
      expect(sql.indexOf(`delete from app.${t}`), t).toBeGreaterThan(-1)
      expect(sql.indexOf(`delete from app.${t}`), t).toBeLessThan(sql.indexOf(`insert into app.${t}`))
    }
    expect(fixtureSql()).toBe(sql)
  })

  it('writes no address a local send could deliver', () => {
    for (const c of CONTACTS) expect(c.email).toMatch(/\.example$/)
  })

  it('leaves the design fixture alone', () => {
    expect(readFileSync('scripts/seed/design-fixture.mjs', 'utf8')).not.toMatch(/sentral-fixture/)
  })
})

describe('the admin gate’s route map', () => {
  it('names each view as sentral-baseline.mjs names its render', () => {
    expect(slug('CRM', 'Brønnøysund triggers')).toBe('CRM_Bronnoysund_triggers')
    expect(slug('Content', 'Tools & lead magnets')).toBe('Content_Tools_lead_magnets')
    for (const v of VIEW_ROUTES) expect(existsSync(baselineFile(v.name)), v.name).toBe(true)
  })

  it('maps every new view and the three changed ones, each route once', () => {
    const routes = VIEW_ROUTES.map((v) => v.route)
    expect(new Set(routes).size).toBe(routes.length)
    for (const v of Object.values(GROWTH_VIEWS)) expect(routes).toContain(v.href)
    for (const r of ['/admin/crm/scoring', '/admin/crm/tasks', '/admin/crm/journeys']) expect(routes).toContain(r)
    expect(VIEW_ROUTES).toHaveLength(Object.keys(GROWTH_VIEWS).length + 3)
  })

  it('finds the page that serves a route, and skips one that is not built', () => {
    expect(pageFile('/admin/growth')).toBe('app/(admin)/admin/growth/page.tsx')
    expect(pageFile('/admin/crm/consent')).toBe('app/(admin)/admin/crm/consent/page.tsx')
    for (const v of VIEW_ROUTES) expect(routeExists(v.route), v.route).toBe(true)
    expect(routeExists('/admin/growth/not-a-page')).toBe(false)
  })

  it('resolves from the repository, not the working directory', () => {
    expect(existsSync(join(REPO, 'package.json'))).toBe(true)
    expect(baselineFile('Growth_Board').startsWith(REPO)).toBe(true)
    const cwd = process.cwd()
    try {
      process.chdir(tmpdir())
      for (const v of VIEW_ROUTES) {
        expect(routeExists(v.route), v.route).toBe(true)
        expect(existsSync(baselineFile(v.name)), v.name).toBe(true)
      }
    } finally {
      process.chdir(cwd)
    }
  })
})

describe('the admin gate’s verdict', () => {
  const claims = { Growth_Board: ['0:0', '100:0'], CRM_Consent: [] }

  it('passes when every claimed tile still matches', () => {
    const v = judgeView(claims.Growth_Board, [['0:0', 0], ['100:0', 10], ['200:0', 4000]], 10)
    expect(v).toEqual({ pass: ['0:0', '100:0'], lost: [], rows: ['200'] })
    expect(verdict({ claims, checked: ['Growth_Board'] })).toEqual({ ok: true, reasons: [] })
  })

  it('fails a lost claim', () => {
    const v = judgeView(claims.Growth_Board, [['0:0', 0], ['100:0', 11]], 10)
    expect(v.lost).toEqual(['100:0'])
    expect(verdict({ claims, checked: ['Growth_Board'], failures: ['Growth_Board lost 1 claimed tiles'] }).ok).toBe(false)
  })

  it('fails a skipped view that has claims, and not one without', () => {
    const skippedClaimed = verdict({ claims, checked: ['CRM_Consent'], skipped: [{ name: 'Growth_Board', why: 'not built' }] })
    expect(skippedClaimed.ok).toBe(false)
    expect(skippedClaimed.reasons[0]).toMatch(/Growth_Board has 2 claimed tiles but was skipped/)
    expect(verdict({ claims, checked: ['Growth_Board'], skipped: [{ name: 'CRM_Consent', why: 'not built' }] }).ok).toBe(true)
    expect(verdict({ claims, checked: ['Growth_Board'], skipped: [{ name: 'Admin_New', why: 'not built' }] }).ok).toBe(true)
  })

  it('fails a run that compared no view', () => {
    expect(verdict({ claims, checked: [] })).toEqual({ ok: false, reasons: ['no view was compared'] })
    expect(verdict({ claims: {}, checked: [], skipped: [{ name: 'CRM_Consent', why: 'not built' }] }).ok).toBe(false)
  })

  it('fails a claim no route checks', () => {
    const known = ['Growth_Board', 'CRM_Consent']
    expect(verdict({ claims, checked: ['Growth_Board'], known }).ok).toBe(true)
    const orphan = verdict({ claims: { ...claims, Growth_Old: ['0:0'] }, checked: ['Growth_Board'], known })
    expect(orphan.ok).toBe(false)
    expect(orphan.reasons[0]).toMatch(/Growth_Old has 1 claimed tiles but no route/)
  })

  it('keeps no claim for a view the route map does not name', () => {
    const recorded = JSON.parse(readFileSync(join(REPO, 'scripts', 'verify', 'sentral-claims.json'), 'utf8')) as Record<string, string[]>
    const names = new Set(VIEW_ROUTES.map((v) => v.name))
    for (const name of Object.keys(recorded)) expect(names.has(name), name).toBe(true)
    expect(verdict({ claims: recorded, checked: ['Growth_Board'], known: [...names] })).toEqual({ ok: true, reasons: [] })
  })

  it('fails on console errors', () => {
    expect(verdict({ claims, checked: ['Growth_Board'], errors: ['/admin/growth: boom'] }).ok).toBe(false)
  })

  it('only signs in to this machine', () => {
    expect(assertLocalBase('http://localhost:3400').port).toBe('3400')
    expect(() => assertLocalBase('http://127.0.0.1:3400')).not.toThrow()
    for (const url of ['https://orgpuls.no', 'http://localhost.evil.example:3400', 'http://10.0.0.5:3400', 'http://user:pw@localhost:3400', 'file:///etc/passwd', 'nope']) {
      expect(() => assertLocalBase(url), url).toThrow(/refusing/)
    }
  })
})
