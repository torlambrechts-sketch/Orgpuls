import { readFileSync } from 'node:fs'
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
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

  it('words the firewall’s evidence through next-intl, never the database’s own text', () => {
    const src = readFileSync(PAGE, 'utf8')
    expect(src).toMatch(/t\(`growth\.events\.firewall\.evidence\.\$\{f\.rule\}`/)
    expect(src).not.toMatch(/\{f\.evidence\}/)
  })

  it('never lists a component with no source as a customer’s shortfall, and names it on its row', () => {
    const src = readFileSync(PAGE, 'utf8')
    expect(src).toMatch(/p\.no_source\s*\?\s*t\('growth\.events\.health\.noSource'/)
    expect(readFileSync(MIGRATION, 'utf8')).toMatch(/a\.c->>'missing' <> 'no_source'/)
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
    const parts = [...sql.matchAll(/\(\d, '([a-z_0-9]+)', \d+, (?:true|false)\)/g)].map((m) => m[1])
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
      for (const r of FIREWALL_RULES) expect(e.firewall.evidence[r], r).toBeTruthy()
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

describe('the firewall’s evidence, worded', () => {
  const t = createTranslator({ locale: 'en', messages: en as unknown as AbstractIntlMessages, namespace: 'admin.growth.events' })
  const say = (key: string, values: Record<string, string | number>) => t(key as never, values as never)

  it('reads as the design’s middle-dot line while a rule holds, and names what breaks it', () => {
    expect(say('firewall.evidence.no_link_to_respondents', { tables: 23, links: 0, names: '' })).toBe(
      '23 tables checked; no foreign key to a respondent table',
    )
    expect(say('firewall.evidence.no_link_to_respondents', { tables: 24, links: 1, names: 'crm_x.crm_x_fkey' })).toBe(
      '24 tables checked; 1 foreign key to a respondent table: crm_x.crm_x_fkey',
    )
    expect(say('firewall.evidence.no_role_reads_answers', { roles: 3, tables: 12, held: 1, names: 'service_role on responses' })).toBe(
      '3 roles × 12 answer tables; 1 privilege held: service_role on responses',
    )
    expect(say('firewall.evidence.no_employee_is_a_contact', { contacts: 1 })).toBe(
      '1 contact shares an address with an employee who is not an account',
    )
    expect(say('firewall.evidence.nothing_attached_to_answers', { tables: 13, guards: 13, other: 0, names: '' })).toBe(
      "13 tables; 13 triggers, each a table's own guard; no rule, policy, or function in a constraint, default or index",
    )
    expect(say('firewall.evidence.nothing_attached_to_answers', { tables: 13, guards: 13, other: 2, names: 'app.invitations.zz, app.answers.zz_chk' })).toBe(
      "13 tables; 13 triggers, each a table's own guard; 2 other attachments: app.invitations.zz, app.answers.zz_chk",
    )
    expect(say('firewall.evidence.growth_tables_closed', { tables: 4, open: 0, names: '' })).toBe(
      '4 tables; row level security, no policy, no client grant',
    )
  })

  it('words the page’s own separators through the catalogue: an event’s props in braces, a rule and its evidence', () => {
    expect(say('withProps', { name: 'survey.sent', props: 'recipient_count_band, measurement_kind' })).toBe(
      'survey.sent {recipient_count_band, measurement_kind}',
    )
    const line = t.rich('firewall.line' as never, { rule: 'R', evidence: 'E', mut: (c: unknown) => `[${String(c)}]` } as never)
    expect(Array.isArray(line) ? line.join('') : line).toBe('R[ · E]')
  })

  it('says the reachable maximum while a component has no source, and nothing extra when all have one', () => {
    expect(say('health.sub', { capped: 'yes', reachable: 90, unsourced: 'NPS' })).toBe(
      "0–100 per customer, from the product's own records · at most 90 while NPS has no source",
    )
    expect(say('health.sub', { capped: 'no', reachable: 100, unsourced: '' })).toBe("0–100 per customer, from the product's own records")
    expect(say('health.noSource', { part: 'NPS' })).toBe('NPS · no source yet')
  })
})
