import { plain, wordCount, type Block, type FaqItem } from '@/lib/marketing/blocks'
import { placeholders, slugify, type Layout } from './content'

/**
 * A page's search score (X-094): the checks the editors of the large CMSs run beside the text
 * (Yoast and Rank Math in WordPress, HubSpot's SEO panel, Webflow's and Wix's SEO checklists),
 * reduced to the ones that hold for this site: a title and a description Google shows whole, the
 * focus keyword where it counts, enough text and structure to answer a search, links into the
 * rest of the site, questions and answers for a rich result, and nothing left unwritten.
 *
 * Pure: the editor runs it on every keystroke, the pages hub on every row, and a test pins it.
 * The score is a guide, not a gate: only an unfilled [placeholder] stops a page going live, and
 * the database decides that (app.cms_content_ready).
 */
export type SeoLevel = 'good' | 'warn' | 'bad'
export const SEO_CHECKS = [
  'title',
  'description',
  'h1',
  'keyword',
  'kwTitle',
  'kwH1',
  'kwDescription',
  'kwSlug',
  'kwLead',
  'length',
  'headings',
  'links',
  'faq',
  'sources',
  'placeholders',
  'slug',
  'index',
  'twin',
] as const
export type SeoCheckId = (typeof SEO_CHECKS)[number]
export type SeoCheck = { id: SeoCheckId; level: SeoLevel; n?: number }

/** Google shows about 60 characters of a title and 160 of a description before it cuts them */
export const TITLE_RANGE = [30, 60] as const
export const DESCRIPTION_RANGE = [120, 160] as const

const WEIGHT: Record<SeoCheckId, number> = {
  title: 2,
  description: 2,
  h1: 1,
  keyword: 1,
  kwTitle: 2,
  kwH1: 1,
  kwDescription: 1,
  kwSlug: 1,
  kwLead: 1,
  length: 2,
  headings: 1,
  links: 1,
  faq: 1,
  sources: 1,
  placeholders: 2,
  slug: 1,
  index: 1,
  twin: 1,
}

/** the words the page is long enough at, and half of it: an article answers more than a splash page does */
const LENGTH: Record<Layout | 'designed', number> = { article: 600, landing: 300, document: 250, splash: 80, designed: 300 }

export type SeoInput = {
  layout: Layout | 'designed'
  /** the page's address, without the leading slash or /artikler/ */
  slug: string
  keyword: string
  noindex: boolean
  /** the page is live, or being written, in the other language too: hreflang has a twin */
  twin: boolean
  title: string
  description: string
  /** a designed page: its address and its words are code, so the keyword and address checks do not apply */
  fixed?: boolean
  /** the body, where it is known: a designed page's body is code and is not scored */
  body?: { h1: string; lead: string; blocks: Block[]; faq: FaqItem[]; sources: { label: string; url: string }[]; raw: unknown }
}

const fold = (s: string) =>
  plain(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** the keyword as a phrase, or every word of it that carries meaning, in any order */
export function mentions(text: string, keyword: string): boolean {
  const k = fold(keyword)
  if (!k) return false
  const t = fold(text)
  if (t.includes(k)) return true
  const words = k.split(' ').filter((w) => w.length > 2)
  return words.length > 0 && words.every((w) => t.includes(w))
}

/** Links into the site: [label](/path) in any text, and every card of a links block */
export function internalLinks(blocks: Block[], lead = '', faq: FaqItem[] = []): number {
  const texts = [lead, ...faq.map((f) => f.a)]
  let n = 0
  for (const b of blocks) {
    if (b.t === 'links') n += b.items.length
    else texts.push(JSON.stringify(b))
  }
  for (const s of texts) n += (s.match(/\]\(\/[^)]*\)/g) ?? []).length
  return n
}

const ranged = (n: number, [lo, hi]: readonly [number, number]): SeoLevel => (n === 0 ? 'bad' : n < lo || n > hi ? 'warn' : 'good')

export function seoScore(p: SeoInput): { score: number; checks: SeoCheck[] } {
  const checks: SeoCheck[] = []
  const add = (id: SeoCheckId, level: SeoLevel, n?: number) => checks.push(n === undefined ? { id, level } : { id, level, n })
  const title = p.title.trim()
  const description = p.description.trim()
  const kw = p.keyword.trim()
  const b = p.body

  add('title', ranged(title.length, TITLE_RANGE), title.length)
  add('description', ranged(description.length, DESCRIPTION_RANGE), description.length)
  if (b) add('h1', b.h1.trim() ? 'good' : 'bad')

  if (!p.fixed) add('keyword', kw ? 'good' : 'warn')
  if (kw && !p.fixed) {
    add('kwTitle', mentions(title, kw) ? 'good' : 'warn')
    add('kwDescription', mentions(description, kw) ? 'good' : 'warn')
    const slugWords = slugify(kw).split('-').filter((w) => w.length > 2)
    add('kwSlug', slugWords.length > 0 && slugWords.every((w) => p.slug.includes(w)) ? 'good' : 'warn')
    if (b) {
      add('kwH1', mentions(b.h1, kw) ? 'good' : 'warn')
      add('kwLead', mentions(b.lead, kw) ? 'good' : 'warn')
    }
  }

  if (b) {
    const words = wordCount(b.blocks) + fold(b.lead).split(' ').filter(Boolean).length + b.faq.reduce((s, f) => s + fold(`${f.q} ${f.a}`).split(' ').filter(Boolean).length, 0)
    const need = LENGTH[p.layout]
    add('length', words >= need ? 'good' : words >= need / 2 ? 'warn' : 'bad', words)
    if (p.layout !== 'splash') {
      const h2 = b.blocks.filter((x) => x.t === 'h2').length
      add('headings', h2 >= 2 ? 'good' : h2 === 1 ? 'warn' : 'bad', h2)
      const links = internalLinks(b.blocks, b.lead, b.faq)
      add('links', links >= 2 ? 'good' : links === 1 ? 'warn' : 'bad', links)
    }
    if (p.layout === 'landing') add('faq', b.faq.length >= 2 ? 'good' : 'warn', b.faq.length)
    if (p.layout === 'article') add('sources', b.sources.length >= 1 ? 'good' : 'warn', b.sources.length)
    const left = placeholders(b.raw).length
    add('placeholders', left === 0 ? 'good' : 'bad', left)
  }

  const slugWords = p.slug.split('-').filter(Boolean).length
  if (p.slug && !p.fixed) add('slug', p.slug.length <= 60 && slugWords <= 6 ? 'good' : 'warn', p.slug.length)
  add('index', p.noindex ? 'warn' : 'good')
  add('twin', p.twin ? 'good' : 'warn')

  const total = checks.reduce((s, c) => s + WEIGHT[c.id], 0)
  const got = checks.reduce((s, c) => s + WEIGHT[c.id] * (c.level === 'good' ? 1 : c.level === 'warn' ? 0.5 : 0), 0)
  return { score: total ? Math.round((100 * got) / total) : 0, checks }
}

export const scoreTone = (score: number) => (score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red') as 'green' | 'yellow' | 'red'
