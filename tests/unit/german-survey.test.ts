import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import no from '@/messages/no.json'
import en from '@/messages/en.json'
import { surveyCatalogue } from '@/lib/i18n/survey-catalogue'
import { checkImport, parseFile } from '@/lib/i18n/translation-package'
import { literalText, parseIcu } from '@/lib/i18n/icu-rules'
import { smsLength } from '@/supabase/functions/_shared/sms'
import { RegistryFile } from '@/lib/modules/registry-file'
import { parseModule } from '@/lib/modules/schema'
import { LOCALE_REGISTRY, registryTexts, TRANSLATION_LOCALES } from '@/lib/i18n/locales'
import { RESPONDENT_LOCALES, surveyBaseOf } from '@/lib/i18n/offered'
import { MARKET_SURVEY_BASE } from '@/supabase/functions/_shared/mail'
import { FLAG_NAMES, SIGNED_OFF } from '@/lib/flags'

/**
 * German as a survey language (DE-A2, D-292), on the pattern of the five before it (D-133, X-089):
 * the registry row, the database's lists (tests/unit/locales.test.ts), the machine draft of the
 * product's own respondent texts in docs/translations/de.orgpuls-translations.json — a package the
 * platform's translations.import takes, checked here as that import checks it — and the modules'
 * German by code in modules/<key>/registry/de.json (D-263), each held to its module's definition.
 * Nothing here approves anything: a German text reaches a respondent only once a person has
 * approved it.
 */
const FILE = 'docs/translations/de.orgpuls-translations.json'
type Entry = { key: string; section: string; context: string; source: string; target: string; status: string; origin: string | null; notes: string }
const text = readFileSync(FILE, 'utf8')
const pkg = parseFile(text)
const entries = (JSON.parse(text) as { entries: Entry[] }).entries
const targets = entries.map((e) => e.target)

// the product's own texts as this build asks them: the core statements, the questions outside the
// index, the survey pages and the mails; module texts are not in the package (their ids differ
// between databases), they ship by code with each module
const catalogue = surveyCatalogue(no, en, [])

const MODULES = ['bygg-og-anlegg', 'helse-og-omsorg', 'handel', 'barnehage-og-skole', 'kunnskap-og-kontor', 'hse-indicator-tool', 'arbetstid-och-aterhamtning']
const definition = (key: string) => {
  const files = readdirSync(`modules/${key}`).filter((f) => /^v\d+\.json$/.test(f)).sort()
  return parseModule(JSON.parse(readFileSync(`modules/${key}/${files[files.length - 1]}`, 'utf8')), `modules/${key}/${files[files.length - 1]}`)
}
const registry = (key: string) => RegistryFile.parse(JSON.parse(readFileSync(`modules/${key}/registry/de.json`, 'utf8')))

describe('German is a survey language', () => {
  it('in the registry, with its respondent texts in the translation registry, and in every derived list', () => {
    const de = LOCALE_REGISTRY.find((l) => l.code === 'de')
    expect(de?.survey).toBe(true)
    expect(de?.surveyTexts).toBe('registry')
    expect(registryTexts('de')).toBe(true)
    expect(TRANSLATION_LOCALES).toContain('de')
    expect(RESPONDENT_LOCALES).toContain('de')
  })

  it('is Germany’s survey language on the page and in the dispatcher (D-280)', () => {
    expect(surveyBaseOf('de')).toBe('de')
    expect(MARKET_SURVEY_BASE.de).toBe('de')
  })

  it('has its flag, which nobody has signed off: offered by a pilot until Tor approves the texts', () => {
    expect(FLAG_NAMES).toContain('locale_de')
    expect(SIGNED_OFF).not.toContain('locale_de')
  })
})

describe('the German package', () => {
  it('is an orgpuls-translations file for de with exactly the product’s own texts, every one a machine draft, each key once', () => {
    expect(pkg.format).toBe('json')
    expect(pkg.locale).toBe('de')
    expect(entries.map((e) => e.key).sort()).toEqual(catalogue.map((e) => e.key).sort())
    expect(entries.some((e) => e.section === 'module')).toBe(false)
    for (const e of entries) {
      expect(e.status, e.key).toBe('draft')
      expect(e.origin, e.key).toBe('machine')
      expect(e.target.trim(), e.key).not.toBe('')
    }
  })

  it('is made from the current bokmål and passes the import’s checks without a warning', () => {
    const checked = checkImport(pkg, catalogue, [], 'machine')
    // no error, and no warning either: a stale warning would mean a bokmål changed under the draft
    expect(checked.problems).toEqual([])
    expect(checked.untranslated).toBe(0)
    expect(checked.rows.length).toBe(catalogue.length)
  })

  it('is written as docs/translations/de.md asks: Sie, „…“, the spaced en dash, no GDA, no stray space', () => {
    const sources = new Map(entries.map((e) => [e.key, e.source]))
    expect(targets.some((t) => /[äöüß]/.test(t))).toBe(true)
    for (const e of entries) {
      const t = e.target
      expect(/[«»]/.test(t), `${e.key}: « »`).toBe(false)
      expect(/—/.test(t.replace(/„—“/g, '')), `${e.key}: em dash`).toBe(false)
      expect(/\s-\s/.test(t), `${e.key}: hyphen as a dash`).toBe(false)
      expect(/\b(du|dich|dir|dein|deine|deinen|deiner|deinem)\b/i.test(t), `${e.key}: du-form`).toBe(false)
      expect(/nach der GDA/i.test(t), `${e.key}: GDA`).toBe(false)
      expect(/ {2,}/.test(t), `${e.key}: double space`).toBe(false)
      // trailing whitespace only where the source has it (a mail body that ends in a blank line)
      expect(/\s$/.test(t), `${e.key}: trailing space`).toBe(/\s$/.test(sources.get(e.key)!))
      expect(/^\s/.test(t), `${e.key}: leading space`).toBe(false)
    }
  })

  it('keeps every SMS to one GSM-7 message', () => {
    const sms = entries.filter((e) => e.key.startsWith('mail:sms.'))
    expect(sms.length).toBeGreaterThan(0)
    for (const e of sms) {
      const n = smsLength(literalText(parseIcu(e.target)))
      expect(n.unicode, e.key).toBe(false)
      expect(n.parts, e.key).toBe(1)
    }
  })
})

describe('the modules’ German, by code with each module (D-263)', () => {
  it.each(MODULES)('%s: every factor, statement, count question, segment and wording has its German, and none is the bokmål', (key) => {
    const m = definition(key)
    const r = registry(key)
    expect(r.locale).toBe('de')
    expect(Object.keys(r.factors).sort()).toEqual(m.factors.map((f) => f.id).sort())
    expect(Object.keys(r.items).sort()).toEqual(m.factors.flatMap((f) => f.items.map((i) => i.id)).sort())
    expect(Object.keys(r.counts).sort()).toEqual(m.count_items.map((c) => c.id).sort())
    for (const c of m.count_items) expect(r.counts[c.id]!.options, c.id).toHaveLength(c.options.length)
    // a segment question is an item coded <prefix>-S-<id> (0090)
    const prefix = m.factors[0]!.items[0]!.id.slice(0, 2)
    expect(Object.keys(r.segments ?? {}).sort()).toEqual(m.segments.map((s) => `${prefix}-S-${s.id}`).sort())
    for (const s of m.segments) expect(r.segments![`${prefix}-S-${s.id}`]!.options, s.id).toHaveLength(s.options.length)
    // a worded module (0083): both wordings of every text that has them, and of a factor name
    const worded = [...m.factors.flatMap((f) => f.items), ...m.count_items].filter((x) => x.text_variants).map((x) => x.id)
    expect(Object.keys(r.variants ?? {}).sort()).toEqual(worded.sort())
    expect(Object.keys(r.factorVariants ?? {}).sort()).toEqual(m.factors.filter((f) => f.name_variants).map((f) => f.id).sort())
    // an instrument's scales and prefaces (0224) where the module has them
    const scaled = new Set(m.factors.flatMap((f) => f.items.filter((i) => i.scale).map((i) => i.scale!)))
    expect(Object.keys(r.scales ?? {}).sort()).toEqual([...scaled].sort())
    expect(Object.keys(r.prefaces ?? {}).sort()).toEqual(m.factors.flatMap((f) => f.items.filter((i) => i.preface).map((i) => i.id)).sort())
    // a translation, not the source (a one-word factor name may coincide: HSE's «Rolle» is «Rolle»)
    const nb = new Set([...m.factors.flatMap((f) => f.items.map((i) => i.text)), ...m.count_items.map((c) => c.text), ...m.segments.map((s) => s.text)])
    const german = [...Object.values(r.items), ...Object.values(r.counts).map((c) => c.text), ...Object.values(r.segments ?? {}).map((s) => s.text)]
    for (const t of german) expect(nb.has(t), t).toBe(false)
    expect([...german, ...Object.values(r.factors)].some((t) => /[äöüß]/.test(t))).toBe(true)
    expect(r.official).toBeUndefined()
  })

  it('ships in all seven published modules and in no other', () => {
    const withFile = readdirSync('modules').filter((k) => {
      try {
        return readdirSync(`modules/${k}/registry`).includes('de.json')
      } catch {
        return false
      }
    })
    expect(withFile.sort()).toEqual([...MODULES].sort())
  })
})
