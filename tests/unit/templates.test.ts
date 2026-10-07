import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { Blocks } from '@/lib/marketing/blocks'
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
