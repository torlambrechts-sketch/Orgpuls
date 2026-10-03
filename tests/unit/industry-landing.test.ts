import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { getIndustry } from '@/content/industries'
import { citedKeys, LANDINGS } from '@/content/industries/landing'
import { MODULE_KEYS, moduleFile } from '@/content/industries/modules'
import { ARTICLES } from '@/lib/marketing/site'
import { SHOT_IDS } from '@/lib/marketing/shot-ids'
import { isV3Route } from '@/lib/site/nav'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * The industry landing template (D-207): the registry and the messages describe the same page in
 * both languages, every figure has a source and every source is cited, the module factors the page
 * names are the module file's, and an English page waits for the module's English translation.
 */
type Words = Record<string, unknown>
const at = (cat: Words, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o as Words | undefined)?.[k], cat)
const arr = (cat: Words, path: string) => at(cat, path) as unknown[]

describe('industry landing pages', () => {
  for (const l of LANDINGS) {
    const base = `site.bransje.${l.msg}`

    it(`${l.slug}: the messages are as long as the registry, in both languages`, () => {
      for (const cat of [no, en] as Words[]) {
        expect(arr(cat, `${base}.stats.items`)).toHaveLength(l.stats.items.length)
        expect(arr(cat, `${base}.why.cost.items`)).toHaveLength(l.why.costCites.length)
        expect(arr(cat, `${base}.challenges.items`)).toHaveLength(l.challenges.length)
        expect(arr(cat, `${base}.proof.blocks`)).toHaveLength(l.proof.length)
        expect(arr(cat, `${base}.faq.items`)).toHaveLength(l.faqCount)
        expect(arr(cat, `${base}.hero.tiles`)).toHaveLength(3)
        for (const r of l.related) expect(at(cat, `${base}.related.${r.key}`), r.key).toEqual(expect.any(String))
      }
    })

    it(`${l.slug}: every figure has a source, every source is cited and titled`, () => {
      const keys = new Set(l.sources.map((s) => s.key))
      expect(keys.size).toBe(l.sources.length)
      const cited = citedKeys(l)
      for (const k of cited) expect(keys.has(k), `cited ${k}`).toBe(true)
      for (const s of l.sources) {
        expect(cited, `uncited ${s.key}`).toContain(s.key)
        expect(s.url).toMatch(/^https:\/\//)
        expect(s.year).toMatch(/^\d{4}$/)
        for (const cat of [no, en] as Words[]) expect(at(cat, `${base}.sources.${s.key}`), s.key).toEqual(expect.any(String))
      }
      // every challenge's figure line and every stat names a source
      for (const c of l.challenges) expect(c.cites.length).toBeGreaterThan(0)
      for (const s of l.stats.items) expect(s.length).toBeGreaterThan(0)
      // and the record of them exists
      expect(readFileSync(`docs/marketing/${l.msg}-sources.md`, 'utf8')).toContain('hentet 2026-10-03')
    })

    it(`${l.slug}: the factors it names are the module's and the instrument's`, () => {
      expect(MODULE_KEYS).toContain(l.module)
      expect(getIndustry(l.slug)).not.toBeNull()
      const mod = moduleFile(l.module)
      const names = at(no as Words, `${base}.moduleFactors`) as Record<string, string>
      const namesEn = at(en as Words, `${base}.moduleFactors`) as Record<string, string>
      for (const c of l.challenges) {
        for (const id of c.module) {
          const f = mod.factors.find((x) => x.id === id)
          expect(f, id).toBeDefined()
          // the Norwegian name is the file's, so a renamed factor fails here rather than drifting
          expect(names[id]).toBe(f!.name)
          expect(namesEn[id]).toEqual(expect.any(String))
        }
        for (const id of c.core) {
          expect((no as Words & { factor: Record<string, { label?: string }> }).factor[id]?.label, id).toBeTruthy()
          expect((en as Words & { factor: Record<string, { label?: string }> }).factor[id]?.label, id).toBeTruthy()
        }
      }
    })

    it(`${l.slug}: every module factor name in the messages is the file's, and the variants block has its picks`, () => {
      const mod = moduleFile(l.module)
      const fileNames = new Map([...mod.factors, ...(mod.variants?.[0].factors ?? [])].map((f) => [f.id, f.name]))
      const names = at(no as Words, `${base}.moduleFactors`) as Record<string, string>
      const namesEn = at(en as Words, `${base}.moduleFactors`) as Record<string, string>
      for (const [id, name] of Object.entries(names)) {
        expect(fileNames.get(id), id).toBe(name)
        expect(namesEn[id], id).toEqual(expect.any(String))
      }
      // D-212: a module in two variants may show both; the picks are extended factors of the file
      if (!l.variants) return
      expect(mod.variants).toBeDefined()
      for (const cat of [no, en] as Words[]) expect(arr(cat, `${base}.variants.picks.items`)).toHaveLength(l.variants.picks.length)
      for (const id of l.variants.picks.flat()) expect(mod.factors.some((f) => f.id === id), id).toBe(true)
    })

    it(`${l.slug}: pictures, articles and the v3 chrome`, () => {
      for (const s of [l.heroShot, ...l.proof]) expect(SHOT_IDS).toContain(s)
      for (const a of l.articles) expect(ARTICLES.some((x) => x.slug === a), a).toBe(true)
      expect(isV3Route(`/${l.slug}`)).toBe(true)
    })

    it(`${l.slug}: a label names every audience it marks, and a worded module offers each wording (D-211)`, () => {
      for (const cat of [no, en] as Words[]) {
        for (const c of l.challenges) if (c.audience) expect(at(cat, `${base}.audience.${c.audience}`), c.audience).toEqual(expect.any(String))
      }
      const wording = moduleFile(l.module).wording
      if (!l.wording) return
      // the example is one of the module's statements, said in every wording the page links to
      expect(wording).toBeDefined()
      const item = moduleFile(l.module).factors.flatMap((f) => f.items).find((i) => i.id === l.wording?.example)
      expect(item?.text_variants, l.wording.example).toBeDefined()
      for (const w of wording!.modes.filter((m) => m !== wording!.default && m !== 'begge')) {
        expect(item?.text_variants?.[w as 'barnehage' | 'skole']).toEqual(expect.any(String))
        for (const cat of [no, en] as Words[]) {
          expect(at(cat, `${base}.wording.items.${w}.t`), w).toEqual(expect.any(String))
          expect(at(cat, `${base}.wording.items.${w}.link`), w).toEqual(expect.any(String))
        }
      }
    })

    it(`${l.slug}: an English page waits for the module's English translation (D-120)`, () => {
      if (l.live.en) expect(moduleFile(l.module).translations?.en).toBeDefined()
    })

    it(`${l.slug}: the English module factor names are the translation's`, () => {
      const tr = moduleFile(l.module).translations?.en
      if (!tr) return
      const namesEn = at(en as Words, `${base}.moduleFactors`) as Record<string, string>
      // every factor the page names, a simplified one too: what an English respondent reads above the statements
      for (const [id, name] of Object.entries(namesEn)) expect(name, id).toBe(tr.factors[id]?.name ?? tr.variants?.forenklet.factors[id]?.name)
    })
  }

  it('puts every industry page in the v3 chrome and its question page outside it, and the five v3 pages as they were (D-213)', () => {
    for (const l of LANDINGS) {
      expect(isV3Route(`/${l.slug}`), l.slug).toBe(true)
      expect(isV3Route(`/${l.slug}/sporsmal`), l.slug).toBe(false)
    }
    expect(LANDINGS).toHaveLength(5)
    for (const r of ['/', '/plattform', '/bruksomrader', '/bransjer', '/priser']) expect(isV3Route(r)).toBe(true)
  })

  it('is live in both languages for every industry (D-214)', () => {
    for (const l of LANDINGS) expect(l.live, l.slug).toEqual({ no: true, en: true })
  })
})
