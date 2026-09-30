import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { csvCell } from '@/lib/admin/audit'
import { growthCsv } from '@/lib/admin/growthCsv'
import {
  BoardItem,
  COVERAGE_STATUSES,
  EXPERIMENT_STATUSES,
  EXPORT_SCHEMA,
  GrowthBoard,
  GrowthFunnel,
  ITEM_STATUSES,
  LIKELIHOODS,
  PLAN_STATUSES,
  PRIORITIES,
  STREAMS,
} from '@/lib/admin/growthData'
import { countBy, funnelRows, ice, icePct, initialsOf, leadMath, mayFollow, pctText, planWeek, sectionOfHref } from '@/lib/admin/growthMath'
import { dotTone } from '@/lib/admin/dots'
import en from '@/messages/en.json'

/** Sentral › Growth G2 (0142, D-183): the arithmetic, the parsing and the honesty rules the pages keep. */
const MIGRATION = readFileSync('supabase/migrations/0142_growth_registry.sql', 'utf8')
const tg = createTranslator({ locale: 'en', messages: en as unknown as AbstractIntlMessages, namespace: 'admin.growth.g2' })
/** messages are untyped here (D-132): keys built at runtime, as the pages build them */
const t = (key: string, values?: Record<string, string | number>) => tg(key as never, values as never)
const stage = (key: string, n: number | null) => ({ key, stage: key, event: key, definition: key, n })

describe('the funnel', () => {
  it('prints each stage against the visitors and the stage before, as the design does', () => {
    const rows = funnelRows([stage('visitors', 4100), stage('signup', 123), stage('setup', 88), stage('pql', 24), stage('expansion', 2)])
    expect(rows.map((r) => r.pct)).toEqual(['100', '3', '2', '0,6', '0,0'])
    expect(rows.map((r) => r.step)).toEqual([null, 3, 72, 27, 8])
    // the design's floor of 1,5 % for a stage that has any, never over 100
    expect(rows[0]!.bar).toBe(100)
    expect(rows[4]!.bar).toBe(1.5)
  })

  it('never divides by nothing: zero visitors or a stage with no source give no percentage and no bar', () => {
    const rows = funnelRows([stage('visitors', 0), stage('signup', 2), stage('pql', null), stage('paid', 0)])
    expect(rows.map((r) => r.pct)).toEqual([null, null, null, null])
    expect(rows.map((r) => r.bar)).toEqual([0, 0, 0, 0])
    // the step after a stage with no count, and the step of a stage with none, are unknown
    expect(rows.map((r) => r.step)).toEqual([null, null, null, null])
    expect(pctText(0.62)).toBe('0,6')
    expect(pctText(12.5)).toBe('13')
  })
})

describe('the lead math', () => {
  const src = (key: string, now: number | null, base: number, stretch: number) => ({ key, source: key, base, stretch, needs: '', now })

  it('caps «now» at 100 % of base and totals the known sources only', () => {
    const lm = leadMath([src('seo', 12, 45, 110), src('ads', 9, 5, 15), src('loop', null, 20, 50)])
    expect(lm.rows.map((r) => r.nowPct)).toEqual([27, 100, null])
    expect(lm).toMatchObject({ now: 21, base: 70, stretch: 175 })
  })

  it('has no «now» at all when no source can be counted — never a 0 over an unknown', () => {
    expect(leadMath([src('loop', null, 20, 50), src('partners', null, 15, 40)]).now).toBeNull()
  })

  it('the seeded base and stretch add up to the report’s 120 and 300, and three sources have no channel', () => {
    const block = MIGRATION.slice(MIGRATION.indexOf('insert into app.growth_lead_sources'), MIGRATION.indexOf('insert into app.growth_assumptions'))
    const rows = [...block.matchAll(/\('(\w+)', \d+, '[^']+', (\d+), (\d+), '[^']+', '\{([a-z,]*)\}'\)/g)]
    expect(rows).toHaveLength(6)
    expect(rows.reduce((a, r) => a + Number(r[2]), 0)).toBe(120)
    expect(rows.reduce((a, r) => a + Number(r[3]), 0)).toBe(300)
    expect(rows.filter((r) => r[4] === '').map((r) => r[1])).toEqual(['loop', 'partners', 'brreg'])
  })
})

describe('the plan’s week, ICE and the KPI counts', () => {
  it('says «not started» without a start date or before it, never an invented week', () => {
    expect(planWeek(null, 13)).toEqual({ kind: 'not_started' })
    expect(planWeek(0, 13)).toEqual({ kind: 'not_started' })
    expect(planWeek(4, 13)).toEqual({ kind: 'week', week: 4, weeks: 13 })
    expect(planWeek(14, 13)).toEqual({ kind: 'finished', weeks: 13 })
  })

  it('ICE is impact × confidence × ease out of 125', () => {
    expect(ice({ impact: 5, confidence: 5, ease: 4 })).toBe(100)
    expect(icePct({ impact: 3, confidence: 3, ease: 3 })).toBe(22)
  })

  it('counts every status, naming the ones no row holds', () => {
    expect(countBy([{ status: 'live' }, { status: 'planned' }, { status: 'planned' }], ITEM_STATUSES)).toEqual({ live: 1, building: 0, planned: 2, deferred: 0 })
  })

  it('an owner’s initials come from the admin’s address', () => {
    expect(initialsOf('tor.lambrechts@example.com')).toBe('TL')
    expect(initialsOf('admin.local@orgpuls.test')).toBe('AL')
  })
})

describe('links the pages offer', () => {
  it('know the section of each admin address, the Growth views’ own first', () => {
    expect(sectionOfHref('/admin/cms/magnets')).toBe('growth')
    expect(sectionOfHref('/admin/deliverability')).toBe('growth')
    expect(sectionOfHref('/admin/crm/consent')).toBe('crm')
    expect(sectionOfHref('/admin/web/goals')).toBe('web')
    expect(sectionOfHref('/admin/legal')).toBe('legal')
  })

  it('are offered only where the role may open the page', () => {
    expect(mayFollow('analyst', '/admin/legal')).toBe(false)
    expect(mayFollow('analyst', '/admin/orgs')).toBe(false)
    expect(mayFollow('marketing', '/admin/crm/consent')).toBe(true)
    expect(mayFollow('super_admin', '/admin/legal')).toBe(true)
    expect(mayFollow('marketing', null)).toBe(false)
  })

  it('every address the registry seeds is a page that exists', () => {
    const hrefs = [...new Set([...MIGRATION.matchAll(/'(\/admin(?:\/[a-z0-9_-]+)*)'/g)].map((m) => m[1]!))]
    expect(hrefs.length).toBeGreaterThan(15)
    for (const h of hrefs) expect(existsSync(join('app/(admin)', h, 'page.tsx')), h).toBe(true)
  })
})

describe('parsing', () => {
  const item = {
    key: 'consent',
    tier: 't0',
    rank: 'Review 1 · #1',
    name: 'n',
    why: 'w',
    build: 'b',
    kpi: 'k',
    guardrail: 'g',
    effort: 'M',
    impact: '2 weeks',
    score: null,
    status: 'live',
    stored: 'building',
    live_check: 'consent_ledger',
    href: '/admin/crm/consent',
    owner: null,
  }

  it('parses a board payload and refuses a stored «live» or an address outside the admin', () => {
    const board = { tiers: [{ key: 't0', name: 'Tier 0', why: 'w' }], items: [item], admins: [], plan: { start: null, week: null, weeks: 13, gate: null } }
    expect(GrowthBoard.safeParse(board).success).toBe(true)
    expect(BoardItem.safeParse({ ...item, stored: 'live' }).success).toBe(false)
    expect(BoardItem.safeParse({ ...item, href: 'https://example.com' }).success).toBe(false)
  })

  it('keeps a stage with no source and a source with no channel as null, never 0', () => {
    const f = GrowthFunnel.parse({
      month: '2026-09-01',
      stages: [{ key: 'pql', stage: 'PQL', event: 'flag', definition: 'd', n: null }],
      lead: [{ key: 'loop', source: 's', base: 20, stretch: 50, needs: 'n', now: null }],
      assumptions: [],
      benchmarks: [],
    })
    expect(f.stages[0]!.n).toBeNull()
    expect(f.lead[0]!.now).toBeNull()
  })
})

describe('the CSV exports', () => {
  it('write the derived status and the owner’s address, with headers from the messages', () => {
    const data = EXPORT_SCHEMA.board.parse({ rows: [{ ...{ key: 'consent', tier: 't0', rank: 'r', name: '=HYPERLINK()', why: 'w', build: 'b', kpi: 'k', guardrail: 'g', effort: 'M', impact: 'i', score: null, status: 'live', stored: 'building', live_check: 'consent_ledger', href: null, owner: { id: '00000000-0000-4000-8000-000000000001', email: 'a@b.test' } }, tier_name: 'Tier 0' }] })
    const rows = growthCsv('board', data, (k, v) => t(k, v))
    expect(rows[0]!.slice(0, 5)).toEqual(['Tier', 'Rank', 'Item', 'Why', 'Status'])
    expect(rows[1]![4]).toBe('Live')
    expect(rows[1]![5]).toBe('a@b.test')
    // no cell starts a spreadsheet formula
    expect(csvCell(rows[1]![2])).toBe(`"'=HYPERLINK()"`)
  })

  it('the plan’s gates are one cell and the review keeps its three sections in order', () => {
    const plan = growthCsv('plan', { rows: [{ from: 1, to: 2, foundation: 'f', lead: 'l', status: 'planned', gates: ['a', 'b'] }] }, (k, v) => t(k, v))
    expect(plan[1]).toEqual(['1–2', 'Planned', 'f', 'l', 'a | b'])
    const review = growthCsv(
      'review',
      { coverage: [{ feature: 'x', status: 'partial', note: '', href: null }], recommendations: [{ n: 1, priority: 'now', title: 'r', body: 'b' }], cuts: ['c'] },
      (k, v) => t(k, v),
    )
    expect(review.slice(1).map((r) => r[0])).toEqual(['Coverage', 'Recommended next', 'Cut or deferred by the report'])
  })
})

describe('the messages and the dots', () => {
  it('word and colour every status the database may hold', () => {
    const kinds = [
      ['item', 'board', ITEM_STATUSES],
      ['plan', 'plan', PLAN_STATUSES],
      ['experiment', 'experiment', EXPERIMENT_STATUSES],
      ['stream', 'stream', STREAMS],
      ['likelihood', 'likelihood', LIKELIHOODS],
      ['coverage', 'coverage', COVERAGE_STATUSES],
      ['priority', 'priority', PRIORITIES],
    ] as const
    const status = (en.admin.growth.g2.status ?? {}) as Record<string, Record<string, string>>
    for (const [msg, dot, keys] of kinds)
      for (const k of keys) {
        expect(status[msg]?.[k], `${msg}.${k}`).toBeTruthy()
        // the design colours each; none falls to the yellow default by accident
        expect(['teal', 'yellow', 'peach', 'mut', 'line', 'green']).toContain(dotTone(dot, k))
      }
    expect(dotTone('board', 'live')).toBe('teal')
    expect(dotTone('plan', 'next')).toBe('line')
    expect(dotTone('likelihood', 'low_severe')).toBe('peach')
  })

  it('counts the risks page’s rows in words, and only the open decisions', () => {
    const tl = createTranslator({ locale: 'en', messages: en as unknown as AbstractIntlMessages, namespace: 'admin.growth' })
    const lead = (key: string, values: Record<string, string | number>) => tl(key as never, values as never)
    const w = (n: number, cap = false) => t(cap ? 'word.cap' : 'word.low', { n: String(n) })
    expect(lead('view.growthRisks.lead', { guardrails: 4, guardrailsWord: w(4, true), risks: 13, risksWord: w(13), open: 10, openWord: w(10) })).toBe(
      'Four non-negotiables, thirteen risks with mitigations, ten decisions waiting on counsel or the founder',
    )
    expect(lead('view.growthRisks.lead', { guardrails: 4, guardrailsWord: w(4, true), risks: 13, risksWord: w(13), open: 1, openWord: w(1) })).toMatch(/one decision waiting/)
    expect(w(42)).toBe('42')
  })
})

describe('the pages', () => {
  const pages = readdirSync('app/(admin)/admin/growth')
    .map((d) => join('app/(admin)/admin/growth', d))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'page.tsx')))
    .map((p) => join(p, 'page.tsx'))
    .concat('app/(admin)/admin/growth/page.tsx')

  it('each asks whether the role may see Growth before it reads or renders anything', () => {
    expect(pages).toHaveLength(8)
    for (const p of pages) {
      const src = readFileSync(p, 'utf8')
      const gate = src.search(/if \(!mayOpenGrowthView\(who\?\.role, '\w+'\)\) return <Problem/)
      expect(gate, p).toBeGreaterThan(-1)
      expect(gate, p).toBeLessThan(src.search(/await growth\w+\(\)/))
      expect(gate, p).toBeLessThan(src.indexOf('<PageHead'))
    }
  })

  it('none renders a sample figure: no «4 of 13», no «CI passing», no design owner initials', () => {
    for (const p of pages) {
      const src = readFileSync(p, 'utf8')
      expect(src, p).not.toMatch(/4 of 13|CI passing|'ib'|'ol'|'jh'|'te'|'sk'/)
    }
  })

  it('every shared Growth shape has a consumer (plan § 6, step 4)', () => {
    const shapes = [...readFileSync('components/admin/growth.tsx', 'utf8').matchAll(/export function (\w+)/g)].map((m) => m[1]!)
    const src = pages.map((p) => readFileSync(p, 'utf8')).concat(readFileSync('components/admin/GrowthDialogs.tsx', 'utf8'), readFileSync('components/admin/GrowthStub.tsx', 'utf8')).join('\n')
    for (const s of shapes) expect(src, s).toMatch(new RegExp(`\\b${s}\\b`))
  })
})
