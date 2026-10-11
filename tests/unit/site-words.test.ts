import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { changesLanguage, PAGE_LANG_HEADER, SE_PAGES } from '@/lib/hosts'
import { applyOverrides } from '@/lib/i18n/override-tree'

/**
 * Whose words a public page shows, and in which language (lib/i18n/request.ts, D-276), run through
 * the request config itself rather than read off its source:
 *  - the site's words (site, seo, start) are the host's site's, whoever is signed in: a member of a
 *    Norwegian organisation on Sweden's site reads Sweden's pages, a member of a Swedish one on
 *    www.orgpuls.com reads Norway's, and a member of a UK one on Sweden's site is not told it is on
 *    Empvibe's;
 *  - a site of its own's page is in its language only when the middleware names that language;
 *    a header naming another language, or on another host, asks for nothing.
 */
const req: { host: string; header?: string; cookie?: string; market: string } = { host: 'se.orgpuls.com', market: 'se' }

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: req.host, ...(req.header ? { [PAGE_LANG_HEADER]: req.header } : {}) }),
  cookies: async () => ({ get: (name: string) => (name === 'NEXT_LOCALE' && req.cookie ? { value: req.cookie } : undefined) }),
}))
vi.mock('next-intl/server', () => ({ getRequestConfig: (fn: unknown) => fn }))
vi.mock('@/lib/i18n/market', () => ({ requestMarket: async () => req.market }))
vi.mock('@/lib/i18n/survey-texts', () => ({ surveyTexts: async () => ({}) }))
vi.mock('@/lib/i18n/overrides', () => ({ applyOverrides, messageOverrides: async () => ({}) }))

type Tree = { [k: string]: unknown }
type Config = { locale: string; messages: Tree }
const at = (tree: unknown, key: string): unknown => key.split('.').reduce<unknown>((o, p) => (o as Tree | undefined)?.[p], tree)
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Tree
const sePack = read('messages/market/se/sv.json')
const en = read('messages/en.json')
const no = read('messages/no.json')

async function config(r: typeof req): Promise<Config> {
  Object.assign(req, { header: undefined, cookie: undefined }, r)
  const make = (await import('@/lib/i18n/request')).default as unknown as (p: { locale?: string }) => Promise<Config>
  return make({})
}

afterEach(() => vi.resetModules())

describe('the site’s words are the host’s site’s', () => {
  // a page word only Sweden's pack says, and one only Norway's catalogue says
  const KEY = 'seo.lp.lovkrav.title'

  it('a member of a Norwegian organisation on Sweden’s site reads Sweden’s page', async () => {
    const c = await config({ host: 'se.orgpuls.com', header: 'sv', market: 'no' })
    expect(c.locale).toBe('sv')
    expect(at(c.messages, KEY)).toBe(at(sePack, KEY))
  })

  it('a member of a Swedish organisation on www.orgpuls.com reads Norway’s page, in either language', async () => {
    const inSwedish = await config({ host: 'www.orgpuls.com', cookie: 'sv', market: 'se' })
    expect(at(inSwedish.messages, KEY)).not.toBe(at(sePack, KEY))
    expect(at(inSwedish.messages, KEY)).toBe(at(en, KEY))
    const inNorwegian = await config({ host: 'www.orgpuls.com', cookie: 'no', market: 'se' })
    expect(at(inNorwegian.messages, KEY)).toBe(at(no, KEY))
    // Sweden's English chrome stays on Sweden's site
    expect(at(inNorwegian.messages, 'site.chrome.nav.plattform')).toBe(at(no, 'site.chrome.nav.plattform'))
  })

  it('a member of a UK organisation on Sweden’s site reads Orgpuls, not Empvibe', async () => {
    const c = await config({ host: 'se.orgpuls.com', header: 'sv', market: 'gb' })
    expect(String(at(c.messages, 'site.chrome.footer.bottom'))).toContain('Orgpuls')
    expect(String(at(c.messages, 'site.chrome.footer.bottom'))).not.toContain('Empvibe')
    expect(at(c.messages, KEY)).toBe(at(sePack, KEY))
  })

  it('leaves everything else to the reader’s organisation', async () => {
    // the product's legal texts for a Swedish organisation on Norway's host: Sweden's law
    const swedish = await config({ host: 'www.orgpuls.com', cookie: 'sv', market: 'se' })
    expect(at(swedish.messages, 'oppsett.lovmodus.lead')).toBe(at(sePack, 'oppsett.lovmodus.lead'))
    // and for a Norwegian organisation on Sweden's host: Norway's
    const norwegian = await config({ host: 'se.orgpuls.com', cookie: 'no', market: 'no' })
    expect(at(norwegian.messages, 'oppsett.lovmodus.lead')).toBe(at(no, 'oppsett.lovmodus.lead'))
  })
})

describe('a site of its own’s page language', () => {
  it('is the site’s when the middleware names it, whatever the reader chose', async () => {
    expect((await config({ host: 'se.orgpuls.com', header: 'sv', cookie: 'en', market: 'se' })).locale).toBe('sv')
  })

  it('is the reader’s choice off the site’s pages: signing in and up', async () => {
    expect((await config({ host: 'se.orgpuls.com', cookie: 'en', market: 'se' })).locale).toBe('en')
  })

  it('cannot be asked for in another language, or on another host', async () => {
    expect((await config({ host: 'se.orgpuls.com', header: 'en', cookie: 'sv', market: 'se' })).locale).toBe('sv')
    expect((await config({ host: 'se.orgpuls.com', header: 'en', market: 'se' })).locale).toBe('sv')
    expect((await config({ host: 'www.orgpuls.com', header: 'sv', cookie: 'no', market: 'no' })).locale).toBe('no')
  })
})

describe('a link that changes the page’s language is a page load', () => {
  it('on Sweden’s site, between its pages and signing in or up', () => {
    expect(changesLanguage(SE_PAGES, '/', '/logg-inn')).toBe(true)
    expect(changesLanguage(SE_PAGES, '/logg-inn', '/plattform#tiltak')).toBe(true)
    expect(changesLanguage(SE_PAGES, '/registrer', '/registrer?orgnr=5599999991')).toBe(false)
    expect(changesLanguage(SE_PAGES, '/', '/lovkrav')).toBe(false)
    expect(changesLanguage(SE_PAGES, '/', 'mailto:hjelp@orgpuls.no')).toBe(false)
  })

  it('never on a site in one language, or on Norway’s', () => {
    expect(changesLanguage(undefined, '/', '/logg-inn')).toBe(false)
  })
})
