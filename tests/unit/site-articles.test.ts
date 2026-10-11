import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Each site's articles, as a request on its host gets them (D-278), run through the readers themselves
 * rather than read off their source: which set `siteArticles()` returns, the card a page names, the
 * Article object's values on Norway's site, the sitemap and llms.txt. What would go wrong silently: a
 * site showing another's articles, an Empvibe article's card falling back to the site's default, or
 * Norway's JSON-LD, sitemap or llms.txt changing under it.
 */
let host = 'www.empvibe.com'
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host }) }))
vi.mock('@/lib/site/indexing', () => ({ siteIndexing: async () => true }))
// a message is its own key, so the output names what each line reads
vi.mock('next-intl/server', () => ({
  getTranslations: async () => {
    const t = (key: string) => key
    return Object.assign(t, { raw: (key: string) => key })
  },
  getLocale: async () => 'en',
}))

afterEach(() => vi.resetModules())

const on = async (h: string) => {
  host = h
  vi.resetModules()
}

describe('the articles a host’s request gets', () => {
  it('is Norway’s on Norway’s hosts and on a host that is not a site, Empvibe’s on Empvibe’s, none on Sweden’s', async () => {
    const { ARTICLES } = await import('@/lib/marketing/site')
    const { EMPVIBE_ARTICLES } = await import('@/lib/marketing/articles-empvibe')
    for (const [h, expected] of [
      ['www.orgpuls.com', ARTICLES],
      ['localhost:3000', ARTICLES],
      ['www.empvibe.com', EMPVIBE_ARTICLES],
      ['empvibe.com', EMPVIBE_ARTICLES],
      ['se.orgpuls.com', []],
    ] as const) {
      await on(h)
      const set = await (await import('@/lib/site/own')).siteArticles()
      expect(set.articles.map((a) => a.slug), h).toEqual(expected.map((a) => a.slug))
    }
  })

  it('links a survey’s questions to an article the site publishes', async () => {
    const { articleIn, articlesOf, NORWAY_ARTICLES } = await import('@/lib/marketing/site-articles')
    for (const set of [NORWAY_ARTICLES, articlesOf('empvibe')]) expect(articleIn(set, set.questions!), String(set.questions)).not.toBeNull()
    expect(articlesOf('se').questions).toBeNull()
  })
})

describe('an article’s card', () => {
  it('is the site’s own on a site of its own, the article’s where it has one, and Norway’s as it was', async () => {
    const { cardUrl } = await import('@/lib/marketing/meta')
    const { absolute } = await import('@/lib/marketing/site')
    await on('www.empvibe.com')
    const own = await (await import('@/lib/site/own')).ownSite()
    expect(cardUrl(own, '/og/artikler/hse-indicator-tool.png')).toBe('https://www.empvibe.com/og/empvibe/artikler/hse-indicator-tool.png')
    expect(cardUrl(own, '/og/lovkrav.png')).toBe('https://www.empvibe.com/og/empvibe/lovkrav.png')
    expect(cardUrl(own, undefined)).toBe('https://www.empvibe.com/og/empvibe/default.png')
    // Norway's: the image as it was given, on www.orgpuls.com
    expect(cardUrl(null, '/og/artikler/medarbeiderundersokelse.png')).toBe(absolute('/og/artikler/medarbeiderundersokelse.png'))
    expect(cardUrl(null, undefined)).toBe(absolute('/og.png'))
  })
})

describe('the Article object', () => {
  it('keeps Norway’s values where no site is named, and names Empvibe’s where it is', async () => {
    const { article } = await import('@/lib/marketing/schema')
    const base = { path: '/artikler/x', headline: 'X­', description: 'D', published: '2026-10-01', modified: '2026-10-02', words: 10, image: 'https://www.orgpuls.com/og/artikler/x.png' }
    expect(article({ ...base, locale: 'no' })).toEqual({
      '@type': 'Article',
      headline: 'X',
      description: 'D',
      inLanguage: 'nb-NO',
      datePublished: '2026-10-01',
      dateModified: '2026-10-02',
      wordCount: 10,
      mainEntityOfPage: 'https://www.orgpuls.com/artikler/x',
      image: 'https://www.orgpuls.com/og/artikler/x.png',
      author: { '@id': 'https://www.orgpuls.com/#organization' },
      publisher: { '@id': 'https://www.orgpuls.com/#organization' },
    })
    expect(article({ ...base, locale: 'en' }).inLanguage).toBe('en')
    await on('www.empvibe.com')
    const site = await (await import('@/lib/marketing/schema')).siteLd()
    const uk = (await import('@/lib/marketing/schema')).article({ ...base, path: '/artikler/hse-indicator-tool', site })
    expect(uk.inLanguage).toBe('en-GB')
    expect(uk.mainEntityOfPage).toBe('https://www.empvibe.com/articles/hse-indicator-tool')
    expect(uk.publisher).toEqual({ '@id': 'https://www.empvibe.com/#organization' })
  })
})

describe('the sitemap and llms.txt', () => {
  it('list Empvibe’s articles at its addresses, with their dates, and none of Norway’s', async () => {
    const { EMPVIBE_ARTICLES } = await import('@/lib/marketing/articles-empvibe')
    await on('www.empvibe.com')
    const map = await (await import('@/app/sitemap')).default()
    const urls = map.map((e) => e.url)
    expect(urls).toContain('https://www.empvibe.com/articles')
    for (const a of EMPVIBE_ARTICLES) {
      const e = map.find((x) => x.url === `https://www.empvibe.com/articles/${a.slug}`)
      expect(e?.lastModified, a.slug).toBe(a.modified)
    }
    expect(urls.some((u) => u.includes('/artikler'))).toBe(false)
    const llms = await (await (await import('@/app/llms.txt/route')).GET()).text()
    expect(llms).toContain('## seo.llms.articles')
    for (const a of EMPVIBE_ARTICLES) expect(llms).toContain(`(https://www.empvibe.com/articles/${a.slug}): seo.articles.${a.key}.description`)
  })

  it('leave Norway’s articles where they were, and give Sweden none', async () => {
    const { ARTICLES } = await import('@/lib/marketing/site')
    await on('www.orgpuls.com')
    const norway = (await (await import('@/app/sitemap')).default()).map((e) => e.url)
    for (const a of ARTICLES) expect(norway).toContain(`https://www.orgpuls.com/artikler/${a.slug}`)
    expect(norway.some((u) => u.includes('/articles'))).toBe(false)
    await on('se.orgpuls.com')
    const sweden = (await (await import('@/app/sitemap')).default()).map((e) => e.url)
    expect(sweden.some((u) => /artikler|articles/.test(u))).toBe(false)
    const llms = await (await (await import('@/app/llms.txt/route')).GET()).text()
    expect(llms).not.toContain('seo.llms.articles')
  })
})
