import 'server-only'
import { bareTitle } from './analytics'
import { isError } from './api'
import { cmsPages } from './cms'
import { catalogues, designedMeta } from './cmsSite'
import { parseContent, pathOf } from '@/lib/cms/content'
import { designedPages, type DesignedGroup } from '@/lib/cms/designed'

/**
 * What a path of the public site is called and what kind of page it is (X-095), for a table of the
 * site's traffic: the designed pages by their title as a reader gets it (X-094), the pages made in the
 * CMS by their heading. A path that is neither — an old address, a page since removed — keeps no name.
 */
export type PageKind = 'page' | 'landing' | 'industry' | 'article'
export type PageName = { title: string; kind: PageKind }

const DESIGNED_KIND: Record<DesignedGroup, PageKind> = { home: 'page', site: 'page', index: 'page', landing: 'landing', industry: 'industry', article: 'article' }
const LANDING_TEMPLATES = new Set(['landingsside', 'kampanjeside'])

export async function pageNames(): Promise<Map<string, PageName>> {
  const [cat, made] = await Promise.all([catalogues(), cmsPages()])
  const names = new Map<string, PageName>()
  for (const p of designedPages()) {
    const meta = designedMeta(p, cat)
    const title = (meta.no ?? meta.en)?.title
    if (title) names.set(p.path, { title: bareTitle(title), kind: DESIGNED_KIND[p.group] })
  }
  if (!isError(made)) {
    for (const p of made.rows) {
      const first = p.locales.find((l) => l.locale === 'no') ?? p.locales[0]
      const c = parseContent(first?.draft ?? {})
      names.set(pathOf(p.kind, p.slug), {
        title: bareTitle(c?.h1 || c?.title || p.slug),
        kind: p.kind === 'article' ? 'article' : LANDING_TEMPLATES.has(p.template) ? 'landing' : 'page',
      })
    }
  }
  return names
}
