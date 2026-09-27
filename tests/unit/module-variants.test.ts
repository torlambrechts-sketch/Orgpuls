import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ModuleFile, askedCodes, defaultExtendedFactors, factorIndex, parseModule } from '@/lib/modules/schema'

/**
 * A module in two variants (0089, D-137): kunnskap og kontor's file, the rules the schema holds
 * it to (bransje-kunnskap-og-kontor.md § 7.2), and the statements each variant asks.
 */
const raw = () => JSON.parse(readFileSync('modules/kunnskap-og-kontor/v1.json', 'utf8'))
const fails = (mutate: (m: any) => void) => {
  const m = raw()
  mutate(m)
  return !ModuleFile.safeParse(m).success
}

describe('kunnskap og kontor v1', () => {
  const m = parseModule(raw())

  it('parses: fifteen extended factors of three to five, eight simplified of three', () => {
    expect(m.factors).toHaveLength(15)
    expect(m.factors.every((f) => f.items.length >= 3 && f.items.length <= 5)).toBe(true)
    expect(m.factors.flatMap((f) => f.items)).toHaveLength(62)
    expect(m.variants?.[0].factors).toHaveLength(8)
    expect(m.validation_status).toBe('provisional')
  })

  it('asks the 24 core statements in the simplified set', () => {
    const core = m.factors.flatMap((f) => f.items.filter((i) => i.core_indicator).map((i) => i.id)).sort()
    expect(core).toHaveLength(24)
    expect([...askedCodes(m, 'forenklet')].sort()).toEqual(core)
  })

  it('asks every factor but «Rettferdighet og karriere» in the extended set by default', () => {
    expect(defaultExtendedFactors(m)).not.toContain('rettferdighet_og_karriere')
    expect(defaultExtendedFactors(m)).toHaveLength(14)
    expect(askedCodes(m, 'utvidet')).toHaveLength(59)
  })

  it('asks the core statements in the extended set whatever factors are chosen', () => {
    const eight = ['fokus_og_avbrytelser', 'digitale_verktoy', 'tilgjengelighet', 'arbeid_privatliv', 'restitusjon', 'laering_og_utvikling', 'ki_og_endring', 'kunde_og_leveransepress']
    const asked = new Set(askedCodes(m, 'utvidet', eight))
    for (const code of askedCodes(m, 'forenklet')) expect(asked.has(code)).toBe(true)
    // an unchosen factor's other statements are not asked
    expect(asked.has('KK-MK-2')).toBe(false)
    expect(asked.has('KK-MK-1')).toBe(true)
  })

  it('gives the same simplified index both ways for the same answers', () => {
    // a deterministic answer per statement
    const answer = (code: string) => (code.charCodeAt(3) + Number(code.slice(-1))) % 5 + 1
    const simplified = (asked: string[]) =>
      m.variants![0].factors.map((f) => factorIndex(f.items.filter((c) => asked.includes(c)).map(answer)))
    const forenklet = simplified(askedCodes(m, 'forenklet'))
    const utvidet = simplified(askedCodes(m, 'utvidet', defaultExtendedFactors(m).slice(0, 8)))
    expect(utvidet).toEqual(forenklet)
    expect(forenklet.every((x) => Number.isFinite(x))).toBe(true)
  })

  it('carries the help line under KK-TG-1', () => {
    expect(m.factors.flatMap((f) => f.items).find((i) => i.id === 'KK-TG-1')?.help).toBe('Gjelder ikke avtalt vakt eller beredskap.')
  })
})

describe('the rules a module in variants is held to', () => {
  it('refuses a simplified factor with a statement that is not a core one', () =>
    expect(fails((m) => (m.variants[0].factors[0].items[2] = 'KK-FA-3'))).toBe(true))
  it('refuses a simplified factor of two statements', () => expect(fails((m) => m.variants[0].factors[0].items.pop())).toBe(true))
  it('refuses locked statements that are not exactly the core ones', () => expect(fails((m) => m.variants[1].locked_items.pop())).toBe(true))
  it('refuses a re-measure statement outside the simplified factor', () =>
    expect(fails((m) => (m.variants[0].factors[0].action_suggestions[0].remeasure_item = 'KK-DV-1'))).toBe(true))
  it('refuses an unknown factor off by default', () => expect(fails((m) => m.variants[1].default_off.push('nope'))).toBe(true))
  it('refuses a minimum above the factors there are', () => expect(fails((m) => (m.variants[1].min_factors = 16))).toBe(true))
  it('refuses an extended factor of six statements', () =>
    expect(
      fails((m) => m.factors[0].items.push({ id: 'KK-FA-6', text: 'Seks', reverse: false, pulse_eligible: true, core_indicator: false })),
    ).toBe(true))
  it('refuses a count question whose variants disagree with the variants', () =>
    expect(fails((m) => (m.count_items[2].variants = ['forenklet', 'utvidet']))).toBe(true))
  it('refuses a count question of five answers', () => expect(fails((m) => m.count_items[1].options.push('Kanskje'))).toBe(true))

  it('still holds a module asked one way to three statements per factor', () => {
    const bygg = JSON.parse(readFileSync('modules/bygg-og-anlegg/v1.json', 'utf8'))
    bygg.factors[0].items.push({ ...bygg.factors[0].items[0], id: 'BA-SF-4' })
    expect(ModuleFile.safeParse(bygg).success).toBe(false)
  })
})
