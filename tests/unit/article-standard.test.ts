import { describe, expect, it } from 'vitest'
import { Blocks, Sources } from '@/lib/marketing/blocks'
import { ARTICLES } from '@/lib/marketing/site'
import { allText, DIAGRAM_KINDS, GENDERED, lix, longSentences, ownUnits, unexplainedAbbreviations } from '@/lib/marketing/readability'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * The article standard (D-287), on every article in both languages: it draws as well as tells, it reads
 * like a newspaper rather than a regulation, it spells its abbreviations out, it addresses the reader
 * without gendered pairs, its H1 asks, its metadata fits, and its English mirrors its Norwegian block for
 * block. D-282 holds the rest: sections that ask, sources, answer capsules, titles on the whole site.
 */
type Raw = { title: string; description: string; h1: string; lead: string; blocks: unknown; sources: unknown }
const LANGS = [
  ['no', no],
  ['en', en],
] as const
const raw = (m: typeof no, key: string): Raw => {
  const a = (m.seo.articles as unknown as Record<string, Raw>)[key]
  if (!a) throw new Error(`no article ${key}`)
  return a
}
const article = (m: typeof no, key: string) => {
  const a = raw(m, key)
  return { ...a, blocks: Blocks.parse(a.blocks), sources: Sources.parse(a.sources) }
}
const clean = (s: string) => s.replace(/­/g, '').trim()

describe('the article standard (D-287): every article, both languages', () => {
  it('has a picture of its own and draws at least one diagram: a table, cards, a timeline, a cycle, a hub or a ladder', () => {
    for (const a of ARTICLES) {
      expect(a.art, a.slug).toMatch(/^(law|rep|risk|board|meeting|survey|wheel|anon|factor:[a-z]+)$/)
      for (const [lang, m] of LANGS) {
        const kinds = article(m, a.key).blocks.map((b) => b.t)
        expect(kinds.some((k) => DIAGRAM_KINDS.has(k)), `${a.slug} ${lang}: ${kinds.join(',')}`).toBe(true)
      }
    }
  })

  it('reads at LIX 50 or under in Norwegian, with no sentence of our own over 40 words in either language', () => {
    for (const a of ARTICLES) {
      for (const [lang, m] of LANGS) {
        const own = ownUnits(article(m, a.key))
        const long = longSentences(own, 40)
        expect(long, `${a.slug} ${lang}: ${long[0]?.slice(0, 80)}`).toEqual([])
        if (lang === 'no') expect(lix(own).lix, `${a.slug}: LIX`).toBeLessThanOrEqual(50)
      }
    }
  })

  it('spells an abbreviation out before it uses it, and uses no gendered pair', () => {
    for (const a of ARTICLES) {
      for (const [lang, m] of LANGS) {
        const text = allText(article(m, a.key))
        expect(unexplainedAbbreviations(text, lang), `${a.slug} ${lang}`).toEqual([])
        expect(text.match(GENDERED)?.[0], `${a.slug} ${lang}`).toBeUndefined()
      }
    }
  })

  it('asks in its H1, and keeps its title within 65, its description within 155 and its lead within 520 characters', () => {
    for (const a of ARTICLES) {
      for (const [lang, m] of LANGS) {
        const x = raw(m, a.key)
        expect(clean(x.h1), `${a.slug} ${lang}`).toMatch(/\?$/)
        expect([...x.title].length, `${a.slug} ${lang} title`).toBeLessThanOrEqual(65)
        expect([...x.description].length, `${a.slug} ${lang} description`).toBeLessThanOrEqual(155)
        expect([...x.lead].length, `${a.slug} ${lang} lead`).toBeLessThanOrEqual(520)
      }
    }
  })

  it('carries the same blocks in the same order in Norwegian and English, so a diagram is never missing from one language', () => {
    for (const a of ARTICLES) {
      const kinds = (m: typeof no) => article(m, a.key).blocks.map((b) => b.t).join(',')
      expect(kinds(en), a.slug).toBe(kinds(no))
    }
  })

  it('cites at least three sources with addresses, points to two related articles that exist, and dates its last change', () => {
    const slugs = new Set(ARTICLES.map((a) => a.slug))
    for (const a of ARTICLES) {
      for (const [lang, m] of LANGS) {
        const s = article(m, a.key).sources
        expect(s.length, `${a.slug} ${lang}`).toBeGreaterThanOrEqual(3)
        for (const x of s) expect(x.url, `${a.slug} ${lang}: ${x.label}`).toMatch(/^https?:\/\//)
      }
      expect(a.related.length, a.slug).toBeGreaterThanOrEqual(2)
      for (const r of a.related) expect(slugs.has(r), `${a.slug} → ${r}`).toBe(true)
      expect(a.modified, a.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(a.modified >= a.published, `${a.slug}: modified before published`).toBe(true)
    }
  })
})
