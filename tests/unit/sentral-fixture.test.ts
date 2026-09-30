import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GROWTH_VIEWS } from '@/lib/admin/growth'
import { assertLocalDb, CONTACTS, DEFAULT_DB, fixtureSql, psqlEnv } from '../../scripts/seed/sentral-fixture.mjs'
import { baselineFile, pageFile, routeExists, slug, VIEW_ROUTES } from '../../scripts/verify/sentral-routes.mjs'

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

  it('refuses a local-looking URL whose parameters would connect elsewhere', () => {
    for (const p of ['host=db.example.com', 'hostaddr=10.1.2.3', 'service=prod']) {
      expect(() => assertLocalDb(`postgresql://postgres:pw@127.0.0.1:54322/postgres?${p}`)).toThrow(/refusing/)
    }
  })

  it('hands psql no PG* variable that could override the URL', () => {
    const env = psqlEnv({ PGHOST: 'db.example.com', PGHOSTADDR: '10.1.2.3', PGSERVICE: 'prod', PATH: '/usr/bin' })
    expect(Object.keys(env)).toEqual(['PATH'])
  })

  it('refuses in SQL too, unless the database is the QA stack', () => {
    const sql = fixtureSql()
    const guard = sql.indexOf("current_setting('app.environment', true)")
    expect(guard).toBeGreaterThan(-1)
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
})
