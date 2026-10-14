import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { Blocks, FaqItems } from '@/lib/marketing/blocks'
import { QPS, qpsGroups } from '@/lib/marketing/qpsnordic'
import { granted, grantFor, TEMPLATES, templateBySlug } from '@/lib/marketing/templates'
import en from '@/messages/en.json'
import no from '@/messages/no.json'

/**
 * The free templates (D-241): every template has its words in both languages and its files on disk,
 * the index links each of them, and the cookie opens only what was asked for.
 */
type Words = Record<string, unknown>
const at = (cat: Words, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o as Words | undefined)?.[k], cat)

describe('free templates', () => {
  it('have unique slugs a database key may hold', () => {
    expect(new Set(TEMPLATES.map((t) => t.slug)).size).toBe(TEMPLATES.length)
    for (const t of TEMPLATES) expect(t.slug).toMatch(/^[a-z0-9-]{3,80}$/)
  })

  for (const t of TEMPLATES) {
    it(`${t.slug}: words in both languages, a label per file, and the files built`, () => {
      for (const cat of [no, en] as Words[]) {
        for (const k of ['title', 'description', 'crumb', 'kicker', 'h1', 'lead']) expect(at(cat, `seo.maler.${t.key}.${k}`), k).toEqual(expect.any(String))
        expect((at(cat, `seo.maler.${t.key}.description`) as string).length).toBeLessThanOrEqual(155)
        expect(() => Blocks.parse(at(cat, `seo.maler.${t.key}.blocks`))).not.toThrow()
        for (const f of t.files) expect(at(cat, `seo.maler.${t.key}.files`) as Record<string, string>, f.name).toHaveProperty([f.name])
      }
      for (const f of t.files) expect(existsSync(`private/maler/${f.name}`), f.name).toBe(true)
    })
  }

  it('are each linked from the index, in both languages', () => {
    for (const cat of [no, en] as Words[]) {
      const blocks = Blocks.parse(at(cat, 'seo.maler.index.blocks'))
      const hrefs = blocks.flatMap((b) => (b.t === 'links' ? b.items.map((i) => i.href) : []))
      for (const t of TEMPLATES) expect(hrefs).toContain(`/maler/${t.slug}`)
    }
  })

  it('open a file only to a browser that asked for a template holding it', () => {
    const risk = templateBySlug('risikovurdering-psykososialt-arbeidsmiljo')!
    const file = risk.files[0]!.name
    expect(granted('risikovurdering-psykososialt-arbeidsmiljo,../../etc,ukjent')).toEqual(['risikovurdering-psykososialt-arbeidsmiljo'])
    expect(grantFor(file, granted('risikovurdering-psykososialt-arbeidsmiljo'))?.slug).toBe(risk.slug)
    expect(grantFor(file, granted('tiltaksbank'))).toBeNull()
    expect(grantFor(file, granted(undefined))).toBeNull()
    expect(grantFor('../../.env', granted(TEMPLATES.map((t) => t.slug).join(',')))).toBeNull()
  })
})

/** a heading that asks: ends in «?» or opens with a question word (D-282's rule), in either language */
const ASKS = /\?$|^(hva|hvordan|hvilke[nt]?|når|er|hvor|hvem|hvorfor|må|kan|bør|trenger|finnes|what|how|when|is|are|where|who|why|must|can|may|should|do|does|which)\b/i

/**
 * The QPSNordic 34+ page (D-283): the items it shows are the file the template's files are built from
 * (X-107, verbatim), what it says about them is true of them, and its sections ask what readers ask.
 */
describe('the QPSNordic 34+ page (D-283)', () => {
  type QpsPage = { blocks: unknown; faq: unknown; table: Record<string, string> }
  const page = (cat: Words) => at(cat, 'seo.maler.qps') as QpsPage

  it('draws the items from the file: 37 in order, seven background questions, every scale five options', () => {
    expect(QPS.items.map((i) => i.n)).toEqual(Array.from({ length: 37 }, (_, i) => i + 1))
    expect(QPS.background).toHaveLength(7)
    for (const s of Object.values(QPS.scales)) expect(s).toHaveLength(5)
    for (const i of QPS.items) expect(QPS.scales, `item ${i.n}`).toHaveProperty([i.scale])
    // 34 carry their number in the full QPSNordic and the last three carry none: what the page says of them
    expect(QPS.items.filter((i) => i.qps).map((i) => i.n)).toEqual(Array.from({ length: 34 }, (_, i) => i + 1))
    // six groups by answer scale, as the page announces them
    expect(qpsGroups().map((g) => g.items.length)).toEqual([21, 5, 4, 4, 2, 1])
  })

  it('says of the items only what they hold', () => {
    // no item asks about emotional demands, harassment, or violence and threats (the chapter 1A section)
    for (const i of QPS.items) expect(`${i.lead ?? ''} ${i.text}`, `item ${i.n}`).not.toMatch(/emosjon|trakass|vold|trusl/i)
    // and the ones the page cites for a factor are the ones it names
    const text = (n: number) => QPS.items.find((i) => i.n === n)!.text
    expect(text(2)).toMatch(/for mye å gjøre/)
    expect(text(9)).toMatch(/motstridende/)
    expect(text(17)).toMatch(/kollegaer/)
    expect(text(18)).toMatch(/nærmeste sjef/)
    expect(text(29)).toMatch(/kommunikasjon/)
    expect(text(30)).toMatch(/konflikter/)
  })

  for (const [lang, cat] of [
    ['no', no],
    ['en', en],
  ] as const) {
    it(`${lang}: every section but the sources asks, the items are drawn once, the FAQ parses and asks, the table has its labels`, () => {
      const p = page(cat as Words)
      const blocks = Blocks.parse(p.blocks)
      const h2 = blocks.flatMap((b) => (b.t === 'h2' ? [b.text] : []))
      expect(h2.length).toBeGreaterThanOrEqual(7)
      for (const h of h2.slice(0, -1)) expect(h, h).toMatch(ASKS)
      expect(blocks.filter((b) => b.t === 'qps')).toHaveLength(1)
      const faq = FaqItems.parse(p.faq)
      expect(faq.length).toBeGreaterThanOrEqual(5)
      for (const f of faq) expect(f.q).toMatch(/\?$/)
      for (const k of ['background', 'answers', 'n', 'text', 'qps', 'none']) expect(p.table[k], k).toEqual(expect.any(String))
    })
  }

  it('answers alike in both languages: the same block kinds in the same order, as many questions', () => {
    expect(Blocks.parse(page(no as Words).blocks).map((b) => b.t)).toEqual(Blocks.parse(page(en as Words).blocks).map((b) => b.t))
    expect(FaqItems.parse(page(no as Words).faq)).toHaveLength(FaqItems.parse(page(en as Words).faq).length)
  })
})
