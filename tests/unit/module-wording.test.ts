import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { industryForNace } from '@/content/industries/meta'
import { ModuleFile, contentHash, inWording, parseModule } from '@/lib/modules/schema'
import { pickWording } from '@/lib/modules/wording'

/**
 * A worded module (0083, D-131): barnehage og skole says «barna» in a kindergarten, «elevene»
 * in a school and «barna eller elevene» for both — one statement, one code, three wordings.
 */
const raw = (key: string) => JSON.parse(readFileSync(`modules/${key}/v1.json`, 'utf8'))
const fails = (mutate: (m: any) => void) => {
  const m = raw('barnehage-og-skole')
  mutate(m)
  return !ModuleFile.safeParse(m).success
}
const bs = parseModule(raw('barnehage-og-skole'))
const worded = [...bs.factors.flatMap((f) => f.items), ...bs.count_items]

describe('the barnehage og skole module', () => {
  it('parses: eight factors of three, two count questions, every one worded three ways', () => {
    expect(bs.factors).toHaveLength(8)
    expect(bs.factors.flatMap((f) => f.items)).toHaveLength(24)
    expect(bs.count_items).toHaveLength(2)
    for (const w of worded) expect(w.text_variants, w.id).toBeDefined()
  })

  it('says no «elev» in the kindergarten wording and no «barn» in the school wording', () => {
    for (const w of worded) {
      expect(w.text_variants!.barnehage, w.id).not.toMatch(/\belev/i)
      // «barnevern» is a service, not the children
      expect(w.text_variants!.skole.replace(/barnevern\w*/gi, ''), w.id).not.toMatch(/\bbarn/i)
    }
  })

  it('differs between the wordings only where the children are named', () => {
    const named = /barna eller elevene|barn eller elever|et barn eller en elev|barnas eller elevenes/
    for (const w of worded) {
      const same = w.text_variants!.barnehage === w.text && w.text_variants!.skole === w.text
      expect(same || named.test(w.text), w.id).toBe(true)
    }
  })

  it('names no statute section it has not been checked for', () => {
    const basis = bs.factors.flatMap((f) => f.legal_basis).join('\n')
    expect(basis).not.toMatch(/verifiser/i)
  })

  it('suggests a wording from the registered industry, the longest prefix first', () => {
    expect(bs.wording?.auto_from_nace).toMatchObject({ '85.1': 'barnehage', '85.2': 'skole', '88.911': 'barnehage' })
    expect(bs.wording?.default).toBe('begge')
  })
})

describe('the schema for wordings', () => {
  it('refuses a worded statement without both variants', () =>
    expect(fails((m) => delete m.factors[0].items[0].text_variants)).toBe(true))
  it('refuses an unfilled token', () => expect(fails((m) => (m.factors[0].items[0].text_variants.skole = 'Vi har {barna}'))).toBe(true))
  it('refuses variants in a module without wordings', () =>
    expect(fails((m) => delete m.wording)).toBe(true))
  it('refuses an English translation it has no place for', () =>
    expect(fails((m) => (m.translations = { en: raw('helse-og-omsorg').translations.en }))).toBe(true))
})

describe('picking a wording', () => {
  const item = bs.factors[0]!.items[0]!
  it('gives the variant, and the text itself for «begge» or no wording', () => {
    expect(inWording(item, 'barnehage')).toBe(item.text_variants!.barnehage)
    expect(inWording(item, 'skole')).toBe(item.text_variants!.skole)
    expect(inWording(item, 'begge')).toBe(item.text)
    expect(inWording(item, null)).toBe(item.text)
    expect(pickWording('x', undefined, 'skole')).toBe('x')
  })

  it('suggests the module to kindergartens under either industry standard, before helse og omsorg', () => {
    expect(industryForNace('85.100')?.slug).toBe('barnehage-og-skole')
    expect(industryForNace('85.201')?.slug).toBe('barnehage-og-skole')
    expect(industryForNace('88.911')?.slug).toBe('barnehage-og-skole')
    expect(industryForNace('88.101')?.slug).toBe('helse-og-omsorg')
  })
})

describe('the published modules', () => {
  it('hash as they did when published, whatever the schema learned since', () => {
    // hosted app.question_modules.content_hash, 2026-09-27; module_seed refuses a published version whose hash moved
    expect(contentHash(parseModule(raw('bygg-og-anlegg')))).toBe('fd6d9da1aa3bc80418529b7ea99d839a47939e8a647b6a4c877e435534059a74')
    expect(contentHash(parseModule(raw('helse-og-omsorg')))).toBe('65bd7f1be7464ab233b9b3c81c775deb90d62248f210773d7fb0dcfab8af99b6')
  })
})
