import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseModule } from '@/lib/modules/schema'
import { RegistryFile } from '@/lib/modules/registry-file'
import { moduleBands, ownBands } from '@/lib/modules/bands'
import { instrumentPages } from '@/lib/respond/questions'
import { INDUSTRY_META } from '@/content/industries/meta'
import { MODULE_KEYS } from '@/content/industries/modules'
import no from '@/messages/no.json'

/**
 * HSE's Management Standards Indicator Tool (UK-D4, X-111, X-112, D-268): the United Kingdom's module,
 * carried as HSE publishes it. What would go wrong silently:
 *
 *  - a statement reworded, reordered or answered on the wrong scale: HSE asks that the wording, the
 *    scoring and the order stay as they are;
 *  - a negatively worded statement scored the wrong way round (twelve of them);
 *  - HSE's bands lost to the core's 65/50 (X-112: 75 and 26);
 *  - the Open Government Licence line, or the line saying HSE does not endorse the service, missing;
 *  - a survey language taken out of the survey because one answer label or the instruction is missing;
 *  - HSE's official Polish replaced by a draft, or a draft passed off as HSE's;
 *  - the module offered in Norway or shown on Norway's industry pages.
 */
const KEY = 'hse-indicator-tool'
const m = parseModule(JSON.parse(readFileSync(`modules/${KEY}/v1.json`, 'utf8')), KEY)
const en = m.translations!.en!
const LANGS = ['pl', 'uk', 'lt', 'sv', 'da', 'de'] as const
const registry = (lang: string) => RegistryFile.parse(JSON.parse(readFileSync(`modules/${KEY}/registry/${lang}.json`, 'utf8')))
const items = m.factors.flatMap((f) => f.items)
const item = (code: string) => items.find((i) => i.id === code)!
const enItem = (code: string) => Object.values(en.factors).find((f) => f.items[code])!.items[code]
/** HSE's question number n (1–35) is the n-th code of the instrument's order */
const byNumber = (n: number) => m.instrument!.order[n - 1]!

describe('hse-indicator-tool v1', () => {
  it("parses: HSE's seven scales and 35 statements, nothing counted, no background questions", () => {
    expect(m.factors.map((f) => [f.id, f.items.length])).toEqual([
      ['demands', 8],
      ['control', 6],
      ['managers_support', 5],
      ['peer_support', 4],
      ['relationships', 4],
      ['role', 5],
      ['change', 3],
    ])
    expect(items).toHaveLength(35)
    expect(m.count_items).toEqual([])
    expect(m.segments).toEqual([])
    expect(m.variants).toBeUndefined()
    // no claim either way about its bands: they are HSE's guidance, chosen by X-112
    expect(m.validation_status).toBeUndefined()
  })

  it("asks HSE's 35 questions in HSE's order, its wording verbatim in English", () => {
    expect(m.instrument).toEqual({ order: expect.any(Array), not_relevant: false })
    expect(m.instrument!.order).toHaveLength(35)
    expect(enItem(byNumber(1))).toBe('I am clear what is expected of me at work')
    expect(enItem(byNumber(2))).toBe('I can decide when to take a break')
    expect(enItem(byNumber(5))).toBe('I am subject to personal harassment in the form of unkind words or behaviour')
    expect(enItem(byNumber(23))).toBe('I can rely on my line manager to help me out with a work problem')
    expect(enItem(byNumber(24))).toBe('I get help and support I need from colleagues')
    expect(enItem(byNumber(35))).toBe('My line manager encourages me at work')
    // the scale each question belongs to, as HSE's Analysis Tool groups them
    expect([1, 4, 11, 13, 17].map(byNumber)).toEqual(['HS-RO-1', 'HS-RO-2', 'HS-RO-3', 'HS-RO-4', 'HS-RO-5'])
    expect([26, 28, 32].map(byNumber)).toEqual(['HS-CH-1', 'HS-CH-2', 'HS-CH-3'])
  })

  it('answers questions 1–23 on Never…Always and 24–35 on Strongly disagree…Strongly agree', () => {
    for (let n = 1; n <= 35; n++) expect(item(byNumber(n)).scale, `question ${n}`).toBe(n <= 23 ? 'frekvens' : 'enighet')
    expect(en.scales?.frekvens?.labels).toEqual(['Never', 'Seldom', 'Sometimes', 'Often', 'Always'])
    expect(en.scales?.enighet?.labels).toEqual(['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'])
    expect(m.scales?.frekvens?.labels).toEqual(['Aldri', 'Sjelden', 'Noen ganger', 'Ofte', 'Alltid'])
  })

  it("puts HSE's instruction before question 1, and nowhere else", () => {
    expect(items.filter((i) => i.preface).map((i) => i.id)).toEqual([byNumber(1)])
    expect(en.factors.role?.prefaces?.[byNumber(1)]).toMatch(/^It is recognised that working conditions affect worker well-being\./)
    expect(en.factors.role?.prefaces?.[byNumber(1)]).toMatch(/your work in the last six months\.$/)
  })

  it("scores HSE's twelve negatively worded questions in reverse, and no other", () => {
    const reversed = [3, 5, 6, 9, 12, 14, 16, 18, 20, 21, 22, 34]
    for (let n = 1; n <= 35; n++) expect(item(byNumber(n)).reverse, `question ${n}`).toBe(reversed.includes(n))
  })

  it("bands by HSE's guidance: low risk from 75 (a mean of 4), high at 25 and below (a mean of 2)", () => {
    expect(moduleBands(m.scoring.risk_bands)).toEqual({ low: 75, medium: 26 })
    expect(ownBands(m.scoring.risk_bands)).toEqual({ low: 75, medium: 26 })
  })

  it('credits HSE under the Open Government Licence and says HSE does not endorse the service', () => {
    expect(en.attribution).toContain(
      'Contains public sector information published by the Health and Safety Executive and licensed under the Open Government Licence v3.0.',
    )
    expect(en.attribution).toContain('not produced, approved or endorsed by HSE')
    expect(m.attribution).toContain('Open Government Licence v3.0')
    expect(m.sources.map((s) => s.key)).toEqual(expect.arrayContaining(['hse_indicator', 'hse_polish', 'ogl_v3']))
  })

  it('cites UK law and describes HSE’s standards as guidance, never Norwegian law', () => {
    for (const f of m.factors) {
      expect(f.legal_basis[0], f.id).toMatch(/^MHSWR 1999 reg\. 3 og HSWA 1974 s\. 2/)
      expect(en.factors[f.id]!.legal_basis[0], f.id).toMatch(/^MHSWR 1999 reg 3 and HSWA 1974 s\.2, as applied to stress in HSE's guidance/)
      expect(en.factors[f.id]!.legal_basis.join(' '), f.id).not.toMatch(/Management Standards require/)
    }
    expect(JSON.stringify(m)).not.toMatch(/arbeidsmiljøloven|\baml\. §|Arbeidstilsynet/)
  })

  it('names the core instrument word for word', () => {
    const factor = (no as unknown as { factor: Record<string, Record<string, string>> }).factor
    const labels = new Set(Object.values(factor).map((f) => f.label))
    for (const n of m.relation_to_core?.covered_by_core_factors ?? []) expect(labels.has(n), n).toBe(true)
  })

  it('is asked on eight pages: the 23 frequency questions in five, the 12 agreement questions in three', () => {
    const pages = instrumentPages(m.instrument!.order.map((c) => item(c).scale ?? ''))
    const sizes = Object.values(pages.reduce<Record<number, number>>((n, p) => ({ ...n, [p]: (n[p] ?? 0) + 1 }), {}))
    expect(sizes).toEqual([5, 5, 5, 4, 4, 4, 4, 4])
  })
})

describe('its survey translations (modules/hse-indicator-tool/registry)', () => {
  it('ship in every survey language and in English, and in no other', () => {
    const files = readdirSync(`modules/${KEY}/registry`).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
    expect(files).toEqual([...LANGS, 'en'].sort())
  })

  // English is offered only where every statement, answer and the instruction is approved in the
  // registry (D-133), and English is the language a UK organisation answers in
  it("carry HSE's English as HSE's: the module's own English, every section official", () => {
    const r = registry('en')
    expect(r.official).toEqual(['factors', 'items', 'scales', 'prefaces'])
    for (const i of items) expect(r.items[i.id], i.id).toBe(enItem(i.id))
    expect(r.scales).toEqual({ frekvens: en.scales!.frekvens!.labels, enighet: en.scales!.enighet!.labels })
    expect(r.prefaces).toEqual(en.factors.role!.prefaces)
    for (const f of m.factors) expect(r.factors[f.id], f.id).toBe(en.factors[f.id]!.name)
  })

  it.each(LANGS)('in %s, translate every question, scale name, both answer scales and the instruction', (lang) => {
    const r = registry(lang)
    expect(r.locale).toBe(lang)
    expect(Object.keys(r.factors).sort()).toEqual(m.factors.map((f) => f.id).sort())
    expect(Object.keys(r.items).sort()).toEqual(items.map((i) => i.id).sort())
    expect(r.counts).toEqual({})
    expect(Object.keys(r.scales ?? {}).sort()).toEqual(['enighet', 'frekvens'])
    expect(Object.keys(r.prefaces ?? {})).toEqual([byNumber(1)])
    // a translation, not the source: never the bokmål or HSE's English
    const sources = new Set(items.flatMap((i) => [i.text, enItem(i.id)]))
    for (const t of Object.values(r.items)) expect(sources.has(t), t).toBe(false)
  })

  it("uses HSE's official Polish for the questions and answers, and says which texts are HSE's", () => {
    const pl = registry('pl')
    expect(pl.official).toEqual(['items', 'scales'])
    expect(pl.items[byNumber(1)]).toBe('Wiem, czego się ode mnie oczekuje w pracy.')
    expect(pl.scales?.frekvens).toEqual(['Nigdy', 'Rzadko', 'Czasami', 'Często', 'Zawsze'])
    // HSE's PDF prints «Zdecydowanie się zgadzam» under 1; the anchor is «strongly disagree» (D-268)
    expect(pl.scales?.enighet?.[0]).toBe('Zdecydowanie się nie zgadzam')
    for (const lang of ['uk', 'lt', 'sv', 'da', 'de']) expect(registry(lang).official, lang).toBeUndefined()
  })
})

describe('its market', () => {
  it('is the United Kingdom, set by a migration before the module exists anywhere (0220)', () => {
    const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))
    const rows = migrations.filter((f) => /insert into app\.module_markets[^;]*'hse-indicator-tool', 'gb'/s.test(readFileSync(`supabase/migrations/${f}`, 'utf8')))
    expect(rows).toEqual(['0225_module_hse_market.sql'])
  })

  it('keeps it out of Norway’s industry pages and their legal review', () => {
    expect(INDUSTRY_META.some((i) => i.moduleKey === KEY)).toBe(false)
    expect(MODULE_KEYS).not.toContain(KEY)
    expect(existsSync(`content/industries/${KEY}`)).toBe(false)
  })
})

describe('a module’s own bands (0223)', () => {
  it('read the first row for each band that names a minimum, and the core’s 65/50 otherwise, as app.module_band', () => {
    expect(moduleBands(undefined)).toEqual({ low: 65, medium: 50 })
    expect(moduleBands([{ band: 'lav' }, { band: 'lav', min: 80 }, { band: 'middels', min: 40, max: 79 }])).toEqual({ low: 80, medium: 40 })
    expect(ownBands([{ band: 'lav', min: 65 }, { band: 'middels', min: 50 }])).toBeNull()
  })

  it('are the core’s for every other module, so no other screen gains a line', () => {
    for (const key of readdirSync('modules').filter((k) => k !== KEY)) {
      const other = parseModule(JSON.parse(readFileSync(`modules/${key}/v1.json`, 'utf8')), key)
      expect(ownBands(other.scoring.risk_bands), key).toBeNull()
    }
  })
})
