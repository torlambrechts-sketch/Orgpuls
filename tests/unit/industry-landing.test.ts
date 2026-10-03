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
      expect(readFileSync(`docs/marketing/${l.slug}-sources.md`, 'utf8')).toContain('hentet 2026-10-03')
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

    it(`${l.slug}: pictures, articles and the v3 chrome`, () => {
      for (const s of [l.heroShot, ...l.proof]) expect(SHOT_IDS).toContain(s)
      for (const a of l.articles) expect(ARTICLES.some((x) => x.slug === a), a).toBe(true)
      expect(isV3Route(`/${l.slug}`)).toBe(true)
    })

    it(`${l.slug}: an English page waits for the module's English translation (D-120)`, () => {
      if (l.live.en) expect(moduleFile(l.module).translations?.en).toBeDefined()
    })
  }

  it('leaves the other industries on their own template, and the five v3 pages as they were', () => {
    expect(isV3Route('/bygg-og-anlegg')).toBe(false)
    expect(isV3Route('/handel/sporsmal')).toBe(false)
    for (const r of ['/', '/plattform', '/bruksomrader', '/bransjer', '/priser']) expect(isV3Route(r)).toBe(true)
  })
})
