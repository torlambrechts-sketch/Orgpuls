import { describe, expect, it } from 'vitest'
import { canonical, legalUnits, LEGAL_SECTIONS, MESSAGE_SPECS } from '@/lib/legal/registry'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * The legal review's registry (D-130): every unit resolves, every key is one 0082 accepts and
 * appears once, and the hash follows the text, so an edit can never keep an old approval.
 */
const factors = [
  { key: 'ytring', lawRef: 'aml. § 4-3 · § 2A' },
  { key: 'medvirk', lawRef: 'aml. § 4-2' },
]
const units = legalUnits(factors)
const KEY = /^[A-Za-z0-9][A-Za-z0-9:._/@[\]-]*$/

describe('the legal review registry', () => {
  it('resolves every path it names, in both languages', () => {
    const broken = units.filter((u) => u.missing?.length).map((u) => `${u.key}: ${u.missing?.join(', ')}`)
    expect(broken).toEqual([])
  })

  it('gives every unit a key the database accepts, once, and some text', () => {
    const keys = units.map((u) => u.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const u of units) {
      expect(u.key).toMatch(KEY)
      expect(u.key.length).toBeLessThanOrEqual(200)
      expect(u.hash).toMatch(/^[0-9a-f]{64}$/)
      expect(u.lines.length, u.key).toBeGreaterThan(0)
    }
  })

  it('covers every section, both languages of each message spec, and each industry law item', () => {
    for (const s of LEGAL_SECTIONS) expect(units.some((u) => u.section === s), s).toBe(true)
    for (const s of MESSAGE_SPECS) {
      for (const lang of s.langs ?? ['no', 'en']) expect(units.some((u) => u.key === `msg:${lang}:${s.id}`), `${lang} ${s.id}`).toBe(true)
    }
    expect(units.filter((u) => /^industry:bygg-og-anlegg:no:law:/.test(u.key))).toHaveLength(6)
    expect(units.filter((u) => /^industry:helse-og-omsorg:no:law:/.test(u.key))).toHaveLength(7)
    expect(units.find((u) => u.key === 'doc:terms-draft:no')?.lines.length).toBeGreaterThan(10)
  })

  it('hashes the text it shows, so a changed word is a changed hash', () => {
    const u = units.find((x) => x.key === 'db:no:factors.law_ref')!
    const again = legalUnits([{ ...factors[0]!, lawRef: 'aml. § 4-3' }, factors[1]!]).find((x) => x.key === u.key)!
    expect(again.hash).not.toBe(u.hash)
    expect(canonical([{ path: 'a', text: 'b' }])).toBe('a\nb')
  })

  it('marks what is published: the launched industry pages in both languages (X-078)', () => {
    expect(units.find((u) => u.key.startsWith('industry:helse-og-omsorg:no:law:'))?.live).toBe(true)
    expect(units.find((u) => u.key.startsWith('industry:helse-og-omsorg:en:law:'))?.live).toBe(true)
    // the landing page is what the address shows only where the industry page is not launched
    expect(units.find((u) => u.key === 'msg:no:lp.helseOgOmsorg')?.live).toBe(false)
    expect(units.find((u) => u.key === 'msg:en:lp.helseOgOmsorg')?.live).toBe(false)
  })
})

describe('the English approval shows what it approves', () => {
  it('computes the same page-string hash as scripts/i18n/respondent-ui.mjs', async () => {
    const { respondentHash, respondentLines } = await import('@/lib/i18n/respondent-strings')
    const en = (await import('@/messages/en.json')).default as Record<string, unknown>
    const ui = (await import('@/lib/i18n/respondent-ui.json')).default as Record<string, string>
    expect(respondentHash(en)).toBe(ui.en)
    expect(respondentLines(en).length).toBeGreaterThan(50)
  })

  it('keys a law item by its reference, so moving it keeps the approval', () => {
    const helse = units.filter((u) => u.key.startsWith('industry:helse-og-omsorg:no:law:'))
    for (const u of helse) expect(u.lines.map((l) => l.path)).toEqual(['law.ref', 'law.text'])
  })

  it('marks a source that yielded nothing as broken, never as an empty text to approve', () => {
    const none = legalUnits([]).find((u) => u.key === 'db:no:factors.law_ref')!
    expect(none.missing?.length).toBeGreaterThan(0)
  })

  it('marks a module live only when a version of it is published, and keys it by the module, not the version', () => {
    expect(units.find((u) => u.key.startsWith('module:helse-og-omsorg:no:'))?.live).toBe(false)
    const withDb = legalUnits({ factors, publishedModules: new Set(['helse-og-omsorg']) })
    expect(withDb.find((u) => u.key.startsWith('module:helse-og-omsorg:no:'))?.live).toBe(true)
    expect(units.some((u) => /^module:[^:]+@/.test(u.key))).toBe(false)
  })
})

describe('nothing stating law is left out of the review', () => {
  // every string, with the path the registry gives its lines
  const strings = (v: unknown, path: string, out: { path: string; text: string }[]) => {
    if (typeof v === 'string') out.push({ path, text: v })
    else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, path ? `${path}.${k}` : k, out)
    return out
  }
  /**
   * Not texts anyone outside the team reads: the admin app's own help (the one legal reading it
   * acts on, the CRM's basis, is reviewed), and the page-template blocks /plattform, /bruksomrader
   * and /priser do not render (lib/legal/registry.ts' header).
   */
  const UNRENDERED = /^seo\.pages\.(plattform|bruksomrader)\.(blocks|lead)|^seo\.pages\.priser\.blocks/
  // the admin app renders messages/en.json only, so its Norwegian copy is never read
  const NOT_PUBLISHED = { no: [/^admin\./, UNRENDERED], en: [/^admin\.(?!crm\.settings\.)/, UNRENDERED] }

  it('covers every message that cites a section of a law, in both files', () => {
    const all = legalUnits({ factors, crmTemplates: [], crmLists: [] })
    for (const [lang, messages] of [['no', no], ['en', en]] as const) {
      const covered = new Set(all.filter((u) => u.key.startsWith(`msg:${lang}:`)).flatMap((u) => u.lines.map((l) => l.path)))
      const left = strings(messages, '', [])
        .filter((l) => l.text.includes('§') && !covered.has(l.path) && !NOT_PUBLISHED[lang].some((r) => r.test(l.path)))
        .map((l) => l.path)
      expect(left, `${lang}: add these to MESSAGE_SPECS`).toEqual([])
    }
    // the one legal reading in the admin app, by name
    const basis = all.find((u) => u.key === 'msg:en:admin.crmBasis')
    expect(basis?.lines.map((l) => l.path)).toContain('admin.crm.settings.lead')
  })

  it('shows no CRM lists unit when every list is archived, rather than a broken one', () => {
    const list = { key: 'l', name_no: 'N', name_en: 'N', description_no: 'D', description_en: 'D', public: true }
    const units = legalUnits({ factors, crmLists: [{ ...list, archived: true }] })
    expect(units.filter((u) => u.key.includes('crm_lists'))).toEqual([])
    const live = legalUnits({ factors, crmLists: [{ ...list, archived: false }] })
    expect(live.filter((u) => u.key.includes('crm_lists') && !u.missing)).toHaveLength(2)
  })

  it('leaves the instrument out when its read failed, rather than showing it broken', () => {
    expect(legalUnits({ factors: null }).some((u) => u.key === 'db:no:factors.law_ref')).toBe(false)
  })

  it('names every unit and its place with a message the admin page has', () => {
    const all = legalUnits({
      factors,
      crmTemplates: [{ key: 't', name: 'T', subject: 'S', preheader: 'P', blocks: [] }],
      crmLists: [{ key: 'l', name_no: 'N', name_en: 'N', description_no: 'D', description_en: 'D', public: true, archived: false }],
    })
    const at = (m: unknown, key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], m)
    for (const messages of [no, en]) {
      const legal = (messages as { admin: { legal: unknown } }).admin.legal
      for (const u of all) {
        expect(typeof at(legal, `unit.${u.title.key}`), `unit.${u.title.key}`).toBe('string')
        expect(typeof at(legal, `whereAt.${u.where.key}`), `whereAt.${u.where.key}`).toBe('string')
      }
    }
  })
})
