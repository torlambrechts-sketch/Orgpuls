import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ModuleFile, parseModule } from '@/lib/modules/schema'

/**
 * Handel (bransje-handel.md, D-138): a module asked one way, 8 factors of 3, whose second count
 * question answers «Jobber aldri alene» rather than «Vet ikke» and belongs with «Alene på vakt».
 */
const raw = () => JSON.parse(readFileSync('modules/handel/v1.json', 'utf8'))
const fails = (mutate: (m: any) => void) => {
  const m = raw()
  mutate(m)
  return !ModuleFile.safeParse(m).success
}

describe('handel v1', () => {
  const m = parseModule(raw())

  it('parses: eight factors of three statements, asked one way, provisional', () => {
    expect(m.factors).toHaveLength(8)
    expect(m.factors.every((f) => f.items.length === 3)).toBe(true)
    expect(m.variants).toBeUndefined()
    expect(m.validation_status).toBe('provisional')
  })

  it('stores «Jobber aldri alene» as not applicable, asked with «Alene på vakt»', () => {
    const t2 = m.count_items.find((c) => c.id === 'HA-T-2')!
    expect(t2.options[2]).toBe('Jobber aldri alene')
    expect(t2.answer_keys).toEqual(['ja', 'nei', 'ikke_aktuelt'])
    expect(t2.asked_with).toBe('alene_pa_vakt')
    const t1 = m.count_items.find((c) => c.id === 'HA-T-1')!
    expect(t1.answer_keys).toBeUndefined()
    expect(t1.asked_with).toBeUndefined()
  })

  it('keeps the line that no one stops a thief alone', () => {
    const f = m.factors.find((x) => x.id === 'sikkerhet_tyveri_trusler')!
    expect(f.action_suggestions[0]?.description).toContain('ingen skal stoppe en tyv på egen hånd')
  })
})

describe('a count question\'s answer keys and factor', () => {
  it('refuses keys that do not match the options', () =>
    expect(fails((m) => (m.count_items[1].answer_keys = ['ja', 'nei', 'vet_ikke', 'ikke_aktuelt']))).toBe(true))
  it('refuses keys out of order', () => expect(fails((m) => (m.count_items[1].answer_keys = ['nei', 'ja', 'ikke_aktuelt']))).toBe(true))
  it('refuses an unknown factor', () => expect(fails((m) => (m.count_items[1].asked_with = 'nope'))).toBe(true))
})

describe('the industry a retail organisation is offered', () => {
  it('suggests handel for SN2025 46 and 47, and nothing else for them', async () => {
    const { industryForNace } = await import('@/content/industries/meta')
    expect(industryForNace('47.110')?.moduleKey).toBe('handel')
    expect(industryForNace('46.390')?.moduleKey).toBe('handel')
    expect(industryForNace('45.200')).toBeNull()
  })
})
