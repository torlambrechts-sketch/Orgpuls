import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EVENT_GROUPS, FIREWALL_RULES, HEALTH_PARTS, PII_LEVELS } from '@/lib/admin/api'
import { dotTone } from '@/lib/admin/dots'
import { GROWTH_VIEWS } from '@/lib/admin/growth'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/** Sentral › Growth › Event catalogue, built in G1 with the event stream it reads (0141, D-182). */
const PAGE = 'app/(admin)/admin/growth/events/page.tsx'
const MIGRATION = 'supabase/migrations/0141_growth_foundations.sql'

describe('the Event catalogue page', () => {
  it('asks whether the role may see Growth before it reads or renders anything', () => {
    const src = readFileSync(PAGE, 'utf8')
    const gate = src.indexOf("if (!mayOpenGrowthView(who?.role, 'growthEvents')) return <Problem")
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(src.indexOf('await growthEvents()'))
    expect(gate).toBeLessThan(src.indexOf('<PageHead'))
  })

  it('shows the firewall as computed, never a hard-coded «passing»', () => {
    const src = readFileSync(PAGE, 'utf8')
    expect(src).toMatch(/failing \? t\('growth\.events\.firewall\.failing'/)
    expect(src).not.toMatch(/CI passing/)
  })

  it('is G1’s view now, not a stub', () => {
    expect(GROWTH_VIEWS.growthEvents.phase).toBe('G1')
    expect(readFileSync(PAGE, 'utf8')).not.toMatch(/GrowthStub/)
  })
})

describe('what the page names, the database holds', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('knows every group, PII level, health component and firewall rule the migration can return', () => {
    const groups = sql.match(/event_group in \(([^)]*)\)/)![1]!.match(/'([a-z_]+)'/g)!.map((g) => g.slice(1, -1))
    expect([...EVENT_GROUPS].sort()).toEqual(groups.sort())
    const pii = sql.match(/create type app\.growth_pii as enum \(([^)]*)\)/)![1]!.match(/'([a-z_]+)'/g)!.map((g) => g.slice(1, -1))
    expect([...PII_LEVELS]).toEqual(pii)
    const parts = [...sql.matchAll(/\(\d, '([a-z_0-9]+)', \d+\)/g)].map((m) => m[1])
    expect(parts).toEqual([...HEALTH_PARTS])
    const rules = [...sql.matchAll(/rule := '([a-z_]+)'/g)].map((m) => m[1])
    expect(rules).toEqual([...FIREWALL_RULES])
  })

  it('has a message for each, in both catalogues', () => {
    for (const m of [en, no]) {
      const e = m.admin.growth.events
      for (const g of EVENT_GROUPS) expect(e.group[g], g).toBeTruthy()
      for (const p of PII_LEVELS) expect(e.pii[p], p).toBeTruthy()
      for (const h of HEALTH_PARTS) expect(e.health.part[h], h).toBeTruthy()
      for (const r of FIREWALL_RULES) expect(e.firewall.rule[r], r).toBeTruthy()
    }
  })
})

describe('the Event catalogue’s dots', () => {
  it('colours PII as the design does: none teal, company green, a person yellow', () => {
    expect(dotTone('pii', 'none')).toBe('teal')
    expect(dotTone('pii', 'org')).toBe('green')
    expect(dotTone('pii', 'user')).toBe('yellow')
  })

  it('colours a health score by the design’s bands and a firewall rule by whether it holds', () => {
    expect(dotTone('health', 'good')).toBe('teal')
    expect(dotTone('health', 'fair')).toBe('yellow')
    expect(dotTone('health', 'poor')).toBe('peach')
    expect(dotTone('firewall', 'pass')).toBe('teal')
    expect(dotTone('firewall', 'fail')).toBe('peach')
  })
})
