import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ModuleFile, parseModule } from '@/lib/modules/schema'
import { RegistryFile } from '@/lib/modules/registry-file'
import { instrumentPages, respondQuestions } from '@/lib/respond/questions'
import type { RespondForm } from '@/lib/respond/read'

/**
 * A module that carries a published instrument as it is published (0224, D-267): its own order, its
 * own answer scales, the text before a statement, no «Ikke relevant for meg», up to nine statements a
 * factor, and the source it credits. HSE's Indicator Tool is the first (UK-D); the module here is a
 * synthetic one built from bygg-og-anlegg, so the format is held before any instrument ships on it.
 */
const raw = () => JSON.parse(readFileSync('modules/bygg-og-anlegg/v1.json', 'utf8'))

/** bygg-og-anlegg turned into an instrument: two scales, a fixed order across factors, a preface */
function instrument() {
  const m = raw()
  const freq = ['Aldri', 'Sjelden', 'Av og til', 'Ofte', 'Alltid']
  const agree = ['Svært uenig', 'Uenig', 'Nøytral', 'Enig', 'Svært enig']
  m.scales = { frekvens: { labels: freq }, enighet: { labels: agree } }
  m.factors.forEach((f: any, fi: number) => f.items.forEach((i: any) => (i.scale = fi < 4 ? 'frekvens' : 'enighet')))
  m.factors[0].items[0].preface = 'Les hvert utsagn og kryss av for svaret som passer best.'
  // the instrument's order: the second statement of every factor, then the first, then the third
  const codes = m.factors.flatMap((f: any) => f.items.map((i: any) => i.id as string))
  m.instrument = { order: [...codes.filter((c: string) => c.endsWith('-2')), ...codes.filter((c: string) => c.endsWith('-1')), ...codes.filter((c: string) => c.endsWith('-3'))], not_relevant: false }
  m.attribution = 'Kilde: et publisert instrument, gjengitt under lisens.'
  const en = m.translations.en
  en.scales = { frekvens: { labels: ['Never', 'Seldom', 'Sometimes', 'Often', 'Always'] }, enighet: { labels: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'] } }
  en.factors[m.factors[0].id].prefaces = { [m.factors[0].items[0].id]: 'Read each statement and tick the answer that fits best.' }
  en.attribution = 'Source: a published instrument, reproduced under licence.'
  return m
}
const issues = (m: unknown) => ModuleFile.safeParse(m).error?.issues.map((i) => i.message) ?? []

describe('an instrument module file (0224)', () => {
  it('parses, with its scales, order, preface and attribution', () => {
    const m = parseModule(instrument())
    expect(m.instrument?.not_relevant).toBe(false)
    expect(m.scales?.frekvens?.labels).toHaveLength(5)
    expect(m.factors[0]?.items[0]?.preface).toMatch(/^Les hvert/)
    expect(m.translations?.en?.attribution).toMatch(/^Source/)
  })

  it('leaves every existing module without any of it', () => {
    for (const key of ['bygg-og-anlegg', 'helse-og-omsorg', 'barnehage-og-skole', 'kunnskap-og-kontor', 'handel', 'arbetstid-och-aterhamtning']) {
      const file = JSON.parse(readFileSync(`modules/${key}/v1.json`, 'utf8'))
      const m = parseModule(file)
      expect(m.instrument).toBeUndefined()
      expect([m.scales, m.attribution]).toEqual([undefined, undefined])
      expect(m.factors.flatMap((f) => f.items).filter((i) => i.scale || i.preface)).toEqual([])
    }
  })

  it('takes up to nine statements a factor, numbered in turn', () => {
    const m = instrument()
    const f = m.factors[0]
    for (let n = 4; n <= 9; n++) f.items.push({ ...f.items[1], id: `BA-SF-${n}`, preface: undefined })
    m.instrument.order.push('BA-SF-4', 'BA-SF-5', 'BA-SF-6', 'BA-SF-7', 'BA-SF-8', 'BA-SF-9')
    for (let n = 4; n <= 9; n++) m.translations.en.factors[f.id].items[`BA-SF-${n}`] = 'A statement.'
    expect(issues(m)).toEqual([])
    f.items.push({ ...f.items[1], id: 'BA-SF-9' })
    expect(issues(m).length).toBeGreaterThan(0)
  })

  it('refuses an order that misses, repeats or invents a statement', () => {
    const missing = instrument()
    missing.instrument.order.pop()
    expect(issues(missing).some((i) => /is not in the order/.test(i))).toBe(true)
    const twice = instrument()
    twice.instrument.order.push(twice.instrument.order[0])
    expect(issues(twice)).toContain('a statement is listed twice')
    const unknown = instrument()
    unknown.instrument.order.push('BA-XX-1')
    expect(issues(unknown)).toContain('BA-XX-1 is not a statement of the module')
  })

  it('refuses a statement with no scale, or one the module does not have', () => {
    const none = instrument()
    delete none.factors[2].items[1].scale
    expect(issues(none)).toContain('an instrument names the scale of every statement')
    const unknown = instrument()
    unknown.factors[2].items[1].scale = 'hyppighet'
    expect(issues(unknown)).toContain('unknown scale hyppighet')
  })

  it('refuses a scale, a statement scale or a preface outside an instrument', () => {
    const scales = raw()
    scales.scales = { frekvens: { labels: ['a', 'b', 'c', 'd', 'e'] } }
    expect(issues(scales)).toContain('scales without an instrument')
    const preface = raw()
    preface.factors[0].items[0].preface = 'Les dette først.'
    expect(issues(preface)).toContain('a preface without an instrument')
    const scale = raw()
    scale.factors[0].items[0].scale = 'frekvens'
    expect(issues(scale)).toContain('a scale without an instrument')
  })

  it('refuses a statement numbered out of turn, and four statements outside an instrument', () => {
    const turn = instrument()
    turn.factors[1].items[2].id = 'BA-SL-7'
    turn.instrument.order = turn.instrument.order.map((c: string) => (c === 'BA-SL-3' ? 'BA-SL-7' : c))
    turn.translations.en.factors[turn.factors[1].id].items['BA-SL-7'] = turn.translations.en.factors[turn.factors[1].id].items['BA-SL-3']
    delete turn.translations.en.factors[turn.factors[1].id].items['BA-SL-3']
    expect(issues(turn)).toContain('BA-SL-7 is numbered out of turn')
    const four = raw()
    four.factors[0].items.push({ ...four.factors[0].items[0], id: 'BA-SF-4' })
    expect(issues(four)).toContain('a factor has exactly three statements')
  })

  it('refuses a translation that lacks a scale, a preface or the attribution', () => {
    const scale = instrument()
    delete scale.translations.en.scales.enighet
    expect(issues(scale)).toContain('en: scale enighet is not translated')
    const preface = instrument()
    delete preface.translations.en.factors[preface.factors[0].id].prefaces
    expect(issues(preface)).toContain(`en: preface of ${preface.factors[0].items[0].id} is not translated`)
    const attribution = instrument()
    delete attribution.translations.en.attribution
    expect(issues(attribution)).toContain('en: the attribution differs')
  })
})

describe('a registry file for an instrument', () => {
  it('takes five labels a scale, prefaces, and the sections taken from an official translation', () => {
    const file = {
      locale: 'pl',
      factors: {},
      items: { 'HS-DE-1': 'Mam niemożliwe do dotrzymania terminy' },
      counts: {},
      scales: { frekvens: ['Nigdy', 'Rzadko', 'Czasami', 'Często', 'Zawsze'] },
      prefaces: { 'HS-RO-1': 'Instrukcja.' },
      official: ['items', 'scales'],
    }
    expect(RegistryFile.safeParse(file).success).toBe(true)
    expect(RegistryFile.safeParse({ ...file, scales: { frekvens: ['Nigdy', 'Rzadko'] } }).success).toBe(false)
    expect(RegistryFile.safeParse({ ...file, official: ['options'] }).success).toBe(false)
  })
})

describe('instrument pages', () => {
  it("cuts HSE's 23 frequency and 12 agreement statements into even pages of at most five", () => {
    const pages = instrumentPages([...Array(23).fill('f'), ...Array(12).fill('e')])
    const sizes = Object.values(pages.reduce<Record<number, number>>((n, p) => ({ ...n, [p]: (n[p] ?? 0) + 1 }), {}))
    expect(sizes).toEqual([5, 5, 5, 4, 4, 4, 4, 4])
    // in order: a page never goes back
    expect(pages).toEqual([...pages].sort((a, b) => a - b))
  })
  it('starts a new page where the answers change, however short the run', () => {
    expect(instrumentPages(['f', 'f', 'e', 'f'])).toEqual([0, 0, 1, 2])
    expect(instrumentPages(['f', 'f', 'f', 'f', 'f', 'f'])).toEqual([0, 0, 0, 1, 1, 1])
    expect(instrumentPages([])).toEqual([])
  })
})

describe('the respondent questions of an instrument', () => {
  const t = Object.assign((key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key), {
    raw: (key: string) => key,
  }) as unknown as Parameters<typeof respondQuestions>[0]
  const ITEMS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
  const freq = ['Aldri', 'Sjelden', 'Av og til', 'Ofte', 'Alltid']
  const modules = (fixed: boolean): RespondForm['modules'] => [
    {
      name: 'Instrument',
      minutes: 5,
      fixed_order: fixed,
      statements: [
        { item: ITEMS[0]!, factor: 'Krav', text: 'Én', options: freq, options_en: ['Never', 'Seldom', 'Sometimes', 'Often', 'Always'], preface: 'Les først.', preface_en: 'Read first.', na: false },
        { item: ITEMS[1]!, factor: 'Kontroll', text: 'To', options: freq, na: false },
        { item: ITEMS[2]!, factor: 'Krav', text: 'Tre', na: true },
      ],
      count: [],
      segments: [],
    },
  ]
  const ask = (fixed: boolean, lang = 'no', texts: Record<string, string> | null = null) =>
    respondQuestions(t, { questions: [], extra: [], threshold: 5, modules: modules(fixed) }, lang, texts).filter((q) => q.kind === 'module')

  it('answers a statement on its own five answers, and the rest on the agreement scale', () => {
    const [one, , three] = ask(true)
    expect(one && 'choices' in one ? one.choices.map((c) => c.label) : null).toEqual(freq)
    expect(three && 'choices' in three ? three.choices.map((c) => c.label) : null).toEqual([1, 2, 3, 4, 5].map((n) => `respond.scale.o${n}`))
  })

  it('reads the answers and the preface from the registry in a survey language, else the English', () => {
    const texts = { [`module:${ITEMS[0]}:o1`]: 'Nigdy', [`module:${ITEMS[0]}:p`]: 'Instrukcja.' }
    const [pl] = ask(true, 'pl', texts)
    expect(pl?.kind === 'module' ? [pl.choices[0]?.label, pl.choices[1]?.label, pl.preface] : null).toEqual(['Nigdy', 'Sjelden', 'Instrukcja.'])
    const [en] = ask(true, 'en')
    expect(en?.kind === 'module' ? [en.choices[4]?.label, en.preface] : null).toEqual(['Always', 'Read first.'])
  })

  it('offers no «not relevant» where the instrument has none', () => {
    const [one, two, three] = ask(true)
    expect([one, two, three].map((q) => (q?.kind === 'module' ? !!q.noNotRelevant : null))).toEqual([true, true, false])
  })

  it('pages an instrument by its answers, with no factor above, and leaves a shuffled module by factor', () => {
    const fixed = ask(true)
    expect(fixed.map((q) => (q.kind === 'module' ? [q.factorLabel, q.page] : null))).toEqual([
      ['', 'instrument:0:0'],
      ['', 'instrument:0:0'],
      ['', 'instrument:0:1'],
    ])
    const shuffled = ask(false)
    expect(shuffled.map((q) => (q.kind === 'module' ? [q.factorLabel, q.page] : null))).toEqual([
      ['Krav', undefined],
      ['Kontroll', undefined],
      ['Krav', undefined],
    ])
  })
})
