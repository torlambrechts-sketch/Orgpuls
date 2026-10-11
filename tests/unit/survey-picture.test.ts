import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The home page's picture of the survey is drawn in the language the site's employees answer in
 * (lib/site/own.ts surveyPictureLocale, D-276), and never in two at once: on Sweden's site, English,
 * so the page never shows a Swedish survey that no Swedish employee gets.
 */
let host = 'se.orgpuls.com'
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host }) }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const load = async (h: string, flags = '') => {
  host = h
  vi.stubEnv('ORGPULS_FLAGS', flags)
  vi.resetModules()
  return (await import('@/lib/site/own')).surveyPictureLocale()
}

describe('the survey’s picture on a public page', () => {
  it('is English on Sweden’s site while the survey does not offer Swedish', async () => {
    expect(await load('se.orgpuls.com')).toBe('en')
  })

  it('stays English once Swedish is switched on, while the survey page’s Swedish words live in the registry', async () => {
    // a drawing in Swedish would put the catalogue's English page words around Swedish statements
    expect(await load('se.orgpuls.com', 'locale_sv')).toBe('en')
    expect(await load('se.orgpuls.com', '*')).toBe('en')
  })

  it('is the page’s own language on Empvibe’s site and on Norway’s', async () => {
    expect(await load('www.empvibe.com')).toBeNull()
    expect(await load('www.orgpuls.com')).toBeNull()
  })
})
