import { readFileSync } from 'node:fs'
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { AUTH_ACTIONS } from '@/supabase/functions/_shared/mail'
import {
  Deliverability,
  deliverabilityKpis,
  keyParts,
  levelsOf,
  levelTone,
  localeList,
  mayRunAuthCheck,
  streamGap,
  streamRates,
  type Stream,
} from '@/lib/admin/deliverability'
import { dotTone } from '@/lib/admin/dots'
import { GROWTH_VIEWS } from '@/lib/admin/growth'
import { allGuidance, dayMonth, doiRate, doneText, GrowthMagnets, liveMagnets, rate, ruleValue, shortOf } from '@/lib/admin/magnets'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/** Sentral › Growth G4: Tools & lead magnets and Deliverability (0144, D-185). */
const MIGRATION = readFileSync('supabase/migrations/0144_growth_magnets_deliverability.sql', 'utf8')
const MAIL = readFileSync('supabase/functions/_shared/mail.ts', 'utf8')
const DISPATCH = readFileSync('supabase/functions/orgpuls-dispatch/index.ts', 'utf8')

/** The registry's seeded (source, ref) pairs, read from the migration's insert */
const seeded = [...MIGRATION.matchAll(/\('([a-z]+\.[a-z0-9_.-]+)', '(notice|ticket|lifecycle|auth|crm)', '([a-z_:-]+)', '(service|marketing)', '(transactional|marketing)'/g)].map(
  (m) => ({ key: m[1]!, source: m[2]!, ref: m[3]!, classification: m[4]!, stream: m[5]! }),
)
/** The members of a string-literal union type in mail.ts */
const union = (name: string, src = MAIL) => {
  const at = src.indexOf(name)
  const body = src.slice(at, src.indexOf('\n\n', at) === -1 ? undefined : src.indexOf('\n\n', at))
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
}

describe('the template registry covers every mail the dispatcher can send', () => {
  it('each notice kind of NoticeJob', () => {
    const at = MAIL.indexOf('export interface NoticeJob')
    const kinds = [...MAIL.slice(MAIL.indexOf('kind:', at), MAIL.indexOf('audience:', at)).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
    expect(kinds.length).toBe(9)
    for (const k of kinds) expect(seeded.some((r) => r.source === 'notice' && r.ref === k), k).toBe(true)
  })

  it('each trial and cancellation step', () => {
    const steps = union('export type LifecycleStep')
    expect(steps).toContain('deletion_soon')
    for (const s of steps) expect(seeded.some((r) => r.source === 'lifecycle' && r.ref === s), s).toBe(true)
  })

  it('each of Auth’s mails', () => {
    for (const a of AUTH_ACTIONS) expect(seeded.some((r) => r.source === 'auth' && r.ref === a), a).toBe(true)
  })

  it('each CRM send kind, the invitation test and the ticket reply', () => {
    const at = MAIL.indexOf('export interface CrmJob')
    const kinds = [...MAIL.slice(at, MAIL.indexOf('\n', MAIL.indexOf('kind:', at))).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
    expect(kinds).toEqual(['campaign', 'test', 'optin'])
    for (const k of kinds) expect(seeded.some((r) => r.source === 'crm' && r.ref === k), k).toBe(true)
    // the dispatcher's own sends outside the outbox: «Send test til meg» and a ticket's reply
    expect(DISPATCH).toContain("rpc('dispatch_test_claim'")
    expect(DISPATCH).toContain("rpc('ticket_mail_claim'")
    expect(seeded.map((r) => r.key)).toEqual(expect.arrayContaining(['notice.test', 'ticket.reply']))
  })

  it('binds marketing to the marketing stream only, and every CRM template by the database', () => {
    for (const r of seeded) if (r.classification === 'marketing') expect(r.stream, r.key).toBe('marketing')
    expect(MIGRATION).toMatch(/select 'crm\.' \|\| t\.key, 'crm', 'template:' \|\| t\.key, 'marketing', 'marketing'/)
  })

  it('names the senders the dispatcher is deployed with', () => {
    expect(MIGRATION).toContain("('transactional', 'no-reply@orgpuls.com', 1)")
    expect(MIGRATION).toContain("('marketing', 'hei@nyheter.orgpuls.com', 2)")
    // the marketing-setup probe's default names the same sender; the dispatcher itself sends no
    // marketing at all without ORGPULS_MARKETING_FROM (its `marketing` is null)
    expect(DISPATCH).toContain("marketingFrom.includes('@') ? marketingFrom : 'hei@nyheter.orgpuls.com'")
    expect(DISPATCH).toMatch(/\? \{ email: marketingFrom, name: [^}]+\}\s*: null/)
  })
})

describe('the hygiene the page claims is what the code does', () => {
  it('one-click unsubscribe on every campaign mail', () => {
    expect(DISPATCH).toContain("'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'")
  })
  it('no marketing on the product’s domain', () => {
    expect(DISPATCH).toMatch(/domainOf\(marketingFrom\) !== domainOf\(sender\.email\)/)
  })
  it('A/B tests decide on clicks by default, and an admin may choose opens', () => {
    expect(en.admin.growth.g4.deliverability.hygiene.clicks).toMatch(/decide on clicks by default/)
    expect(readFileSync('supabase/migrations/0059_attribution_server.sql', 'utf8')).toContain("alter column ab_metric set default 'click'")
    expect(readFileSync('lib/admin/crmActions.ts', 'utf8')).toContain("ab_metric: z.enum(['open', 'click'])")
  })
  it('suppression on a bounce or a complaint, and twelve months of silence', () => {
    const crm = readFileSync('supabase/migrations/0141_growth_foundations.sql', 'utf8')
    expect(crm).toMatch(/p_event in \('hard_bounce', 'invalid', 'spam', 'blocked', 'unsubscribed'\)/)
    const mailable = readFileSync('supabase/migrations/0056_crm_pipeline.sql', 'utf8')
    expect(mailable).toMatch(/interval '12 months'/)
  })
})

describe('the magnets’ figures', () => {
  it('a rate needs a denominator, and prints as the design does', () => {
    expect(rate(0, 0)).toBeNull()
    expect(rate(3, 0)).toBeNull()
    expect(rate(154, 1000, 1)).toBe('15,4 %')
    expect(rate(2, 1000, 2)).toBe('0,20 %')
    expect(rate(24, 25)).toBe('96 %')
  })

  it('double opt-in is confirmed of sent, «—» with none sent', () => {
    expect(doiRate({ sent: 0, confirmed: 0 })).toBeNull()
    expect(doiRate(null)).toBeNull()
    expect(doiRate({ sent: 3, confirmed: 2 })).toBe('67 %')
  })

  it('completions print as the design’s `fmt`, «—» where nothing counts them, a real 0 as 0', () => {
    expect(doneText(null)).toBeNull()
    expect(doneText(0)).toBe('0')
    expect(doneText(1240)).toBe('1 240')
  })

  it('a planned magnet is the hairline colour, live teal: G0’s kit map, not a copy', () => {
    expect(dotTone('kit', 'planned')).toBe('line')
    expect(dotTone('kit', 'building')).toBe('yellow')
    expect(dotTone('kit', 'live')).toBe('teal')
  })

  it('the design’s short line and its day', () => {
    expect(shortOf('Ten questions about the company, never about employees. Score ungated.')).toBe('Ten questions about the company, never about employees')
    expect(shortOf('Org.nr in → which HMS duties apply: verneombud from 5')).toBe('Org.nr in → which HMS duties apply')
    expect(dayMonth('2026-09-22')).toBe('22 Sep')
    expect(dayMonth('2026-09-30T23:30:00Z')).toBe('1 Oct')
  })

  it('parses the read and counts no live tool', () => {
    const m = GrowthMagnets.parse({
      magnets: [
        { key: 'krav_sjekk', rank: 1, name: 'Krav-sjekk', list_name: null, kind: 'tool', gated: 'pdf_templates', status: 'planned', derived: false, completions: null, doi: null },
        { key: 'nyhetsbrev', rank: 7, name: null, list_name: 'Nyhetsbrevet', kind: 'newsletter', gated: 'none', status: 'live', derived: true, completions: '4', doi: { sent: 2, confirmed: 1 } },
      ],
      doi: { sent: 0, confirmed: 0 },
      rules: [
        { key: 'amu', version: 1, threshold: 30, on_demand_from: 10, reference: 'aml § 7-1', say: null, never_say: null, checked_on: '2026-09-30', checked_against: 'Lovdata', guidance: true },
      ],
      ruleset_version: 1,
      marketing_domain: 'nyheter.orgpuls.com',
    })
    expect(m.magnets[1]!.completions).toBe(4)
    expect(liveMagnets(m)).toBe(0)
    expect(allGuidance(m)).toBe(true)
    expect(allGuidance({ ...m, rules: [{ ...m.rules[0]!, guidance: false }] })).toBe(false)
    // a rule's line never makes a figure of a missing one: AMU without its on-demand figure is the duty alone
    const amu = m.rules[0]!
    expect(ruleValue(amu)).toEqual({ key: 'amu', vars: { n: 30, from: 10, date: '30 Sep' } })
    expect(ruleValue({ ...amu, on_demand_from: null })).toEqual({ key: 'amuOnly', vars: { n: 30, date: '30 Sep' } })
    expect(ruleValue({ ...amu, threshold: null })).toBeNull()
    expect(ruleValue({ ...amu, key: 'verneombud', threshold: null })).toBeNull()
    expect(ruleValue({ ...amu, key: 'wording_4_3', say: 'Loven er presisert', never_say: null })).toBeNull()
    expect(MIGRATION).toContain("constraint growth_krav_amu check (rule_key <> 'amu' or on_demand_from is not null)")
    expect(() => GrowthMagnets.parse({ ...m, magnets: [{ ...m.magnets[0]!, status: 'invented' }] })).toThrow()
  })
})

const stream = (over: Partial<Stream>): Stream => ({
  key: 'transactional',
  sender: 'no-reply@orgpuls.com',
  domain: 'orgpuls.com',
  withheld: false,
  sent: 0,
  reported: 0,
  tests: 0,
  delivered: 0,
  spam: 0,
  bounced: 0,
  hard_bounces: 0,
  last_event_at: null,
  check: null,
  ...over,
})

describe('the streams’ figures', () => {
  it('nothing sent, or nothing reported, is «—», never 0 %', () => {
    expect(streamGap(stream({}))).toBe('nothing_sent')
    expect(streamRates(stream({}))).toEqual({ delivered: null, spam: null, bounce: null })
    expect(streamGap(stream({ sent: 40 }))).toBe('no_events')
    expect(streamRates(stream({ sent: 40 })).delivered).toBeNull()
  })

  it('rates over the messages the provider reported on, to the design’s decimals', () => {
    const r = streamRates(stream({ sent: 1000, reported: 1000, delivered: 994, spam: 1, bounced: 4 }))
    expect(r).toEqual({ delivered: '99,4 %', spam: '0,10 %', bounce: '0,4 %' })
    // a message with no report is not a failed one: 12 invitation tests are never reported
    expect(streamRates(stream({ sent: 22, reported: 10, tests: 12, delivered: 10 })).delivered).toBe('100,0 %')
  })

  it('the KPI row stands on the same reports as the cards: a stream with no event adds nothing to a denominator', () => {
    const k = deliverabilityKpis([stream({ sent: 900, reported: 900, delivered: 890, spam: 1, hard_bounces: 3 }), stream({ key: 'marketing', sent: 100 })])
    expect(k).toMatchObject({ sent: 1000, reported: 900, gap: null, delivered: '98,9 %', spam: '0,11 %', hardBounces: 3, complaints: 1 })
    // the review's case: 10 transactional sent and delivered, 990 marketing with no webhook event
    const m = stream({ key: 'marketing', sent: 990 })
    expect(deliverabilityKpis([stream({ sent: 10, reported: 10, delivered: 10 }), m]).delivered).toBe('100,0 %')
    expect(streamGap(m)).toBe('no_events')
    expect(deliverabilityKpis([stream({ sent: 5 })])).toMatchObject({ gap: 'no_events', delivered: null, hardBounces: null, complaints: null })
    expect(deliverabilityKpis([stream({ sent: 5 }), m]).withheld).toBe(false)
    expect(deliverabilityKpis([stream({ sent: 5, withheld: true }), m]).withheld).toBe(true)
  })

  it('a withheld notice is left out of every aggregate the read returns, and delivered counts what only delivered mail reaches', () => {
    // the stream totals are counted over `shown`, the messages of no withheld template
    for (const f of ['sent', 'reported', 'tests', 'delivered', 'spam', 'bounced', 'hard_bounces']) {
      expect(MIGRATION, f).toMatch(new RegExp(`'${f}', \\(select count\\(\\*\\) from shown x where x\\.stream = s\\.key`))
    }
    expect(MIGRATION).toContain("x.delivery in ('delivered', 'spam', 'unsubscribed')")
    expect(MIGRATION).toContain("x.delivery is not null and x.delivery <> 'deferred'")
    // the claim is audited when it is made, before its lookups
    expect(MIGRATION).toContain("perform app.admin_log('deliverability.auth_claim', null, 'mail_auth_runs', v_id::text)")
  })

  it('a registry key breaks only after a separator', () => {
    expect(keyParts('notice.siste_paminnelse')).toEqual(['notice.', 'siste_', 'paminnelse'])
    expect(keyParts('trial.read_only_soon').join('')).toBe('trial.read_only_soon')
    expect(keyParts('crm.kundehistorie')).toEqual(['crm.', 'kundehistorie'])
    expect(keyParts('crm.bygg-og-anlegg')).toEqual(['crm.', 'bygg-', 'og-', 'anlegg'])
  })

  it('offers the check to the roles that write in the CRM only', () => {
    expect(mayRunAuthCheck('super_admin')).toBe(true)
    expect(mayRunAuthCheck('marketing')).toBe(true)
    expect(mayRunAuthCheck('analyst')).toBe(false)
    expect(mayRunAuthCheck(null)).toBe(false)
  })

  it('claims the minute before any lookup goes out, and records against the claim', () => {
    const src = readFileSync('lib/admin/deliverabilityActions.ts', 'utf8')
    const claim = src.indexOf("rpc('admin_deliverability_claim')")
    expect(claim).toBeGreaterThan(-1)
    expect(claim).toBeLessThan(src.indexOf('domainChecks(s.domain, { fresh: true })'))
    expect(src).toContain("rpc('admin_deliverability_check', { p_run: c.data.run, p_results: results })")
  })

  it('maps the DNS check to the levels the table keeps; a failed lookup is unknown, not a failure', () => {
    expect(
      levelsOf([
        { id: 'dkim', level: 'pass' },
        { id: 'dmarc', level: 'warn', vars: { policy: 'none' } },
        { id: 'spf', level: 'warn' },
      ]),
    ).toEqual({ spf: 'warn', dkim: 'pass', dmarc: 'warn', dmarc_policy: 'none' })
    expect(levelsOf([{ id: 'domain_lookup', level: 'warn' }])).toEqual({ spf: 'unknown', dkim: 'unknown', dmarc: 'unknown', dmarc_policy: null })
    expect(levelsOf([{ id: 'dmarc', level: 'pass', vars: { policy: 'REJECT' } }]).dmarc_policy).toBe('reject')
  })

  it('colours as the design does', () => {
    expect(levelTone('pass')).toBe('teal')
    expect(levelTone('warn')).toBe('yellow')
    expect(levelTone('fail')).toBe('peach')
    expect(levelTone(null)).toBe('line')
    expect(dotTone('stream', 'marketing')).toBe('yellow')
    expect(dotTone('stream', 'service')).toBe('teal')
    expect(localeList(['no', 'en'])).toBe('no · en')
  })

  it('parses the read; Auth’s count may be null, a stream’s key may not be invented', () => {
    const d = Deliverability.parse({
      streams: [stream({ sent: '3' as unknown as number })],
      templates: [
        { key: 'auth.signup', source: 'auth', ref: 'signup', classification: 'service', stream: 'transactional', locales: ['no', 'en'], version: 1, sent: null, withheld: false },
        { key: 'notice.paminnelse', source: 'notice', ref: 'paminnelse', classification: 'service', stream: 'transactional', locales: ['no'], version: 1, sent: null, withheld: true },
      ],
      daily_cap: null,
      k: 5,
    })
    expect(d.streams[0]!.sent).toBe(3)
    expect(() => Deliverability.parse({ ...d, streams: [{ ...d.streams[0]!, key: 'varsel' }] })).toThrow()
  })
})

describe('the pages', () => {
  const tr = createTranslator({ locale: 'en', messages: en as unknown as AbstractIntlMessages, namespace: 'admin.growth.g4' })
  const t = (key: string, values: Record<string, string | number>) => tr(key as never, values as never)

  it('ask whether the role may see Growth before they read or render anything', () => {
    for (const [file, view, read] of [
      ['app/(admin)/admin/cms/magnets/page.tsx', 'cmsMagnets', 'await growthMagnets()'],
      ['app/(admin)/admin/deliverability/page.tsx', 'deliverability', 'await growthDeliverability()'],
    ] as const) {
      const src = readFileSync(file, 'utf8')
      const gate = src.indexOf(`if (!mayOpenGrowthView(who?.role, '${view}')) return <Problem`)
      expect(gate, file).toBeGreaterThan(-1)
      expect(gate).toBeLessThan(src.indexOf(read))
    }
  })

  it('word the rules and the footer from the data', () => {
    expect(t('magnets.krav.value.amu', { n: 30, from: 10, date: '30 Sep' })).toBe('From 30 · 10–30 on demand · checked 30 Sep')
    expect(t('magnets.krav.footer', { version: 1, guidance: 'yes' })).toBe(
      'Rules v1 · versioned data, not code · every rule carries a «sist kontrollert» date · marked as guidance, not legal advice.',
    )
    expect(t('magnets.krav.footer', { version: 2, guidance: 'no' })).toMatch(/not every rule is marked as guidance/)
    expect(t('deliverability.kpi.noEvents', { n: 1 })).toBe('1 message sent · no delivery event recorded')
    expect(t('deliverability.kpi.deliveredSub', { reported: '900', sent: '1 000' })).toBe('reported on 900 of 1 000 sent')
    expect(t('deliverability.registry.withheld', { k: 5 })).toBe('< 5')
    expect(t('magnets.krav.value.amuOnly', { n: 30, date: '30 Sep' })).toBe('From 30 · checked 30 Sep')
    expect(t('deliverability.stream.withheld', { k: 5 })).toMatch(/fewer than 5 times are left out/)
    // no experiment runs yet: E4 is planned, not happening
    for (const msgs of [en, no]) expect(msgs.admin.growth.g4.magnets.gatingRule.text).toContain('Test E4 will check')
    expect(t('magnets.name.newsletter', { list: 'Nyhetsbrevet' })).toBe('Newsletter «Nyhetsbrevet»')
  })

  it('use G0’s shared card, bullet and dot maps rather than copies of them', () => {
    const del = readFileSync('app/(admin)/admin/deliverability/page.tsx', 'utf8')
    const mag = readFileSync('app/(admin)/admin/cms/magnets/page.tsx', 'utf8')
    expect(del).toMatch(/<SectionCard title=\{d\('provider.title'\)\}>/)
    expect(del).toMatch(/<BulletRow key=\{h\} tone="teal" pretty>/)
    expect(del).toContain("dotTone('stream', x.classification)")
    expect(mag).toContain("dotTone('kit', x.status)")
    expect(mag).toMatch(/<SectionCard title=\{m\('krav.title'\)\}>/)
    for (const src of [del, mag]) expect(src).not.toMatch(/classTone|magnetTone/)
  })

  it('leave no stub message behind for the two views, and keep their phase', () => {
    for (const msgs of [en, no]) {
      const views = msgs.admin.growth.view as Record<string, Record<string, string>>
      expect(views.cmsMagnets).not.toHaveProperty('empty')
      expect(views.deliverability).not.toHaveProperty('empty')
    }
    expect(GROWTH_VIEWS.cmsMagnets.phase).toBe('G4')
    expect(GROWTH_VIEWS.deliverability.phase).toBe('G4')
  })

  it('draw no «New tool», «New template» or «Open editor»: nothing backs them', () => {
    for (const file of ['app/(admin)/admin/cms/magnets/page.tsx', 'app/(admin)/admin/deliverability/page.tsx']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/newTool|newTemplate|openEditor/)
    }
    expect(JSON.stringify(en.admin.growth.g4)).not.toMatch(/New tool|New template|Open editor/)
  })
})
