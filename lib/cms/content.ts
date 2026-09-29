import { z } from 'zod'
import { Block, FaqItems } from '@/lib/marketing/blocks'
import { SHOT_IDS } from '@/lib/marketing/shot-ids'

/**
 * A CMS page's words in one language (0114, X-094): the same fields the site's designed pages
 * are made of (components/marketing/PageView, ArticleView) and the same blocks
 * (lib/marketing/blocks). The database checks the shape on every write (app.cms_content_ok); this
 * parses it again on every read, so a page never renders from a cast.
 *
 * Pure: the public site, the admin's editor and the SEO score import it.
 */
export const CmsContent = z.object({
  title: z.string().default(''),
  description: z.string().default(''),
  crumb: z.string().default(''),
  kicker: z.string().default(''),
  h1: z.string().default(''),
  lead: z.string().default(''),
  signupLabel: z.string().optional(),
  blocks: z.array(z.unknown()).default([]),
  faq: FaqItems.default([]),
  finalTitle: z.string().optional(),
  finalBody: z.string().optional(),
  sources: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
})
export type CmsContent = Omit<z.infer<typeof CmsContent>, 'blocks'> & { blocks: Block[] }

/** Parses content, keeping every block that is well formed: one bad block never takes the page down */
export function parseContent(raw: unknown): CmsContent | null {
  const r = CmsContent.safeParse(raw)
  if (!r.success) return null
  const blocks = r.data.blocks.flatMap((b) => {
    const p = Block.safeParse(b)
    return p.success ? [p.data] : []
  })
  return { ...r.data, blocks }
}

export const LAYOUTS = ['landing', 'splash', 'document', 'article'] as const
export type Layout = (typeof LAYOUTS)[number]
export const CMS_KINDS = ['page', 'article'] as const
export type CmsKind = (typeof CMS_KINDS)[number]
/** the site's languages, each page written in one or both */
export const CMS_LOCALES = ['no', 'en'] as const
export type CmsLocale = (typeof CMS_LOCALES)[number]
/** a language's words: written in it (source), a translation in progress (draft), or one that has been checked */
export const TRANSLATION_STATES = ['source', 'draft', 'reviewed'] as const

/** What cms_page and cms_preview return */
export const CmsPublic = z.object({
  id: z.string(),
  kind: z.enum(CMS_KINDS),
  slug: z.string(),
  template: z.string(),
  layout: z.enum(LAYOUTS),
  noindex: z.boolean(),
  shot: z.enum(SHOT_IDS).nullable(),
  content: z.unknown(),
  published_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  twin: z.boolean(),
  preview: z.boolean().optional(),
})
export type CmsPublic = z.infer<typeof CmsPublic>

/** An address for a page of this kind */
export const pathOf = (kind: CmsKind, slug: string) => (kind === 'article' ? `/artikler/${slug}` : `/${slug}`)

/** «Kartlegging av arbeidsmiljø 2026» → «kartlegging-av-arbeidsmiljo-2026» */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
}

/**
 * A [placeholder] the author has still to fill in: square brackets once every [label](link) is
 * read as its label, so a link inside a placeholder does not hide it. The same rule as
 * app.cms_placeholder_left, which refuses to publish while one is left.
 */
export function placeholders(value: unknown): string[] {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      const text = v.replace(/\[([^[\]\n]*)\]\([^)\s]*\)/g, '$1')
      for (const m of text.matchAll(/\[[^[\]\n]{1,80}\]/g)) out.push(m[0])
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(value)
  return [...new Set(out)]
}
