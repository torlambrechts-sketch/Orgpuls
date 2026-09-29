import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { INDUSTRIES } from '@/content/industries'
import { parseContent, pathOf, placeholders, slugify } from '@/lib/cms/content'
import { designedPages } from '@/lib/cms/designed'
import { internalLinks, mentions, seoScore, type SeoInput } from '@/lib/cms/seo'
import { ARTICLES } from '@/lib/marketing/site'
import no from '@/messages/no.json'
import en from '@/messages/en.json'

/** The CMS (0114, X-094): its content, its search score, and the addresses it may not take. */
const migration = readFileSync('supabase/migrations/0114_cms.sql', 'utf8')

/** the slugs app.cms_reserved lists for one kind */
function reserved(kind: 'page' | 'article'): string[] {
  const body = migration.slice(migration.indexOf('create function app.cms_reserved'))
  const start = body.indexOf(`when '${kind}' then p_slug = any (array[`)
  const list = body.slice(start, body.indexOf('])', start))
  return [...list.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!).filter((s) => s !== kind)
}

const dirs = (p: string) =>
  readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('(') && !d.name.startsWith('['))
    .map((d) => d.name)

describe('CMS addresses (app.cms_reserved)', () => {
  it('reserves every route the site and the app own', () => {
    const own = new Set(reserved('page'))
    const routes = [...dirs('app'), ...dirs('app/(marketing)'), ...dirs('app/(app)'), ...INDUSTRIES.map((i) => i.slug)]
    const redirects = [...readFileSync('next.config.ts', 'utf8').matchAll(/source: '\/([a-z0-9-]+)'/g)].map((m) => m[1]!)
    expect([...routes, ...redirects].filter((r) => !own.has(r))).toEqual([])
  })

  it('lets a signed-out reader reach a CMS address, and keeps every screen of the product behind the sign-in', () => {
    const src = readFileSync('lib/supabase/middleware.ts', 'utf8')
    const roots = [...(src.match(/export const APP_ROOTS = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!)
    expect(roots.sort()).toEqual([...dirs('app/(app)'), 'admin', 'api'].sort())
  })

  it('reserves every coded article', () => {
    expect(ARTICLES.map((a) => a.slug).filter((s) => !reserved('article').includes(s))).toEqual([])
  })
})

describe('CMS content', () => {
  it('finds a placeholder the author has still to write, also one holding a link', () => {
    expect(placeholders({ h1: '[Overskrift]', blocks: [{ t: 'p', text: 'Les [lovkravet](/lovkrav) og [mer om [lovkravet](/lovkrav)]' }] })).toEqual([
      '[Overskrift]',
      '[mer om lovkravet]',
    ])
    expect(placeholders({ lead: 'Se [lovkravet](/lovkrav).' })).toEqual([])
  })

  it('drops a malformed block and keeps the rest', () => {
    const c = parseContent({ title: 'T', blocks: [{ t: 'h2', text: 'A' }, { t: 'nope' }, { t: 'ul', items: [] }, { t: 'p', text: 'B' }] })
    expect(c?.blocks).toEqual([
      { t: 'h2', text: 'A' },
      { t: 'p', text: 'B' },
    ])
  })

  it('makes an address from a Norwegian title', () => {
    expect(slugify('Kartlegging av arbeidsmiljø – 2026!')).toBe('kartlegging-av-arbeidsmiljo-2026')
    expect(slugify('Små bedrifter & ære')).toBe('sma-bedrifter-aere')
    expect(pathOf('article', 'x')).toBe('/artikler/x')
    expect(pathOf('page', 'x')).toBe('/x')
  })
})

describe('search score', () => {
  const base: SeoInput = {
    layout: 'landing',
    slug: 'kartlegging-arbeidsmiljo',
    keyword: 'kartlegging arbeidsmiljø',
    noindex: false,
    twin: true,
    title: 'Kartlegging av arbeidsmiljø – slik gjør dere det | Orgpuls',
    description: 'Kartlegging av arbeidsmiljø etter arbeidsmiljøloven § 4-3: spørsmålene, rapporten og tiltakene, anonymt og ferdig på en time.',
    body: {
      h1: 'Kartlegging av arbeidsmiljø uten ekstra arbeid',
      lead: 'Kartlegging av arbeidsmiljø er et lovkrav.',
      blocks: [
        { t: 'h2', text: 'Hvorfor' },
        { t: 'p', text: `${'ord '.repeat(320)} Les [lovkravet](/lovkrav).` },
        { t: 'h2', text: 'Slik' },
        { t: 'links', items: [{ title: 'Priser', text: 'Se prisene', href: '/priser' }] },
      ],
      faq: [
        { q: 'Må vi?', a: 'Ja.' },
        { q: 'Hvor ofte?', a: 'Hvert år.' },
      ],
      sources: [],
      raw: {},
    },
  }

  it('gives a page that does everything right a full score', () => {
    const s = seoScore(base)
    expect(s.checks.filter((c) => c.level !== 'good')).toEqual([])
    expect(s.score).toBe(100)
  })

  it('names what is wrong, and a placeholder is the worst of it', () => {
    const s = seoScore({ ...base, title: 'Kort', keyword: 'sykefravær', noindex: true, twin: false, body: { ...base.body!, raw: { h1: '[Overskrift]' } } })
    const level = Object.fromEntries(s.checks.map((c) => [c.id, c.level]))
    expect(level).toMatchObject({ title: 'warn', kwTitle: 'warn', kwH1: 'warn', placeholders: 'bad', index: 'warn', twin: 'warn' })
    expect(s.score).toBeLessThan(70)
  })

  it('does not mark a designed page down for what only code can change', () => {
    const s = seoScore({ layout: 'designed', fixed: true, slug: 'priser', keyword: '', noindex: false, twin: true, title: base.title, description: base.description })
    expect(s.checks.map((c) => c.id)).toEqual(['title', 'description', 'index', 'twin'])
    expect(s.score).toBe(100)
  })

  it('reads a keyword across inflection-free word order and marks', () => {
    expect(mentions('**Arbeidsmiljø**: kartlegging for små bedrifter', 'kartlegging arbeidsmiljø')).toBe(true)
    expect(mentions('Medarbeiderundersøkelse', 'kartlegging')).toBe(false)
    expect(internalLinks([{ t: 'p', text: '[a](/a) og [b](https://x.no)' }, { t: 'links', items: [{ title: 'x', text: 'y', href: '/b' }] }])).toBe(2)
  })
})

describe('designed pages in the hub', () => {
  it('lists each page once, with metadata keys that exist in both languages', () => {
    const pages = designedPages()
    expect(new Set(pages.map((p) => p.path)).size).toBe(pages.length)
    const has = (m: unknown, key: string) => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), m) !== undefined
    for (const p of pages.filter((x) => x.title)) {
      for (const m of [no, en]) {
        expect(has(m, p.title!), p.title).toBe(true)
        expect(has(m, p.description!), p.description).toBe(true)
      }
    }
  })
})
