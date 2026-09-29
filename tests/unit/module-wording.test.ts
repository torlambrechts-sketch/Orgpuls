import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { industryForNace } from '@/content/industries/meta'
import { ModuleFile, bodyHash, canonicalJson, inWording, parseModule } from '@/lib/modules/schema'
import { pickWording } from '@/lib/modules/wording'

/**
 * A worded module (0083, D-131): barnehage og skole says «barna» in a kindergarten, «elevene»
 * in a school and «barna eller elevene» for both — one statement, one code, three wordings.
 */
const raw = (key: string, file = 'v1.json') => JSON.parse(readFileSync(`modules/${key}/${file}`, 'utf8'))
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
    // a factor's name is what a respondent reads above its statements
    const named = bs.factors.map((f) => ({ id: f.id, text: f.name, text_variants: f.name_variants ?? { barnehage: f.name, skole: f.name } }))
    for (const w of [...worded, ...named]) {
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

  it('names no statute section it has not been checked for, and no repealed one', () => {
    const basis = bs.factors.flatMap((f) => f.legal_basis).join('\n')
    expect(basis).not.toMatch(/verifiser/i)
    // forskrift om utførelse av arbeid kap. 23A was repealed 1 Jan 2026 (FOR-2025-12-16-2615); kap. 3A replaces it
    expect(basis).not.toMatch(/23A/)
  })

  it('suggests a wording from the registered industry, the longest prefix first', () => {
    expect(bs.wording?.auto_from_nace).toMatchObject({ '85.1': 'barnehage', '85.2': 'skole', '88.911': 'barnehage', '88.913': 'skole' })
    expect(bs.wording?.default).toBe('begge')
  })
})

describe('the schema for wordings', () => {
  it('refuses a worded statement without both variants', () =>
    expect(fails((m) => delete m.factors[0].items[0].text_variants)).toBe(true))
  it('refuses an unfilled token', () => expect(fails((m) => (m.factors[0].items[0].text_variants.skole = 'Vi har {barna}'))).toBe(true))
  it('refuses variants in a module without wordings', () =>
    expect(fails((m) => delete m.wording)).toBe(true))
  it('refuses an English translation it has no place for, by that rule', () => {
    const m = raw('barnehage-og-skole')
    // a translation complete in every other respect, so only the wording rule can refuse it
    m.translations = {
      en: {
        name: m.name,
        description: m.description,
        scale_labels: m.scale.labels,
        covered_by_core_factors: m.relation_to_core.covered_by_core_factors,
        factors: Object.fromEntries(
          m.factors.map((f: any) => [
            f.id,
            {
              name: f.name,
              summary: f.summary,
              rationale: f.rationale,
              legal_basis: f.legal_basis,
              items: Object.fromEntries(f.items.map((i: any) => [i.id, i.text])),
              action_suggestions: f.action_suggestions.map((a: any) => ({ title: a.title, description: a.description })),
            },
          ]),
        ),
        count_items: Object.fromEntries(m.count_items.map((c: any) => [c.id, { text: c.text, options: c.options }])),
        segments: Object.fromEntries(m.segments.map((s: any) => [s.id, { text: s.text, options: s.options }])),
      },
    }
    const r = ModuleFile.safeParse(m)
    expect(r.success).toBe(false)
    expect(r.error?.issues.map((i) => i.message)).toContain('a worded module has no English translation yet')
  })
  it('refuses a factor name with a token, and name variants without wording', () => {
    expect(fails((m) => (m.factors[0].name_variants.skole = 'Vold fra {barn}'))).toBe(true)
    expect(fails((m) => {
      delete m.wording
      for (const w of [...m.factors.flatMap((f: any) => f.items), ...m.count_items]) delete w.text_variants
    })).toBe(true)
  })
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
    expect(industryForNace('88.913')?.slug).toBe('barnehage-og-skole')
    expect(industryForNace('88.101')?.slug).toBe('helse-og-omsorg')
  })
})

describe('the published modules', () => {
  it('have the bodies the database was given for them (0122 body_hash), whatever the schema learned since', () => {
    // a file whose body moves is a new version at the next «Make live» (X-096); these pin what is live
    // on hosted today, so a schema change that re-shapes a parsed file is caught here and not as a version
    expect(bodyHash(parseModule(raw('bygg-og-anlegg')))).toBe('2f949f179f49936909807d56cc4e35f0f119dd06d58c42bf9002bd5a6ed1c862')
    expect(bodyHash(parseModule(raw('barnehage-og-skole')))).toBe('6d7f6d5f0448c7e9f85e583e5e3bf4489bfabc8e312526c81e20279444c5075b')
    expect(bodyHash(parseModule(raw('helse-og-omsorg')))).toBe('6249fbf6b079bcda168eba5961fc17cf19374d6321451d1f378594719d4ede73')
    expect(bodyHash(parseModule(raw('kunnskap-og-kontor')))).toBe('46a7c4b34c1fdcd270f10ac94b3fcc08ab5516dce3588ab474d6a8020b7c4c93')
    expect(bodyHash(parseModule(raw('handel')))).toBe('5498dbfeddc36b2597dd9726d9a8793073ac7fe1143b0f11ce7deec3bd805105')
  })

  it('a version number or a validation status is not a change of body', () => {
    const m = parseModule(raw('handel'))
    expect(bodyHash({ ...m, version: '9.9.9', validation_status: 'validated' })).toBe(bodyHash(m))
    expect(bodyHash({ ...m, name: `${m.name}!` })).not.toBe(bodyHash(m))
  })

  it('helse og omsorg 1.0.1 changes the legal basis and nothing a respondent is asked', () => {
    const was = parseModule(raw('helse-og-omsorg', 'archive/v1.0.0.json'))
    const now = parseModule(raw('helse-og-omsorg'))
    const law = (m: typeof now) => m.factors.flatMap((f) => f.legal_basis).join('\n')
    const lawEn = (m: typeof now) => Object.values(m.translations?.en?.factors ?? {}).flatMap((f) => f.legal_basis).join('\n')
    // the repealed chapter and the noise chapter under ergonomics are gone, in both languages
    expect(law(was)).toMatch(/kap\. 23A/)
    expect(law(now)).not.toMatch(/23A|kap\. 14/)
    expect(law(now)).toMatch(/kap\. 3A/)
    expect(law(now)).toMatch(/kap\. 23 \(ergonomisk/)
    expect(lawEn(now)).not.toMatch(/23A|chapter 14/)
    expect(lawEn(now)).toMatch(/chapter 3A/)
    // with the legal basis set aside, the two versions are the same file
    // canonical: key order carries no meaning (the file no longer carries a version, the archive does)
    const strip = (m: typeof now) =>
      canonicalJson({
        ...m,
        version: '',
        factors: m.factors.map((f) => ({ ...f, legal_basis: [] })),
        translations: m.translations && {
          en: m.translations.en && {
            ...m.translations.en,
            factors: Object.fromEntries(Object.entries(m.translations.en.factors).map(([k, f]) => [k, { ...f, legal_basis: [] }])),
          },
        },
      })
    expect(strip(now)).toBe(strip(was))
  })
})
